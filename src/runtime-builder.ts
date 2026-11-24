// @ts-nocheck
import {
  attachRippleEffectListener,
  startRuntime,
} from "./app-runtime.ts";
import {
  getPluginDefinition,
  mountPluginElements,
  unmountPluginElements,
} from "./plugin-system.ts";

function safeJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function collectElementActions(elements) {
  return Object.fromEntries(
    elements
      .filter(
        (element) =>
          element.action &&
          typeof element.action === "object" &&
          !Array.isArray(element.action) &&
          (element.action.type !== "none" ||
            (Array.isArray(element.action.handlers) &&
              element.action.handlers.length)),
      )
      .map((element) => [element.id, element.action]),
  );
}

function collectElementTypes(elements) {
  return Object.fromEntries(elements.map((element) => [element.id, element.type]));
}

function collectRuntimePropertyRegistry(registry, elements) {
  return Object.fromEntries(
    Object.entries(registry).filter(([type]) =>
      elements.some((element) => element.type === type),
    ),
  );
}

function collectElementCollectionIds(elements) {
  return Object.fromEntries(
    elements
      .map((element) => {
        let current = element;
        const visited = new Set();
        while (current && !visited.has(current.id)) {
          if (current.type === "collection") return [element.id, current.id];
          visited.add(current.id);
          current = elements.find((candidate) => candidate.id === current.parentId);
        }
        return [element.id, ""];
      })
      .filter(([, collectionId]) => collectionId),
  );
}

function collectElementExtraData(elements, normalizeExtraData) {
  return Object.fromEntries(
    elements
      .map((element) => [element.id, normalizeExtraData(element.extraData)])
      .filter(([, extraData]) => extraData.length),
  );
}

function collectElementLocalizations(elements, normalizeLocalizedContent) {
  return Object.fromEntries(
    elements
      .filter(
        (element) =>
          !element.binding &&
          !element.itemLabelPath &&
          !["collection", "custom", "divider"].includes(element.type) &&
          Object.keys(normalizeLocalizedContent(element.localizations)).length,
      )
      .map((element) => [
        element.id,
        normalizeLocalizedContent(element.localizations),
      ]),
  );
}

function collectListConfigs(elements) {
  return Object.fromEntries(
    elements
      .filter(
        (element) =>
          element.type === "list" && element.listSource?.type !== "static",
      )
      .map((element) => [element.id, element.listSource]),
  );
}

function collectCollectionConfigs(elements, normalizeCollectionDataSource) {
  return Object.fromEntries(
    elements
      .filter((element) => element.type === "collection")
      .map((element) => {
        const source = normalizeCollectionDataSource(element.listSource);
        return [
          element.id,
          {
            ...source,
            items: source.type === "static" ? element.collectionItems || [] : [],
          },
        ];
      }),
  );
}

function collectPluginConfig(elements, userComponents) {
  const usedPluginIds = new Set(
    elements
      .filter((element) => element.type === "custom")
      .map((element) => element.customComponentId),
  );
  return {
    definitions: Object.fromEntries(
      (userComponents || [])
        .filter((component) => usedPluginIds.has(component.id))
        .flatMap((component) => {
          const plugin = getPluginDefinition(component);
          return plugin ? [[plugin.id, plugin]] : [];
        }),
    ),
    elementIds: Object.fromEntries(
      elements
        .filter((element) => element.type === "custom")
        .map((element) => [element.id, element.customComponentId]),
    ),
  };
}

function collectVariables(state, removeDefaultProperties) {
  return state.variables.map((variable) =>
    removeDefaultProperties(
      { ...variable },
      {
        fieldName: "",
        fieldKey: "",
        requestId: "",
        path: "",
        propertyPath: "",
        elementId: "",
        property: "",
      },
      ["id", "name", "source", "value"],
    ),
  );
}

