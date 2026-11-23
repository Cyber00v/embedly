import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createPluginComponent,
  importPluginArchive,
  loadPluginCatalog,
  localizePluginDefinition,
  mountPluginElements,
  normalizePluginManifest,
  normalizePluginProperties,
  unmountPluginElements,
} from "../src/plugin-system.ts";
import { createRuntimeBuilder } from "../src/runtime-builder.ts";

const manifest = {
  id: "weather-card",
  title: "Weather card",
  group: "Data",
  icon: "fa-cloud",
  events: ["onDaySelected"],
  properties: [
    { key: "city", label: "City", type: "text", default: "Riyadh" },
    { key: "enabled", label: "Enabled", type: "boolean", default: true },
    { key: "count", label: "Count", type: "number", default: 1 },
    {
      key: "mode",
      label: "Mode",
      type: "select",
      options: ["compact", "full"],
      default: "compact",
    },
  ],
};

test("normalizes plugin metadata and applies valid property defaults", () => {
  const plugin = normalizePluginManifest(
    manifest,
    "<p>{{city}}</p>",
    "p { color: red; }",
    "pluginContext.emit('click');",
  );

  assert.equal(plugin.id, "weather-card");
  assert.equal(plugin.acceptsChildren, false);
  assert.deepEqual(plugin.events, ["onDaySelected"]);
  assert.deepEqual(
    normalizePluginProperties(plugin, {
      enabled: "false",
      count: "3",
      mode: "invalid",
    }),
    {
      city: "Riyadh",
      enabled: false,
      count: 3,
      mode: "compact",
    },
  );
  assert.throws(
    () =>
      normalizePluginManifest(
        {
          ...manifest,
          properties: [
            manifest.properties[0],
            { ...manifest.properties[0], label: "Duplicate" },
          ],
        },
        "",
        "",
        "",
      ),
    /invalid or duplicated/,
  );
  assert.throws(
    () =>
      normalizePluginManifest(
        { ...manifest, events: ["onDaySelected", "onDaySelected"] },
        "",
        "",
        "",
      ),
    /invalid or duplicated/,
  );
  assert.throws(
    () =>
      normalizePluginManifest(
        { ...manifest, events: ["click"] },
        "",
        "",
        "",
      ),
    /invalid or duplicated/,
  );
  assert.equal(
    normalizePluginManifest(
      { ...manifest, acceptsChildren: true },
      "<section><slot></slot></section>",
      "",
      "",
    ).acceptsChildren,
    true,
  );
  assert.throws(
    () =>
      normalizePluginManifest(
        { ...manifest, acceptsChildren: true },
        "<section></section>",
        "",
        "",
      ),
    /must include a default <slot>/,
  );
  assert.throws(
      () =>
        normalizePluginManifest(
          { ...manifest, acceptsChildren: true },
          '<slot name="content"></slot>',
          "",
          "",
        ),
      /must include a default <slot>/,
  );
  assert.throws(
    () =>
      normalizePluginManifest(
        { ...manifest, acceptsChildren: "true" },
        "<slot></slot>",
        "",
        "",
      ),
    /acceptsChildren must be a boolean/,
  );
});

test("localizes plugin metadata without changing select option values", () => {
  const plugin = normalizePluginManifest(
    {
      ...manifest,
      localizations: {
        ar: {
          title: "بطاقة الطقس",
          properties: {
            mode: {
              label: "النمط",
              options: { compact: "موجز", full: "كامل" },
            },
          },
        },
      },
    },
    "<p>Hello</p>",
    "",
    "",
  );
  const localized = localizePluginDefinition(plugin, "ar");

  assert.equal(localized.title, "بطاقة الطقس");
  assert.equal(localized.properties[3].label, "النمط");
  assert.deepEqual(localized.properties[3].options, ["compact", "full"]);
  assert.deepEqual(localized.properties[3].optionLabels, {
    compact: "موجز",
    full: "كامل",
  });
  assert.throws(
    () =>
      normalizePluginManifest(
        {
          ...manifest,
          localizations: {
            ar: {
              properties: {
                mode: { options: { missing: "غير موجود" } },
              },
            },
          },
        },
        "",
        "",
        "",
      ),
    /invalid label for option/,
  );
});

