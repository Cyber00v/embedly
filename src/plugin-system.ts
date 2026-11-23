export const PLUGIN_ARCHIVE_MAX_BYTES = 5 * 1024 * 1024;
export const PLUGIN_CONTENT_MAX_BYTES = 1024 * 1024;
export const PLUGIN_ARCHIVE_FILES = [
  "plugin.json",
  "index.html",
  "style.css",
  "script.js",
] as const;
export const PLUGIN_CATALOG_MAX_BYTES = 64 * 1024;
export const PLUGIN_CATALOG_MAX_PLUGINS = 100;

export type PluginPropertyType =
  | "text"
  | "number"
  | "boolean"
  | "color"
  | "select";

export type PluginLanguage = "en" | "ar";

export interface PluginPropertyLocalization {
  label?: string;
  options?: Record<string, string>;
}

export interface PluginLocalization {
  title?: string;
  group?: string;
  description?: string;
  properties?: Record<string, PluginPropertyLocalization>;
}

export interface PluginProperty {
  key: string;
  label: string;
  type: PluginPropertyType;
  default: string | number | boolean;
  options?: string[];
  optionLabels?: Record<string, string>;
}

export interface PluginDefinition {
  id: string;
  title: string;
  group: string;
  description: string;
  icon: string;
  version: string;
  html: string;
  css: string;
  js: string;
  properties: PluginProperty[];
  events: string[];
  acceptsChildren: boolean;
  localizations?: Partial<Record<PluginLanguage, PluginLocalization>>;
}

export interface PluginComponent {
  id: string;
  name: string;
  html: string;
  css: string;
  plugin: Omit<PluginDefinition, "title" | "html" | "css">;
}

export type PluginFolderReader = (path: string) => Promise<string>;

interface ZipEntry {
  dir: boolean;
  _data?: { uncompressedSize?: number };
  async(type: "string"): Promise<string>;
}

interface ZipArchive {
  files: Record<string, ZipEntry>;
  file(path: string): ZipEntry | null;
}

interface ZipConstructor {
  loadAsync(data: ArrayBuffer): Promise<ZipArchive>;
}

interface PluginHost extends HTMLElement {
  __takweenPluginCleanup?: () => void;
  __takweenPluginFunctions?: Map<string, (...args: unknown[]) => unknown>;
  __takweenPluginPendingUpdate?: boolean;
}

const SAFE_ID = /^[a-z][a-z0-9-]{1,63}$/;
const SAFE_PROPERTY_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const SAFE_PLUGIN_EVENT = /^on[A-Z][A-Za-z0-9]{0,61}$/;
const RESERVED_PLUGIN_EVENTS = new Set([
  "onFilesSelected",
  "onItemRender",
  "onItemDidRender",
]);
const ALLOWED_PROPERTY_TYPES = new Set<PluginPropertyType>([
  "text",
  "number",
  "boolean",
  "color",
  "select",
]);
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.length > maxLength)
    throw new Error(`Plugin ${field} must be a string of at most ${maxLength} characters.`);
  return value;
}

export function normalizePluginProperties(
  plugin: Pick<PluginDefinition, "properties">,
  values: unknown,
): Record<string, string | number | boolean> {
  const source = isRecord(values) ? values : {};
  const normalized: Record<string, string | number | boolean> = {};

  for (const property of plugin.properties) {
    const value = source[property.key];
    if (property.type === "boolean") {
      normalized[property.key] =
        typeof value === "boolean"
          ? value
          : value === "true"
            ? true
            : value === "false"
              ? false
              : Boolean(property.default);
    } else if (property.type === "number") {
      const numberValue =
        typeof value === "number"
          ? value
          : typeof value === "string" && value.trim()
            ? Number(value)
            : Number.NaN;
      normalized[property.key] = Number.isFinite(numberValue)
        ? numberValue
        : Number(property.default);
    } else if (property.type === "select") {
      normalized[property.key] =
        typeof value === "string" &&
        property.options?.includes(value)
          ? value
          : String(property.default);
    } else if (property.type === "color") {
      const color = typeof value === "string" ? value : property.default;
      normalized[property.key] =
        typeof color === "string" && /^#[\da-f]{6}$/i.test(color)
          ? color
          : String(property.default);
    } else {
      normalized[property.key] =
        typeof value === "string"
          ? value.slice(0, 1000)
          : String(property.default);
    }
  }

  return normalized;
}