export function createRuntimeBuilder(dependencies) {
  const { TWK_FIELDS, state, componentRuntimePropertyRegistry, normalizeExtraData, normalizeLocalizedContent, normalizeCollectionDataSource, removeDefaultProperties, normalizeAppLoadHandlers, isJavaScriptAsset, assetArchivePath, twkSystemActionOptions, twkPermissionActionTypes, variantOptionsByType } = dependencies;

  function buildScript(assetUrlFor = (asset) => asset.dataUrl) {
    const twkMethods = Object.fromEntries(
      TWK_FIELDS.map((field) => [
        field.key,
        { method: field.method, responseKey: field.responseKey },
      ]),
    );
    const elementActions = collectElementActions(state.elements);
    const elementTypes = collectElementTypes(state.elements);
    const runtimePropertyRegistry = collectRuntimePropertyRegistry(
      componentRuntimePropertyRegistry,
      state.elements,
    );
    const elementCollectionIds = collectElementCollectionIds(state.elements);
    const elementExtraData = collectElementExtraData(
      state.elements,
      normalizeExtraData,
    );
    const elementLocalizations = collectElementLocalizations(
      state.elements,
      normalizeLocalizedContent,
    );
    const listConfigs = collectListConfigs(state.elements);
    const collectionConfigs = collectCollectionConfigs(
      state.elements,
      normalizeCollectionDataSource,
    );
    const pluginConfig = collectPluginConfig(
      state.elements,
      state.userComponents,
    );
    const pageConfigs = Object.fromEntries(
      state.pages.map((page) => [page.id, { name: page.name, kind: page.kind }]),
    );
    const initialPageId =
      state.pages.find((page) => page.kind === "page")?.id || "";
    const initialSplashPageId =
      state.pages.find((page) => page.kind === "splash")?.id || "";
    const apiProgressIndicatorEnabled =
      state.settings.appApiProgressIndicator !== false;
    const apiProgressLabelEnabled =
      state.settings.appApiProgressLabel === true;
    const variables = collectVariables(state, removeDefaultProperties);
    const appLoadHandlers = normalizeAppLoadHandlers(
      state.settings.appLoadHandlers,
    );
    const functionScriptPaths = Object.fromEntries(
      state.assets
        .filter(isJavaScriptAsset)
        .map((asset) => [asset.id, assetArchivePath(asset)]),
    );
    const imageAssetUrls = Object.fromEntries(
      state.assets
        .filter((asset) => asset.type.startsWith("image/"))
        .map((asset) => [asset.id, assetUrlFor(asset)]),
    );
    const elementVariants = Object.fromEntries(
      Object.entries(variantOptionsByType).filter(([type]) =>
        state.elements.some((element) => element.type === type),
      ),
    );
    const runtimeConfig = {
      TWK_SYSTEM_ACTION_TYPES: twkSystemActionOptions.map(([, type]) => type),
      TWK_PERMISSION_ACTION_TYPES: twkPermissionActionTypes,
      TWK_FIELDS: twkMethods,
      INITIAL_APP_LANGUAGE: state.settings.appLanguage,
      API_REQUESTS: state.requests,
      VARIABLES: variables,
      FUNCTION_SCRIPT_PATHS: functionScriptPaths,
      IMAGE_ASSET_URLS: imageAssetUrls,
      APP_LOAD_HANDLERS: appLoadHandlers,
      GLOBAL_ACTIONS: state.settings.globalActions || [],
      ELEMENT_ACTIONS: elementActions,
      ELEMENT_TYPES: elementTypes,
      COMPONENT_RUNTIME_PROPERTY_REGISTRY: runtimePropertyRegistry,
      ELEMENT_VARIANTS: elementVariants,
      ELEMENT_COLLECTION_IDS: elementCollectionIds,
      ELEMENT_EXTRA_DATA: elementExtraData,
      ELEMENT_LOCALIZATIONS: elementLocalizations,
      LIST_CONFIGS: listConfigs,
      COLLECTION_CONFIGS: collectionConfigs,
      PLUGIN_DEFINITIONS: pluginConfig.definitions,
      PLUGIN_ELEMENT_IDS: pluginConfig.elementIds,
      PAGES: pageConfigs,
      APP_TITLE: state.settings.title,
      APP_TITLE_LOCALIZATIONS: normalizeLocalizedContent(
        state.settings.titleLocalizations,
      ),
      APP_ORGANIZATION: state.settings.orgnization,
      APP_ORGANIZATION_LOCALIZATIONS: normalizeLocalizedContent(
        state.settings.organizationLocalizations,
      ),
      INITIAL_PAGE_ID: initialPageId,
      INITIAL_SPLASH_PAGE_ID: initialSplashPageId,
      API_PROGRESS_INDICATOR_ENABLED: apiProgressIndicatorEnabled,
      API_PROGRESS_LABEL_ENABLED: apiProgressLabelEnabled,
    };
    return `(${startRuntime.toString()})(${safeJson(runtimeConfig)}, ${attachRippleEffectListener.toString()}, ${mountPluginElements.toString()}, ${unmountPluginElements.toString()});`;

  }

  return buildScript;
}
 