test("loads listed plugins from the bundled folder and rejects invalid catalogs", async () => {
  const files = {
    "plugins.json": JSON.stringify({ plugins: ["weather-card"] }),
    "weather-card/plugin.json": JSON.stringify(manifest),
    "weather-card/index.html": "<p>{{city}}</p>",
    "weather-card/style.css": "p { color: red; }",
    "weather-card/script.js": 'pluginContext.emit("onDaySelected");',
  };
  const reads = [];
  const components = await loadPluginCatalog(async (path) => {
    reads.push(path);
    if (!Object.hasOwn(files, path)) throw new Error(`Missing ${path}`);
    return files[path];
  });

  assert.deepEqual(components.map((component) => component.id), [
    "weather-card",
  ]);
  assert.equal(components[0].plugin.events[0], "onDaySelected");
  assert.deepEqual(reads, [
    "plugins.json",
    "weather-card/plugin.json",
    "weather-card/index.html",
    "weather-card/style.css",
    "weather-card/script.js",
  ]);

  await assert.rejects(
    loadPluginCatalog(async () =>
      JSON.stringify({ plugins: ["../outside"] }),
    ),
    /unique valid plugin IDs/,
  );
  await assert.rejects(
    loadPluginCatalog(async (path) =>
      path === "plugins.json"
        ? JSON.stringify({ plugins: ["weather-card"] })
        : files[path].replace("weather-card", "another-plugin"),
    ),
    /must match its metadata ID/,
  );

  const oversizedFiles = {
    "plugins.json": JSON.stringify({ plugins: ["large-plugin"] }),
    "large-plugin/plugin.json": JSON.stringify({
      ...manifest,
      id: "large-plugin",
    }),
    "large-plugin/index.html": "x".repeat(1024 * 1024),
    "large-plugin/style.css": "x".repeat(1024 * 1024),
    "large-plugin/script.js": "",
  };
  await assert.rejects(
    loadPluginCatalog(async (path) => oversizedFiles[path]),
    /expanded content exceeds 2 MB/,
  );
});

test("the bundled calendar, Google Map, Step, and Stepper plugins validate", async () => {
  const pluginFolder = new URL("../public/plugin/", import.meta.url);
  const plugins = await loadPluginCatalog((path) =>
    readFile(new URL(path, pluginFolder), "utf8"),
  );
  const definitions = Object.fromEntries(
    plugins.map((component) => [component.id, component.plugin]),
  );

  assert.deepEqual(plugins.map((component) => component.id), [
    "calendar",
    "google-map",
    "step",
    "stepper",
  ]);
  assert.deepEqual(definitions.calendar.events, [
    "onDaySelected",
    "onMonthChanged",
  ]);
  assert.deepEqual(definitions["google-map"].events, [
    "onMapClick",
    "onMarkerDragEnd",
  ]);
  assert.deepEqual(definitions.stepper.events, [
    "onStepChanged",
    "onCompleted",
  ]);
  assert.equal(definitions.step.acceptsChildren, true);
  assert.equal(definitions.stepper.acceptsChildren, true);
  assert.ok(
    plugins.every((component) => component.plugin.localizations?.ar?.title),
  );
  assert.equal(
    definitions.calendar.properties.find(
      (property) => property.key === "locale",
    ).default,
    "app",
  );
  assert.match(
    plugins.find((component) => component.id === "stepper").html,
    /<slot data-stepper-steps><\/slot>/,
  );
  assert.match(
    plugins.find((component) => component.id === "step").html,
    /<slot><\/slot>/,
  );
  assert.match(
    plugins.find((component) => component.id === "stepper").plugin.js,
    /assignedElements\(\)/,
  );
  assert.ok(plugins.every((component) => !/<iframe\b/i.test(component.html)));
});