export function normalizePluginManifest(
  value: unknown,
  html: string,
  css: string,
  js: string,
): PluginDefinition {
  if (!isRecord(value))
    throw new Error("Plugin metadata must be a JSON object.");

  const id = readText(value.id, "id", 64);
  if (!SAFE_ID.test(id))
    throw new Error("Plugin id must use lowercase letters, numbers, and hyphens.");

  const title = readText(value.title, "title", 60).trim();
  const group = readText(value.group, "group", 40).trim();
  if (!title || !group)
    throw new Error("Plugin title and group are required.");

  const description =
    value.description == null
      ? ""
      : readText(value.description, "description", 240);
  const icon =
    value.icon == null
      ? "fa-puzzle-piece"
      : readText(value.icon, "icon", 60);
  if (!/^fa-[a-z0-9-]+$/.test(icon))
    throw new Error("Plugin icon must be a Font Awesome icon class.");

  const version =
    value.version == null
      ? "1.0.0"
      : readText(value.version, "version", 32);
  if (!version.trim()) throw new Error("Plugin version cannot be empty.");

  if (
    value.acceptsChildren != null &&
    typeof value.acceptsChildren !== "boolean"
  )
    throw new Error("Plugin acceptsChildren must be a boolean.");
  const acceptsChildren = value.acceptsChildren === true;
  const normalizedHtml = readText(html, "HTML", PLUGIN_CONTENT_MAX_BYTES);
  if (
    acceptsChildren &&
    !/<slot\b(?![^>]*\bname\s*=)[^>]*>/i.test(normalizedHtml)
  )
    throw new Error("A container plugin must include a default <slot> in its HTML.");

  const rawEvents = value.events ?? [];
  if (!Array.isArray(rawEvents) || rawEvents.length > 20)
    throw new Error("Plugin events must be an array with at most 20 entries.");
  const eventNames = new Set<string>();
  const events = rawEvents.map((entry) => {
    const eventName = readText(entry, "event name", 64).trim();
    if (
      !SAFE_PLUGIN_EVENT.test(eventName) ||
      RESERVED_PLUGIN_EVENTS.has(eventName) ||
      eventNames.has(eventName)
    )
      throw new Error(`Plugin event "${eventName}" is invalid or duplicated.`);
    eventNames.add(eventName);
    return eventName;
  });

  const rawProperties = value.properties ?? [];
  if (!Array.isArray(rawProperties) || rawProperties.length > 20)
    throw new Error("Plugin properties must be an array with at most 20 entries.");
  const propertyKeys = new Set<string>();
  const properties = rawProperties.map((entry): PluginProperty => {
    if (!isRecord(entry))
      throw new Error("Each plugin property must be a JSON object.");
    const key = readText(entry.key, "property key", 40);
    if (
      !SAFE_PROPERTY_KEY.test(key) ||
      ["__proto__", "prototype", "constructor"].includes(key) ||
      propertyKeys.has(key)
    )
      throw new Error(`Plugin property key "${key}" is invalid or duplicated.`);
    propertyKeys.add(key);

    const type = entry.type;
    if (
      typeof type !== "string" ||
      !ALLOWED_PROPERTY_TYPES.has(type as PluginPropertyType)
    )
      throw new Error(`Plugin property "${key}" has an unsupported type.`);
    const label = readText(entry.label, `property "${key}" label`, 60).trim();
    if (!label) throw new Error(`Plugin property "${key}" needs a label.`);

    let options: string[] | undefined;
    if (type === "select") {
      if (
        !Array.isArray(entry.options) ||
        entry.options.length < 1 ||
        entry.options.length > 30 ||
        entry.options.some(
          (option) => typeof option !== "string" || option.length > 100,
        )
      )
        throw new Error(`Plugin select property "${key}" needs valid options.`);
      options = [...new Set(entry.options as string[])];
      if (!options.length)
        throw new Error(`Plugin select property "${key}" needs valid options.`);
    }

    let defaultValue: string | number | boolean;
    if (type === "boolean") {
      if (entry.default != null && typeof entry.default !== "boolean")
        throw new Error(`Plugin property "${key}" needs a boolean default.`);
      defaultValue = entry.default === true;
    } else if (type === "number") {
      if (entry.default != null && typeof entry.default !== "number")
        throw new Error(`Plugin property "${key}" needs a numeric default.`);
      defaultValue =
        typeof entry.default === "number" && Number.isFinite(entry.default)
          ? entry.default
          : 0;
    } else {
      if (entry.default != null && typeof entry.default !== "string")
        throw new Error(`Plugin property "${key}" needs a string default.`);
      defaultValue =
        typeof entry.default === "string" ? entry.default.slice(0, 1000) : "";
      if (type === "color" && !/^#[\da-f]{6}$/i.test(defaultValue))
        defaultValue = "#000000";
      if (type === "select" && !options?.includes(defaultValue))
        defaultValue = options?.[0] || "";
    }

    return {
      key,
      label,
      type: type as PluginPropertyType,
      default: defaultValue,
      ...(options ? { options } : {}),
    };
  });

  const rawLocalizations = value.localizations ?? {};
  if (!isRecord(rawLocalizations))
    throw new Error("Plugin localizations must be an object.");
  const localizations: Partial<
    Record<PluginLanguage, PluginLocalization>
  > = {};
  const readLocalizedText = (
    source: Record<string, unknown>,
    key: string,
    field: string,
    maxLength: number,
  ) => {
    if (source[key] === undefined) return undefined;
    const text = readText(source[key], field, maxLength).trim();
    if (!text) throw new Error(`${field} cannot be empty.`);
    return text;
  };

  (["en", "ar"] as const).forEach((language) => {
    const source = rawLocalizations[language];
    if (source === undefined) return;
    if (!isRecord(source))
      throw new Error(`Plugin ${language} localization must be an object.`);

    const rawLocalizedProperties = source.properties ?? {};
    if (!isRecord(rawLocalizedProperties))
      throw new Error(`Plugin ${language} localized properties must be an object.`);
    const localizedProperties: Record<string, PluginPropertyLocalization> = {};
    Object.entries(rawLocalizedProperties).forEach(
      ([propertyKey, rawProperty]) => {
        const property = properties.find((item) => item.key === propertyKey);
        if (!property || !isRecord(rawProperty))
          throw new Error(
            `Plugin ${language} localization references an invalid property.`,
          );
        const label = readLocalizedText(
          rawProperty,
          "label",
          `Plugin ${language} property "${propertyKey}" label`,
          60,
        );
        const rawOptions = rawProperty.options;
        let options: Record<string, string> | undefined;
        if (rawOptions !== undefined) {
          if (property.type !== "select" || !isRecord(rawOptions))
            throw new Error(
              `Plugin ${language} option labels require a select property.`,
            );
          const optionLabels: [string, string][] = [];
          Object.entries(rawOptions).forEach(([option, optionLabel]) => {
            if (
              !property.options?.includes(option) ||
              typeof optionLabel !== "string" ||
              optionLabel.length > 100 ||
              !optionLabel.trim()
            )
              throw new Error(
                `Plugin ${language} has an invalid label for option "${option}".`,
              );
            optionLabels.push([option, optionLabel.trim()]);
          });
          options = Object.fromEntries(optionLabels);
        }
        localizedProperties[propertyKey] = {
          ...(label ? { label } : {}),
          ...(options ? { options } : {}),
        };
      },
    );

    const title = readLocalizedText(
      source,
      "title",
      `Plugin ${language} title`,
      60,
    );
    const group = readLocalizedText(
      source,
      "group",
      `Plugin ${language} group`,
      40,
    );
    const description = readLocalizedText(
      source,
      "description",
      `Plugin ${language} description`,
      240,
    );
    localizations[language] = {
      ...(title ? { title } : {}),
      ...(group ? { group } : {}),
      ...(description ? { description } : {}),
      ...(Object.keys(localizedProperties).length
        ? { properties: localizedProperties }
        : {}),
    };
  });

  return {
    id,
    title,
    group,
    description,
    icon,
    version,
    html: normalizedHtml,
    css: readText(css, "CSS", PLUGIN_CONTENT_MAX_BYTES),
    js: readText(js, "JavaScript", PLUGIN_CONTENT_MAX_BYTES),
    properties,
    events,
    acceptsChildren,
    ...(Object.keys(localizations).length ? { localizations } : {}),
  };
}

export function localizePluginDefinition(
  plugin: PluginDefinition,
  language: PluginLanguage,
): PluginDefinition {
  const localization = plugin.localizations?.[language];
  return {
    ...plugin,
    title: localization?.title ?? plugin.title,
    group: localization?.group ?? plugin.group,
    description: localization?.description ?? plugin.description,
    properties: plugin.properties.map((property) => {
      const propertyLocalization =
        localization?.properties?.[property.key];
      return {
        ...property,
        label: propertyLocalization?.label ?? property.label,
        ...(propertyLocalization?.options
          ? { optionLabels: propertyLocalization.options }
          : {}),
      };
    }),
  };
}

export function createPluginComponent(plugin: PluginDefinition): PluginComponent {
  const { title, html, css, ...metadata } = plugin;
  return {
    id: plugin.id,
    name: title,
    html,
    css,
    plugin: metadata,
  };
}

export async function loadPluginCatalog(
  readFile: PluginFolderReader,
): Promise<PluginComponent[]> {
  const catalogText = await readFile("plugins.json");
  if (new TextEncoder().encode(catalogText).length > PLUGIN_CATALOG_MAX_BYTES)
    throw new Error("Plugin catalog exceeds the 64 KB limit.");

  let catalog: unknown;
  try {
    catalog = JSON.parse(catalogText);
  } catch {
    throw new Error("Plugin catalog plugins.json is not valid JSON.");
  }
  if (
    !isRecord(catalog) ||
    !Array.isArray(catalog.plugins) ||
    catalog.plugins.length > PLUGIN_CATALOG_MAX_PLUGINS ||
    catalog.plugins.some(
      (id) => typeof id !== "string" || !SAFE_ID.test(id),
    ) ||
    new Set(catalog.plugins).size !== catalog.plugins.length
  )
    throw new Error("Plugin catalog must list unique valid plugin IDs.");

  return Promise.all(
    catalog.plugins.map(async (id) => {
      const fileNames = ["plugin.json", "index.html", "style.css", "script.js"];
      const fileContents = await Promise.all(
        fileNames.map((fileName) => readFile(`${id}/${fileName}`)),
      );
      const fileSizes = fileContents.map(
        (content) => new TextEncoder().encode(content).length,
      );
      if (fileSizes.some((size) => size > PLUGIN_CONTENT_MAX_BYTES))
        throw new Error(`Plugin "${id}" contains a file larger than 1 MB.`);
      if (fileSizes.reduce((total, size) => total + size, 0) > 2 * PLUGIN_CONTENT_MAX_BYTES)
        throw new Error(`Plugin "${id}" expanded content exceeds 2 MB.`);

      let metadata: unknown;
      try {
        metadata = JSON.parse(fileContents[0]);
      } catch {
        throw new Error(`Plugin "${id}" has invalid plugin.json metadata.`);
      }

      const plugin = normalizePluginManifest(
        metadata,
        fileContents[1],
        fileContents[2],
        fileContents[3],
      );
      if (plugin.id !== id)
        throw new Error(`Plugin folder "${id}" must match its metadata ID.`);
      try {
        new Function("root", "pluginContext", "window", plugin.js);
      } catch (error) {
        throw new Error(`Plugin "${id}" has invalid JavaScript.`, {
          cause: error,
        });
      }
      return createPluginComponent(plugin);
    }),
  );
}

export function normalizeStoredPluginComponent(
  component: Record<string, unknown>,
): PluginComponent | null {
  if (!Object.hasOwn(component, "plugin")) return null;
  if (!isRecord(component.plugin))
    throw new Error("Saved plugin metadata must be a JSON object.");
  if (typeof component.plugin.js !== "string")
    throw new Error("Saved plugin JavaScript is missing.");
  const plugin = normalizePluginManifest(
    {
      ...component.plugin,
      id: component.id,
      title: component.name,
    },
    typeof component.html === "string" ? component.html : "",
    typeof component.css === "string" ? component.css : "",
    typeof component.plugin.js === "string" ? component.plugin.js : "",
  );
  return createPluginComponent(plugin);
}

export function getPluginDefinition(
  component: unknown,
): PluginDefinition | null {
  if (!isRecord(component) || !Object.hasOwn(component, "plugin")) return null;
  if (!isRecord(component.plugin))
    throw new Error("Plugin metadata must be a JSON object.");
  if (typeof component.plugin.js !== "string")
    throw new Error("Plugin JavaScript is missing.");
  return normalizePluginManifest(
    {
      ...component.plugin,
      id: component.id,
      title: component.name,
    },
    typeof component.html === "string" ? component.html : "",
    typeof component.css === "string" ? component.css : "",
    typeof component.plugin.js === "string" ? component.plugin.js : "",
  );
}

export async function importPluginArchive(
  file: File,
  zipLibrary: ZipConstructor,
): Promise<PluginDefinition> {
  if (!file.name.toLowerCase().endsWith(".zip"))
    throw new Error("Choose a .zip plugin archive.");
  if (file.size <= 0 || file.size > PLUGIN_ARCHIVE_MAX_BYTES)
    throw new Error("Plugin ZIP files must be between 1 byte and 5 MB.");

  const archive = await zipLibrary.loadAsync(await file.arrayBuffer());
  const entries = Object.entries(archive.files);
  if (
    entries.length !== PLUGIN_ARCHIVE_FILES.length ||
    entries.some(([name, entry]) => !PLUGIN_ARCHIVE_FILES.includes(name as (typeof PLUGIN_ARCHIVE_FILES)[number]) || entry.dir)
  )
    throw new Error(
      "Plugin ZIP must contain only plugin.json, index.html, style.css, and script.js at its root.",
    );

  let totalSize = 0;
  for (const name of PLUGIN_ARCHIVE_FILES) {
    const entry = archive.files[name];
    const size = entry?._data?.uncompressedSize;
    if (!entry || !Number.isFinite(size) || size! > PLUGIN_CONTENT_MAX_BYTES)
      throw new Error(`Plugin file "${name}" is missing or larger than 1 MB.`);
    totalSize += size!;
  }
  if (totalSize > 2 * PLUGIN_CONTENT_MAX_BYTES)
    throw new Error("Expanded plugin content must not exceed 2 MB.");

  const [metadataText, html, css, js] = await Promise.all(
    PLUGIN_ARCHIVE_FILES.map((name) => archive.file(name)!.async("string")),
  );
  let metadata: unknown;
  try {
    metadata = JSON.parse(metadataText);
  } catch {
    throw new Error("Plugin metadata file plugin.json is not valid JSON.");
  }
  const plugin = normalizePluginManifest(metadata, html, css, js);
  try {
    new Function("root", "pluginContext", "window", plugin.js);
  } catch (error) {
    throw new Error(
      "Plugin JavaScript is invalid: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  return plugin;
}

export function mountPluginElements(
  root: ParentNode,
  definitions: Record<string, PluginDefinition>,
  onPropertyChange?: (
    host: HTMLElement,
    key: string,
    value: string | number | boolean,
  ) => void,
): void {
  const hosts: PluginHost[] = [
    ...(root instanceof HTMLElement && root.matches("[data-plugin-id]")
      ? [root as PluginHost]
      : []),
    ...root.querySelectorAll<PluginHost>("[data-plugin-id]"),
  ];

  hosts.forEach((host) => {
    const plugin = definitions[host.dataset.pluginId || ""];
    if (!plugin) {
      console.error("Plugin definition is unavailable:", host.dataset.pluginId);
      const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
      shadow.replaceChildren();
      const message = document.createElement("div");
      message.setAttribute("role", "alert");
      message.textContent =
        "Plugin definition is unavailable: " + (host.dataset.pluginId || "");
      shadow.append(message);
      return;
    }

    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    const previousCleanup = host.__takweenPluginCleanup;
    delete host.__takweenPluginCleanup;
    if (typeof previousCleanup === "function") {
      try {
        previousCleanup();
      } catch (error) {
        console.error("Plugin cleanup failed:", plugin.id, error);
      }
    }
    const exportedFunctions = new Map<
      string,
      (...args: unknown[]) => unknown
    >();
    host.__takweenPluginFunctions = exportedFunctions;

    try {
      let storedProperties: unknown = {};
      if (host.dataset.pluginProperties) {
        try {
          storedProperties = JSON.parse(host.dataset.pluginProperties);
        } catch {
          throw new Error("Plugin property data is not valid JSON.");
        }
      }
      const source = Object.fromEntries(
        storedProperties &&
          typeof storedProperties === "object" &&
          !Array.isArray(storedProperties)
          ? Object.entries(storedProperties)
          : [],
      );
      const properties = Object.fromEntries(
        plugin.properties.map((property) => {
          const value = source[property.key];
          if (property.type === "boolean")
            return [
              property.key,
              typeof value === "boolean"
                ? value
                : value === "true"
                  ? true
                  : value === "false"
                    ? false
                    : Boolean(property.default),
            ];
          if (property.type === "number") {
            const numberValue =
              typeof value === "number"
                ? value
                : typeof value === "string" && value.trim()
                  ? Number(value)
                  : Number.NaN;
            return [
              property.key,
              Number.isFinite(numberValue)
                ? numberValue
                : Number(property.default),
            ];
          }
          if (property.type === "select")
            return [
              property.key,
              typeof value === "string" &&
              property.options?.includes(value)
                ? value
                : String(property.default),
            ];
          if (property.type === "color") {
            const color = typeof value === "string" ? value : property.default;
            return [
              property.key,
              typeof color === "string" && /^#[\da-f]{6}$/i.test(color)
                ? color
                : String(property.default),
            ];
          }
          return [
            property.key,
            typeof value === "string"
              ? value.slice(0, 1000)
              : String(property.default),
          ];
        }),
      );
      host.dataset.pluginProperties = JSON.stringify(properties);
      shadow.replaceChildren();

      const style = document.createElement("style");
      style.textContent =
        `:host { display: block; min-width: 0; color: inherit; font: inherit; }\n${plugin.css}`;
      const content = document.createElement("div");
      content.innerHTML = plugin.html.replace(
        /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g,
        (match, key: string) =>
          Object.hasOwn(properties, key)
            ? String(properties[key])
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll('"', "&quot;")
                .replaceAll("'", "&#39;")
            : match,
      );
      shadow.append(style, content);

      const inheritedLanguage =
        host.closest?.("[lang]")?.getAttribute("lang") ||
        document.documentElement?.lang ||
        "en";
      const language = inheritedLanguage.toLowerCase().startsWith("ar")
        ? "ar"
        : "en";
      host.setAttribute(
        "aria-label",
        plugin.localizations?.[language]?.title ?? plugin.title,
      );
      const emit = (event: string, detail?: unknown) => {
        if (
          !["click", "change", "input"].includes(event) &&
          !plugin.events.includes(event)
        )
          throw new Error(`Unsupported plugin event: ${event}`);
        host.dispatchEvent(
          new CustomEvent(event, {
            bubbles: true,
            composed: true,
            detail,
          }),
        );
      };
      const pluginContext = Object.freeze({
        pluginId: plugin.id,
        language,
        properties: Object.freeze({ ...properties }),
        element: host,
        root: shadow,
        emit,
        exposeFunction: (
          name: string,
          fn: (...args: unknown[]) => unknown,
        ) => {
          if (
            typeof name !== "string" ||
            !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ||
            ["__proto__", "prototype", "constructor"].includes(name)
          )
            throw new Error("Plugin function names must be valid identifiers.");
          if (typeof fn !== "function")
            throw new Error("Plugin exports must be functions.");
          if (exportedFunctions.has(name))
            throw new Error(`Plugin function is already exported: ${name}`);
          exportedFunctions.set(name, fn);
        },
        setProperty: (key: string, value: unknown) => {
          const definition = plugin.properties.find(
            (property) => property.key === key,
          );
          if (!definition)
            throw new Error(`Unknown plugin property: ${key}`);
          let currentProperties: Record<string, unknown> = {};
          try {
            currentProperties = JSON.parse(host.dataset.pluginProperties || "{}");
          } catch {
            throw new Error("Plugin property data is not valid JSON.");
          }
          if (
            !currentProperties ||
            typeof currentProperties !== "object" ||
            Array.isArray(currentProperties)
          )
            throw new Error("Plugin property data must be an object.");
          let normalizedValue: string | number | boolean;
          if (definition.type === "boolean") {
            if (value === true || value === "true") normalizedValue = true;
            else if (value === false || value === "false")
              normalizedValue = false;
            else throw new Error("Boolean plugin properties require true or false.");
          } else if (definition.type === "number") {
            normalizedValue =
              typeof value === "number"
                ? value
                : typeof value === "string" && value.trim()
                  ? Number(value)
                  : Number.NaN;
            if (!Number.isFinite(normalizedValue))
              throw new Error("Plugin number properties require a finite number.");
          } else {
            normalizedValue = String(value ?? "");
            if (definition.type === "select" &&
              !definition.options?.includes(normalizedValue))
              throw new Error("Choose an available option for this plugin property.");
            if (definition.type === "color" &&
              !/^#[\da-f]{6}$/i.test(normalizedValue))
              throw new Error("Plugin color properties require a six-digit hex color.");
            if (definition.type === "text")
              normalizedValue = normalizedValue.slice(0, 1000);
          }
          if (Object.is(currentProperties[key], normalizedValue)) return;
          const nextProperties = {
            ...currentProperties,
            [key]: normalizedValue,
          };
          host.dataset.pluginProperties = JSON.stringify(nextProperties);
          onPropertyChange?.(host, key, normalizedValue);
          if (host.__takweenPluginPendingUpdate) return;
          host.__takweenPluginPendingUpdate = true;
          queueMicrotask(() => {
            host.__takweenPluginPendingUpdate = false;
            if (!host.isConnected) return;
            mountPluginElements(host, definitions, onPropertyChange);
            emit("change", { property: key, value: normalizedValue });
          });
        },
      });
      const pluginWindow = new Proxy(window, {
        get: (target, key) =>
          key === "pluginContext"
            ? pluginContext
            : Reflect.get(target, key, target),
        set: (target, key, value) =>
          key === "pluginContext"
            ? false
            : Reflect.set(target, key, value, target),
      });
      const cleanup = new Function(
        "root",
        "pluginContext",
        "window",
        plugin.js,
      ).call(host, shadow, pluginContext, pluginWindow);
      if (typeof cleanup === "function")
        host.__takweenPluginCleanup = cleanup;
    } catch (error) {
      exportedFunctions.clear();
      console.error("Plugin initialization failed:", plugin.id, error);
      shadow.replaceChildren();
      const message = document.createElement("div");
      message.setAttribute("role", "alert");
      message.textContent =
        "Plugin failed to initialize: " +
        (error instanceof Error ? error.message : String(error));
      shadow.append(message);
      host.dispatchEvent(
        new CustomEvent("takween-plugin:error", {
          bubbles: true,
          composed: true,
          detail: { pluginId: plugin.id, error },
        }),
      );
    }
  });
}

export function unmountPluginElements(root: ParentNode): void {
  const hosts: PluginHost[] = [
    ...(root instanceof HTMLElement && root.matches("[data-plugin-id]")
      ? [root as PluginHost]
      : []),
    ...root.querySelectorAll<PluginHost>("[data-plugin-id]"),
  ];
  hosts.forEach((host) => {
    const cleanup = host.__takweenPluginCleanup;
    delete host.__takweenPluginCleanup;
    host.__takweenPluginFunctions?.clear();
    delete host.__takweenPluginFunctions;
    if (typeof cleanup !== "function") return;
    try {
      cleanup();
    } catch (error) {
      console.error(
        "Plugin cleanup failed:",
        host.dataset.pluginId,
        error,
      );
    }
  });
}