test("mounts plugins into native Shadow DOM and exposes scoped plugin context", async () => {
  const standaloneMountPluginElements = new Function(
    `return (${mountPluginElements.toString()})`,
  )();
  const previous = {
    Element: globalThis.Element,
    HTMLElement: globalThis.HTMLElement,
    CustomEvent: globalThis.CustomEvent,
    document: globalThis.document,
    window: globalThis.window,
  };
  class MockElement {
    constructor() {
      this.dataset = {};
      this.children = [];
      this.events = [];
      this.attributes = {};
    }

    matches(selector) {
      return selector === "[data-plugin-id]" && Boolean(this.dataset.pluginId);
    }

    querySelectorAll() {
      return [];
    }

    attachShadow() {
      this.shadowRoot = new MockElement();
      return this.shadowRoot;
    }

    replaceChildren(...children) {
      this.children = children;
    }

    append(...children) {
      this.children.push(...children);
    }

    setAttribute(name, value) {
      this.attributes[name] = value;
    }

    dispatchEvent(event) {
      this.events.push(event);
      return true;
    }
  }
  class MockCustomEvent {
    constructor(type, options) {
      this.type = type;
      Object.assign(this, options);
    }
  }
  const restore = (name, value) => {
    if (value === undefined) delete globalThis[name];
    else globalThis[name] = value;
  };

  globalThis.Element = MockElement;
  globalThis.HTMLElement = MockElement;
  globalThis.CustomEvent = MockCustomEvent;
  globalThis.document = { createElement: () => new MockElement() };
  globalThis.window = {};
  try {
    const plugin = normalizePluginManifest(
      {
        ...manifest,
        localizations: { ar: { title: "بطاقة الطقس" } },
      },
      "<p>{{city}}</p>",
      "p { color: red; }",
      'window.pluginContext.setProperty("mode", "full"); window.pluginContext.emit("click"); window.pluginContext.emit("onDaySelected", { day: 18 }); window.pluginContext.exposeFunction("getCity", () => window.pluginContext.properties.city); window.pluginContext.exposeFunction("getLanguage", () => window.pluginContext.language); return () => window.pluginContext.emit("change");',
    );
    const host = new MockElement();
    host.isConnected = true;
    host.dataset.pluginId = plugin.id;
    host.dataset.pluginProperties = JSON.stringify({
      city: "<script>alert(1)</script>",
    });
    host.closest = () => ({ getAttribute: () => "ar" });

    const propertyChanges = [];
    standaloneMountPluginElements(host, { [plugin.id]: plugin }, (changedHost, key, value) =>
      propertyChanges.push({ host: changedHost, key, value }),
    );

    assert.equal(host.shadowRoot.children[0].textContent.includes("p { color: red; }"), true);
    assert.match(
      host.shadowRoot.children[0].textContent,
      /color: inherit; font: inherit;/,
    );
    assert.equal(host.shadowRoot.children[1].innerHTML, "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
    assert.equal(host.attributes["aria-label"], "بطاقة الطقس");
    assert.equal(host.__takweenPluginFunctions.get("getLanguage")(), "ar");
    assert.deepEqual(host.events.map((event) => event.type), [
      "click",
      "onDaySelected",
    ]);
    assert.deepEqual(host.events[1].detail, { day: 18 });
    assert.equal(JSON.parse(host.dataset.pluginProperties).mode, "full");
    assert.deepEqual(propertyChanges, [
      { host, key: "mode", value: "full" },
    ]);
    assert.equal(host.events[0].bubbles, true);
    assert.equal(host.events[0].composed, true);
    assert.equal(
      host.__takweenPluginFunctions.get("getCity")(),
      "<script>alert(1)</script>",
    );

    await Promise.resolve();
    assert.deepEqual(host.events.map((event) => event.type), [
      "click",
      "onDaySelected",
      "change",
      "click",
      "onDaySelected",
      "change",
    ]);
    assert.equal(
      host.__takweenPluginFunctions.get("getCity")(),
      "<script>alert(1)</script>",
    );

    unmountPluginElements(host);
    assert.equal(host.__takweenPluginFunctions, undefined);
    assert.deepEqual(host.events.map((event) => event.type), [
      "click",
      "onDaySelected",
      "change",
      "click",
      "onDaySelected",
      "change",
      "change",
    ]);
  } finally {
    Object.entries(previous).forEach(([name, value]) => restore(name, value));
  }
});

test("imports only the four bounded root files from a plugin ZIP", async () => {
  const files = {
    "plugin.json": JSON.stringify(manifest),
    "index.html": "<p>Hello</p>",
    "style.css": "p { color: green; }",
    "script.js": "pluginContext.emit('click');",
  };
  const archive = {
    files: Object.fromEntries(
      Object.entries(files).map(([name, value]) => [
        name,
        { dir: false, _data: { uncompressedSize: value.length } },
      ]),
    ),
    file(name) {
      return { async: async () => files[name] };
    },
  };
  const plugin = await importPluginArchive(
    {
      name: "weather.zip",
      size: 100,
      arrayBuffer: async () => new ArrayBuffer(0),
    },
    { loadAsync: async () => archive },
  );

  assert.equal(plugin.title, "Weather card");
  assert.equal(plugin.html, "<p>Hello</p>");
  assert.equal(plugin.js, "pluginContext.emit('click');");

  const nestedArchive = {
    ...archive,
    files: { ...archive.files, "folder/extra.txt": { dir: false } },
  };
  await assert.rejects(
    importPluginArchive(
      {
        name: "invalid.zip",
        size: 100,
        arrayBuffer: async () => new ArrayBuffer(0),
      },
      { loadAsync: async () => nestedArchive },
    ),
    /only plugin.json/,
  );

  const invalidFiles = { ...files, "script.js": "if (" };
  const invalidArchive = {
    files: Object.fromEntries(
      Object.entries(invalidFiles).map(([name, value]) => [
        name,
        { dir: false, _data: { uncompressedSize: value.length } },
      ]),
    ),
    file(name) {
      return { async: async () => invalidFiles[name] };
    },
  };
  await assert.rejects(
    importPluginArchive(
      {
        name: "invalid-script.zip",
        size: 100,
        arrayBuffer: async () => new ArrayBuffer(0),
      },
      { loadAsync: async () => invalidArchive },
    ),
    /Plugin JavaScript is invalid/,
  );
});

test("exported runtime embeds plugin definitions and standalone native mounting code", () => {
  const plugin = normalizePluginManifest(
    manifest,
    "<p>{{city}}</p>",
    "p { color: red; }",
    'window.pluginContext.emit("click");',
  );
  const buildScript = createRuntimeBuilder({
    TWK_FIELDS: [],
    state: {
      elements: [
        {
          id: "weather-1",
          type: "custom",
          customComponentId: plugin.id,
          pluginProperties: { city: "Doha", mode: "full" },
        },
      ],
      pages: [{ id: "page-home", name: "Home", kind: "page" }],
      settings: {},
      requests: [],
      variables: [],
      assets: [],
      userComponents: [createPluginComponent(plugin)],
    },
    componentRuntimePropertyRegistry: {},
    normalizeExtraData: () => [],
    normalizeLocalizedContent: () => ({}),
    normalizeCollectionDataSource: (source) => source ?? { type: "static" },
    removeDefaultProperties: (value) => value,
    normalizeAppLoadHandlers: () => [],
    isJavaScriptAsset: () => false,
    assetArchivePath: () => "",
    twkSystemActionOptions: [],
    twkPermissionActionTypes: [],
    variantOptionsByType: {},
  });
  const script = buildScript();

  assert.match(script, /^\(function startRuntime\(/);
  assert.match(script, /PLUGIN_DEFINITIONS/);
  assert.match(script, /PLUGIN_ELEMENT_IDS/);
  assert.match(script, /onDaySelected/);
  assert.match(script, /plugin\.events/);
  assert.match(script, /workflowEventNames/);
  assert.match(script, /function mountPluginElements\(/);
  assert.match(script, /property\.startsWith\("plugin\."\)/);
  assert.match(script, /getRuntimeContextElementId/);
  assert.doesNotMatch(script, /<iframe[^>]+data-plugin/);
  assert.doesNotThrow(() => new Function(script));
});
