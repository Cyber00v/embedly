// @ts-nocheck 
import { createWorkflowActionEditor } from "./workflow/action-editor.ts";
import { createWorkflowActionOptions } from "./workflow/action-options.ts";
import {
  getElementsOnPage,
  getRequestIdOrDefault,
} from "./workflow/action-selection.ts";
import { createWorkflowConditionEditor } from "./workflow/condition-editor.ts";
import {
  createEditorState,
  ELEMENT_HISTORY_LIMIT,
  ELEMENT_HISTORY_COALESCE_MS,
} from "./editor-state.ts";
import { registerEditorEvents } from "./editor-events.ts";
import { TemplateEngine } from "./template-engine.ts";
import { attachRippleEffectListener } from "./app-runtime.ts";
import { EXPORT_HTML_TEMPLATES } from "./html-templates.ts";
import { createPreviewRenderer } from "./preview-renderer.ts";
import { createRuntimeBuilder } from "./runtime-builder.ts";
import {
  normalizeLocalizedContent,
  resolveLocalizedContent,
} from "./localization.ts";
import localize from "./editor-localizations.json";
import {
  createWorkflowEdge as createWorkflowEdgeModel,
  ensureWorkflowActionIds as assignWorkflowActionIds,
  getConditionActionLists as readConditionActionLists,
  isWorkflowBranchAction as isWorkflowBranchActionModel,
  serializeWorkflowGraph as serializeWorkflowGraphModel,
} from "./workflow/graph.ts";
import {
  getWorkflowEditorState as getWorkflowEditorStateForGraph,
  getWorkflowGraphLayout as readWorkflowGraphLayout,
  saveWorkflowGraphLayout as persistWorkflowGraphLayout,
} from "./workflow/layout.ts";
import {
  renderWorkflowEdges as drawWorkflowEdges,
  renderWorkflowMinimap as drawWorkflowMinimap,
} from "./workflow/canvas.ts";
import { attachWorkflowCanvasInteractions } from "./workflow/canvas-interactions.ts";
import {
  createPluginComponent,
  getPluginDefinition,
  importPluginArchive,
  loadPluginCatalog,
  localizePluginDefinition,
  mountPluginElements,
  normalizePluginProperties,
  normalizeStoredPluginComponent,
  unmountPluginElements,
} from "./plugin-system.ts";

const STORAGE_KEY = "tawakkalna-builder-v5";
const REQUESTS_STORAGE_KEY = "tawakkalna-requests-v5";
const EDITOR_LANGUAGE_KEY = "tawakkalna-builder-language";
const DISCLAIMER_ACKNOWLEDGED_KEY = "tawakkalna-builder-disclaimer-acknowledged";
const TWK_HELPER_URL = "twkhelper.js";

async function readBundledPluginFile(filePath) {
  const desktopReader = window.electronWindow?.readPluginFile;
  if (desktopReader) return desktopReader(filePath);

  const response = await fetch(
    new URL(`../plugin/${filePath}`, window.location.href),
    { cache: "no-cache" },
  );
  if (!response.ok)
    throw new Error(
      `Plugin file "${filePath}" request failed with status ${response.status}.`,
    );
  return response.text();
}

let bundledPluginComponents = [];
let pluginFolderLoadError = null;
const bundledPluginLoadPromise = loadPluginCatalog(readBundledPluginFile);
const bundledPluginIds = new Set();
let storedPluginDefinitionsNeedMigration = false;

function withBundledPluginComponents(userComponents) {
  return [
    ...userComponents.filter((component) => !bundledPluginIds.has(component.id)),
    ...bundledPluginComponents,
  ];
}

let editorLanguage =
  localStorage.getItem(EDITOR_LANGUAGE_KEY) === "ar" ? "ar" : "en";
const localizedTextWhitespace = new WeakMap();

const TWK_FIELDS = [
  {
    key: "user_id",
    label: localize.UserID[editorLanguage],
    method: "getUserId",
    responseKey: "user_id",
    sample: 1000101111,
  },
  {
    key: "token",
    label: localize.AccessToken[editorLanguage],
    method: "generateToken",
    responseKey: "token",
    sample: "generated token",
  },
  {
    key: "user_type",
    label: localize.UserType[editorLanguage],
    method: "getUserType",
    responseKey: "user_type",
    sample: 1,
  },
  {
    key: "full_name",
    label: localize.FullName[editorLanguage],
    method: "getUserFullName",
    responseKey: "full_name_ar",
    sample: "محمد عبدالعزيز",
  },
  {
    key: "full_name_en",
    label: "Full Name",
    method: "getUserFullName",
    responseKey: "full_name_en",
    sample: "Muhammad Abdulaziz",
  },
  {
    key: "birth_date",
    label: localize.BirthDate[editorLanguage],
    method: "getUserBirthDate",
    responseKey: "birth_date",
    sample: "2023-10-28",
  },
  {
    key: "mobile_number",
    label: localize.MobileNumber[editorLanguage],
    method: "getUserMobileNumber",
    responseKey: "mobile_number",
    sample: "+966533333333",
  },
  {
    key: "gender",
    label: localize.Gender[editorLanguage],
    method: "getUserGender",
    responseKey: "gender",
    sample: 2,
  },
  {
    key: "user_location",
    label: localize.Location[editorLanguage],
    method: "getUserLocation",
    responseKey: "location",
    sample: { latitude: 24.7136, longitude: 46.6753 },
  },
  {
    key: "nationality_name",
    label: localize.Nationality[editorLanguage],
    method: "getUserNationality",
    responseKey: "nationality_name",
    sample: "Kingdom of Saudi Arabia",
  },
  {
    key: "nationality_iso",
    label: localize.NationalityCode[editorLanguage],
    method: "getUserNationalityISO",
    responseKey: "nationality_iso",
    sample: "SA",
  },
  {
    key: "marital_status",
    label: localize.MaritalStatus[editorLanguage],
    method: "getUserMaritalStatus",
    responseKey: "marital_status",
    sample: "single",
  },
  {
    key: "health_status",
    label: localize.HealthStatus[editorLanguage],
    method: "getUserHealthStatus",
    responseKey: "health_status",
    sample: "healthy",
  },
  {
    key: "disability_type",
    label: localize.DisabilityType[editorLanguage],
    method: "getUserDisabilityType",
    responseKey: "disability_type",
    sample: "",
  },
  {
    key: "blood_type",
    label: localize.BloodType[editorLanguage],
    method: "getUserBloodType",
    responseKey: "blood_type",
    sample: 1,
  },
  {
    key: "national_address",
    label: localize.NationalAddress[editorLanguage],
    method: "getUserNationalAddress",
    responseKey: "national_addresses",
    sample: [
      {
        details: {
          additional_no: "7559",
          building_no: "3693",
          city: "RIYADH",
          district_name: "Al Muruj Dist.",
          short_address: "RHGA3693",
          street_name: "Bani Qais",
          zip_code: "12284",
        },
        is_primary_address: true,
        summary: {
          address_ar: "RHGA3693, 3693, حي المروج, 7559, بني قيس, الرياض",
          latitude: 24.7326068545263,
          longitude: 46.5989362244768,
        },
      },
    ],
  },
  {
    key: "degree_type",
    label: localize.Education[editorLanguage],
    method: "getUserDegreeType",
    responseKey: "degree_type",
    sample: "ماجيستير",
  },
  {
    key: "occupation",
    label: localize.Occupation[editorLanguage],
    method: "getUserOccupation",
    responseKey: "occupation",
    sample: "software developer",
  },
  {
    key: "family_members",
    label: localize.FamilyMembersAlternativeA[editorLanguage],
    method: "getUserFamilyMembers",
    responseKey: "family_members",
    sample: [],
  },
  {
    key: "sponsors",
    label: localize.Dependents[editorLanguage],
    method: "getUserSponsors",
    responseKey: "sponsors",
    sample: [],
  },
  {
    key: "unpaid_violations",
    label: localize.UnpaidViolations[editorLanguage],
    method: "getUserUnPaidViolations",
    responseKey: "violations",
    sample: [],
  },
  {
    key: "paid_violations",
    label: localize.PaidViolations[editorLanguage],
    method: "getUserPaidViolations",
    responseKey: "violations",
    sample: [],
  },
  {
    key: "vehicles",
    label: localize.Vehicles[editorLanguage],
    method: "getUserVehicles",
    responseKey: "vehicles",
    sample: [],
  },
  {
    key: "passports",
    label: localize.Passports[editorLanguage],
    method: "getUserPassports",
    responseKey: "passports",
    sample: [],
  },
  {
    key: "app_language",
    label: localize.Language[editorLanguage],
    method: "getDeviceInfo",
    responseKey: "app_language",
    sample: "ar",
  },
  {
    key: "appearance",
    label: localize.AppAppearance[editorLanguage],
    method: "getDeviceInfo",
    responseKey: "appearance",
    sample: "1",
  },
];

function getPageFormFields(pageId) {
  return state.elements.filter(
    (element) =>
      formElementTypes.includes(element.type) && element.pageId === pageId,
  );
}

function populateFormFieldSelect(select, pageId, selectedFieldName = "") {
  const fields = getPageFormFields(pageId);
  select.replaceChildren(
    ...fields.map((element) => {
      const option = new Option(
        `${getFormName(element)} · ${getElementName(element)}`,
        getFormName(element),
      );
      return option;
    }),
  );
  if (!fields.length)
    select.add(new Option(localize.AddAFieldToThePageFirst[editorLanguage], ""));
  select.value = fields.some(
    (element) => getFormName(element) === selectedFieldName,
  )
    ? selectedFieldName
    : fields[0]
      ? getFormName(fields[0])
      : "";
  select.disabled = !fields.length;
  return fields;
}

const defaultElements = [
  {
    id: "scrollView",
    type: "scrollView",
    pageId: "page-home",
    content: "",
    styles: {},
  },
];

const typeNames = {
  heading: localize.Title[editorLanguage],
  text: "Label",
  button: "Button",
  accordion: "Accordion",
  tabs: localize.Tabs[editorLanguage],
  tab: localize.Tab[editorLanguage],
  chip: "Chip",
  breadcrumbs: "Breadcrumbs",
  badge: "Badge",
  fab: "Floating Action Button",
  toast: "Toast",
  loading: "Loading",
  progress: "Progress",
  switch: "Switch",
  card: "Card",
  grid: localize.Grid[editorLanguage],
  input: localize.Input[editorLanguage],
  filePicker: localize.FilePicker[editorLanguage],
  list: "List View",
  checkbox: "Checkbox",
  radio: "Radio Button",
  layout: localize.Layout[editorLanguage],
  absoluteLayout: "Absolute Layout",
  scrollView: "Scroll View",
  sheet: "Sheet",
  divider: localize.Divider[editorLanguage],
  image: localize.Image[editorLanguage],
  collection: localize.Collection[editorLanguage],
  icon: localize.Icon[editorLanguage],
  custom: "Custom Element",
};

function getElementName(element) {
  const plugin =
    element.type === "custom" ? getPluginForElement(element) : null;
  const name =
    plugin
      ? localizePluginDefinition(plugin, editorLanguage).title
      : typeNames[element.type];
  return `${name} · ${element.id}`;
}

const inputTypes = [
  "text",
  "number",
  "email",
  "tel",
  "url",
  "password",
  "search",
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
  "color",
  "range",
];

const variantOptionsByType = {
  button: ["primary", "secondary", "destructive", "ghost", "outline", "custom"],
  fab: ["primary", "secondary", "destructive", "ghost", "outline", "custom"],
  chip: [
    "primary",
    "secondary",
    "success",
    "warning",
    "destructive",
    "outline",
  ],
  toast: ["primary", "secondary", "success", "warning", "destructive"],
  badge: ["primary", "secondary", "success", "warning", "destructive"],
};

const variantLabels = {
  primary: localize.Primary[editorLanguage],
  secondary: localize.Secondary[editorLanguage],
  success: localize.Success[editorLanguage],
  warning: localize.Warning[editorLanguage],
  destructive: localize.Destructive[editorLanguage],
  ghost: localize.Ghost[editorLanguage],
  outline: localize.Outline[editorLanguage],
  custom: localize.Custom[editorLanguage],
};

function getChangePropertyOptions(element) {
  const options = [[localize.Visibility[editorLanguage], "visibility"]];
  const plugin = getPluginForElement(element);
  if (element.type === "image")
    options.push(
      [localize.ImageURL[editorLanguage], "src"],
      [localize.ImageAsset[editorLanguage], "assetId"],
    );
  if (plugin) options.push([localize.Disabled[editorLanguage], "disabled"]);
  if (element.type !== "filePicker" && !plugin)
    options.unshift([localize.ContentText[editorLanguage], "content"]);
  if (element.type === "icon") options.push([localize.FontAwesomeIcon[editorLanguage], "iconClass"]);
  if (
    [
      "button",
      "input",
      "list",
      "checkbox",
      "radio",
      "chip",
      "fab",
      "switch",
      "toast",
      "filePicker",
    ].includes(element.type)
  )
    options.push([localize.Disabled[editorLanguage], "disabled"]);
  if (element.type === "input")
    options.push([localize.MinimumValue[editorLanguage], "min"], [localize.MaximumValue[editorLanguage], "max"]);
  if (element.type === "switch") options.push([localize.SwitchState[editorLanguage], "checked"]);
  if (element.type === "progress")
    options.push([localize.Value[editorLanguage], "value"], [localize.Maximum[editorLanguage], "max"]);
  if (variantOptionsByType[element.type]) options.push([localize.Variant[editorLanguage], "variant"]);
  const localizedPlugin = plugin
    ? localizePluginDefinition(plugin, editorLanguage)
    : null;
  localizedPlugin?.properties.forEach((property) =>
    options.push([
      `${localizedPlugin.title} · ${property.label}`,
      `plugin.${property.key}`,
    ]),
  );
  return options;
}

function getPluginForElement(element) {
  if (element.type !== "custom") return null;
  const component = state.userComponents.find(
    (item) => item.id === element.customComponentId,
  );
  return component ? getPluginDefinition(component) : null;
}

function savePluginPropertyChange(host, key, value) {
  const element = state.elements.find((item) => item.id === host.dataset.id);
  const plugin = element ? getPluginForElement(element) : null;
  if (!element || !plugin?.properties.some((property) => property.key === key))
    return;

  element.pluginProperties = normalizePluginProperties(plugin, {
    ...element.pluginProperties,
    [key]: value,
  });
  if (state.selectedId === element.id) {
    const field = document.querySelector(
      `#plugin-properties [data-plugin-property="${CSS.escape(key)}"]`,
    );
    if (field instanceof HTMLInputElement && field.type === "checkbox")
      field.checked = element.pluginProperties[key] === true;
    else if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLSelectElement
    )
      field.value = String(element.pluginProperties[key]);
  }
  scheduleSave();
}

function getPluginRuntimeDefinitions() {
  const usedPluginIds = new Set(
    state.elements
      .filter(
        (element) =>
          element.pageId === state.currentPageId && element.type === "custom",
      )
      .map((element) => element.customComponentId),
  );
  return Object.fromEntries(
    state.userComponents
      .filter((component) => usedPluginIds.has(component.id))
      .flatMap((component) => {
        const plugin = getPluginDefinition(component);
        return plugin ? [[plugin.id, plugin]] : [];
      }),
  );
}

function normalizeChangePropertyAction(action) {
  const target = state.elements.find(
    (element) => element.id === action.targetElementId,
  );
  const properties = getChangePropertyOptions(target || { type: "" });
  if (!properties.some(([, property]) => property === action.property)) {
    action.property = properties[0]?.[1] || "";
    action.value = "";
  }
  return action;
}

function getActionValueType(property) {
  if (
    property === "visibility" ||
    property === "disabled" ||
    property === "checked"
  )
    return "boolean";
  if (property === "variant") return "variant";
  if (property === "assetId") return "asset";
  return "text";
}

function getVariantOptions(type) {
  return variantOptionsByType[type] || [];
}

function getDefaultVariant(type) {
  return type === "chip" || type === "toast" ? "secondary" : "primary";
}

function normalizeElementVariant(type, variant) {
  const options = getVariantOptions(type);
  if (options.length)
    return options.includes(variant) ? variant : getDefaultVariant(type);
  return [
    "primary",
    "secondary",
    "success",
    "warning",
    "destructive",
    "ghost",
    "outline",
    "custom",
  ].includes(variant)
    ? variant
    : "custom";
}

const formElementTypes = [
  "input",
  "list",
  "checkbox",
  "radio",
  "switch",
  "filePicker",
];

const defaultTheme = {
  background: "#f4f7f6",
  foreground: "#111816",
  card: "#ffffff",
  cardForeground: "#111816",
  popover: "#ffffff",
  popoverForeground: "#111816",
  primary: "#393C3B",
  primaryForeground: "#ffffff",
  secondary: "#F2F2F2",
  secondaryForeground: "#393C3B",
  muted: "#EDF2F0",
  mutedForeground: "#667872",
  accent: "#E6F4EA",
  accentForeground: "#004D33",
  destructive: "#D9381E",
  border: "#D2E0DC",
  input: "#D2E0DC",
  ring: "#007A53",
};

const darkThemeColors = {
  background: "#111827",
  foreground: "#f3f4f6",
  card: "#1f2937",
  cardForeground: "#f3f4f6",
  popover: "#1f2937",
  popoverForeground: "#f3f4f6",
  primary: "#34d399",
  primaryForeground: "#052e22",
  secondary: "#374151",
  secondaryForeground: "#f3f4f6",
  muted: "#273449",
  mutedForeground: "#cbd5e1",
  accent: "#174e45",
  accentForeground: "#d1fae5",
  destructive: "#f87171",
  border: "#374151",
  input: "#4b5563",
  ring: "#34d399",
};

const themeCssVariableAliases = {
  "--theme-primary": "primary",
  "--theme-accent": "accent",
  "--theme-secondary": "secondary",
  "--theme-background": "background",
  "--theme-surface": "card",
  "--theme-text": "foreground",
  "--theme-border": "border",
  "--theme-input": "input",
  "--theme-muted": "mutedForeground",
  "--theme-ring": "ring",
};

const defaultSettings = {
  title: localize.AppTitle.ar,
  orgnization: localize.OrganizationName.ar,
  titleLocalizations: {},
  organizationLocalizations: {},
  appTopBarType: "standard",
  appLogoAssetId: "",
  appLanguage: "ar",
  appTheme: "light",
  appDarkTheme: { ...darkThemeColors },
  appElementSize: "large",
  appMargin: 0,
  appMargins: { top: 0, right: 0, bottom: 0, left: 0 },
  appPaddings: { top: 8, right: 8, bottom: 8, left: 8 },
  appApiProgressIndicator: true,
  appApiProgressLabel: false,
  appShowErrorMessage: true,
  appLoadHandlers: [],
  globalActions: [],
  eventWorkflowGraphs: {},
  selectedPluginIds: [],
};

const twkSystemActionOptions = [
  [localize.ShareScreenshot[editorLanguage], "shareScreenShot"],
  [localize.RequestCameraPermission[editorLanguage], "askCameraPermission"],
  [localize.RequestGalleryPermission[editorLanguage], "askGalleryPermission"],
  [localize.RequestLocationPermission[editorLanguage], "askUserLocationPermission"],
  [
    localize.RequestPushNotificationPermission[editorLanguage],
    "askPushNotificationPermission",
  ],
  [
    localize.RequestPreciseLocationPermission[editorLanguage],
    "askUserPreciseLocationPermission",
  ],
];
const twkPermissionActionTypes = twkSystemActionOptions
  .map(([, type]) => type)
  .filter((type) => type !== "shareScreenShot");

const componentRuntimePropertyRegistry = {
  filePicker: ["files", "mode"],
  progress: ["value", "min", "max"],
  input: ["value", "min", "max", "isValid", "characterCount"],
  textarea: ["value", "isValid", "characterCount"],
  checkbox: ["checked", "value"],
  switch: ["checked", "value"],
  list: ["value", "selectedLabel", "options"],
  radio: ["value", "selectedLabel", "options"],
};

function isWorkflowBranchAction(action) {
  return isWorkflowBranchActionModel(action, twkPermissionActionTypes);
}

const appLoadActionTypes = [
  "none",
  "request",
  "openService",
  "navigate",
  "back",
  "setVariable",
  "changeProperty",
  "condition",
  "message",
  "showSheet",
  "hideSheet",
  "showToast",
  "function",
  "globalAction",
  ...twkSystemActionOptions.map(([, type]) => type),
];

function normalizeGlobalActions(actions) {
  if (!Array.isArray(actions)) return [];
  const ids = new Set();
  const names = new Set();
  return actions
    .filter(
      (action) =>
        action &&
        typeof action === "object" &&
        !Array.isArray(action) &&
        typeof action.id === "string" &&
        action.id.trim() &&
        typeof action.name === "string" &&
        action.name.trim() &&
        Array.isArray(action.actions),
    )
    .map((action) => ({
      id: action.id.trim(),
      name: action.name.trim().slice(0, 64),
      nameKey: action.name.trim().slice(0, 64).toLowerCase(),
      actions: action.actions.filter(
        (item) =>
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          typeof item.type === "string",
      ),
    }))
    .filter((action) => {
      if (ids.has(action.id) || names.has(action.nameKey)) return false;
      ids.add(action.id);
      names.add(action.nameKey);
      return true;
    })
    .map(({ nameKey, ...action }) => action);
}

function normalizeAppLoadHandlers(handlers) {
  if (!Array.isArray(handlers)) return [];
  return handlers
    .filter(
      (handler) =>
        handler &&
        typeof handler === "object" &&
        !Array.isArray(handler) &&
        appLoadActionTypes.includes(handler.type),
    )
    .map((handler) => ({ ...handler, event: "load" }));
}

const defaultOptions = [
  { label: localize.FirstOption.ar, value: "option_1" },
  { label: localize.SecondOption.ar, value: "option_2" },
];

const defaultCollectionItems = [
  { title: localize.FirstItem.ar, description: localize.FirstItemDescription.ar },
  { title: localize.SecondItem.ar, description: localize.SecondItemDescription.ar },
];

const requestMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const valueSourceOptions = [
  ["static", localize.StaticContent[editorLanguage]],
  ["form", localize.FormFieldAlternativeA[editorLanguage]],
  ["twk", localize.TawakkalnaData[editorLanguage]],
  ["endpoint", localize.APIResponse[editorLanguage]],
  ["variable", localize.SavedVariable[editorLanguage]],
  ["item", localize.FieldFromTheCurrentListItem[editorLanguage]],
  ["extra", localize.ElementExtraData[editorLanguage]],
  ["element", localize.PropertyFromAnotherElement[editorLanguage]],
];
const variableSourceTypes = valueSourceOptions.map(([value]) => value);

function populateValueSourceOptions(select, allowItem = true) {
  const selected = select.value;
  select.replaceChildren(
    ...valueSourceOptions.map(([value, label]) => {
      const option = new Option(label, value);
      option.hidden = value === "item" && !allowItem;
      return option;
    }),
  );
  if (valueSourceOptions.some(([value]) => value === selected))
    select.value = selected;
}
const defaultPages = [
  { id: "page-home", name: "home", kind: "page" },
  { id: "page-splash", name: "splash", kind: "splash" },
  { id: "page-error", name: "error", kind: "error" },
];

function normalizeClassNames(value) {
  if (typeof value !== "string") return "";
  return [
    ...new Set(
      value
        .trim()
        .split(/\s+/)
        .filter((name) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)),
    ),
  ].join(" ");
}

function defaultBorderRadius(type) {
  if (type === "sheet") return 18;
  if (type === "card") return 12;
  return 8;
}

function getElementFontSize(element) {
  if (element.type === "fab") return 24;
  return clampNumber(
    element.styles.fontSize,
    14,
    36,
    element.type === "heading" ? 18 : 14,
  );
}

function normalizeSpacing(value, fallback = 0, max = 100) {
  return Object.fromEntries(
    ["top", "right", "bottom", "left"].map((side) => [
      side,
      clampNumber(
        value?.[side],
        0,
        max,
        typeof fallback === "object" ? fallback[side] : fallback,
      ),
    ]),
  );
}

function normalizeAppSpacing(settings) {
  const hasLegacyMargin = Number.isFinite(settings?.appMargin);
  const legacyMargin = hasLegacyMargin
    ? clampNumber(settings.appMargin, 0, 100, 0)
    : 0;
  const appMargins = normalizeSpacing(
    settings?.appMargins,
    hasLegacyMargin ? legacyMargin : defaultSettings.appMargins,
    100,
  );
  const appPaddings = normalizeSpacing(
    settings?.appPaddings,
    defaultSettings.appPaddings,
    100,
  );
  // Upgrade untouched starter spacing while preserving explicit project spacing.
  const hasPreviousDefaults =
    legacyMargin === 0 &&
    Object.values(appMargins).every((value) => value === 0) &&
    appPaddings.top === 16 &&
    appPaddings.right === 12 &&
    appPaddings.bottom === 12 &&
    appPaddings.left === 12;

  if (hasPreviousDefaults) {
    appMargins.right = 16;
    appMargins.left = 16;
    appPaddings.right = 16;
    appPaddings.bottom = 16;
    appPaddings.left = 16;
  }
  return { appMargins, appPaddings };
}

function getSpacingValue(styles, side, kind) {
  const property = `${kind}${side[0].toUpperCase()}${side.slice(1)}`;
  const fallback = kind === "padding" ? 8 : 0;
  return clampNumber(
    styles[property],
    0,
    kind === "padding" ? 48 : 100,
    styles[kind] ?? fallback,
  );
}

function getSpacingCss(styles, kind) {
  return ["top", "right", "bottom", "left"]
    .map((side) => `${getSpacingValue(styles, side, kind)}px`)
    .join(" ");
}

function getScaledSpacingCss(styles, kind) {
  return ["top", "right", "bottom", "left"]
    .map(
      (side) =>
        `calc(${getSpacingValue(styles, side, kind)}px * var(--element-size-scale, 1))`,
    )
    .join(" ");
}

function getElementSizeScale() {
  return state.settings.appElementSize === "small"
    ? 0.85
    : state.settings.appElementSize === "large"
      ? 1.15
      : 1;
}

function getLocalizedContent(element, language = state.settings.appLanguage) {
  return resolveLocalizedContent(
    element.localizations,
    language,
    element.content,
  );
}

function getLocalizedAppTitle(language = state.settings.appLanguage) {
  return resolveLocalizedContent(
    state.settings.titleLocalizations,
    language,
    state.settings.title,
  );
}

function getLocalizedAppOrganization(language = state.settings.appLanguage) {
  return resolveLocalizedContent(
    state.settings.organizationLocalizations,
    language,
    state.settings.orgnization,
  );
}

function getAsset(assetId) {
  return state.assets.find((asset) => asset.id === assetId);
}

function getAppLogoAsset() {
  const asset = getAsset(state.settings.appLogoAssetId);
  return asset?.type.startsWith("image/") ? asset : null;
}

function getImageSource(element) {
  return getAsset(element.assetId)?.dataUrl || safeImageUrl(element.imageUrl);
}

const savedProject = loadProject();
const { state, elementHistory, collapsedTreeElements } = createEditorState(
  savedProject,
  loadRequests(),
);
const requestTestResults = new Map();
let renderedElementTreeSignature = "";
let previewFocusFrame = null;

const preview = document.querySelector("#app-preview");
attachRippleEffectListener(preview);
const deviceFrame = document.querySelector("#device-frame");
const propertyForm = document.querySelector("#properties-form");
const applicationProperties = document.querySelector("#application-properties");
const exportDialog = document.querySelector("#export-dialog");
const exportCode = document.querySelector("#export-code");
const saveStatus = document.querySelector("#save-status");
const toast = document.querySelector("#toast");
const apiDialog = document.querySelector("#api-dialog");
const variablesDialog = document.querySelector("#variables-dialog");
const themeDialog = document.querySelector("#theme-dialog");
const componentDialog = document.querySelector("#component-dialog");
const assetsDialog = document.querySelector("#assets-dialog");
const customCssDialog = document.querySelector("#custom-css-dialog");
const customMarkupDialog = document.querySelector("#custom-markup-dialog");
const workflowDialog = document.querySelector("#workflow-dialog");
const globalActionsDialog = document.querySelector("#global-actions-dialog");

function renderGlobalActionsList() {
  const list = document.querySelector("#global-actions-list");
  list.replaceChildren();
  (state.settings.globalActions || []).forEach((action) => {
    const row = document.createElement("section");
    row.className = "condition-action global-action-row";
    row.dataset.globalActionId = action.id;
    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 64;
    name.value = action.name;
    name.dataset.globalActionField = "name";
    name.setAttribute("aria-label", localize.GlobalActionName[editorLanguage]);
    name.id = `global-action-name-${action.id}`;
    const nameLabel = document.createElement("label");
    nameLabel.className = "field-label";
    nameLabel.htmlFor = name.id;
    nameLabel.textContent = localize.GlobalActionName[editorLanguage];
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "button button-primary";
    edit.dataset.editGlobalAction = action.id;
    edit.textContent = localize.EditWorkflow[editorLanguage];
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button button-quiet";
    remove.dataset.removeGlobalAction = action.id;
    remove.textContent = localize.Delete[editorLanguage];
    row.append(nameLabel, name, edit, remove);
    list.append(row);
  });
  refreshGlobalActionSelectors();
}

function refreshGlobalActionSelectors() {
  document
    .querySelectorAll(
      'select[data-event-handler-field="globalActionId"], select[data-condition-action="globalActionId"]',
    )
    .forEach((select) => {
      const selectedId = select.value;
      select.replaceChildren(
        ...(state.settings.globalActions || []).map(
          (action) => new Option(action.name, action.id),
        ),
      );
      if (
        selectedId &&
        !(state.settings.globalActions || []).some(
          (action) => action.id === selectedId,
        )
      )
        select.add(
          new Option(
            formatEditorMessage(localize.MissingGlobalAction[editorLanguage], {
              id: selectedId,
            }),
            selectedId,
          ),
        );
      if (!select.options.length)
        select.add(new Option(localize.DefineAGlobalActionFirst[editorLanguage], ""));
      select.value = selectedId;
    });
}

function formatEditorMessage(message, values) {
  return Object.entries(values).reduce(
    (result, [key, value]) =>
      result.replace(`{${key}}`, () => String(value)),
    message,
  );
}

function getEditorLocalization(key) {
  const localization = localize[key];
  const translation = localization?.[editorLanguage];
  if (typeof translation !== "string")
    throw new Error(`Missing ${editorLanguage} editor localization "${key}".`);
  return translation;
}

function localizeEditorElement(element) {
  const textKey = element.dataset.i18n;
  if (textKey) {
    // The node index keeps translated text from replacing neighboring markup.
    const text = element.childNodes[Number(element.dataset.i18nNode || 0)];
    if (text?.nodeType === Node.TEXT_NODE) {
      const current = text.nodeValue;
      const whitespace =
        localizedTextWhitespace.get(element) || {
          leading: current.match(/^\s*/)?.[0] || "",
          trailing: current.match(/\s*$/)?.[0] || "",
        };
      localizedTextWhitespace.set(element, whitespace);
      const translated = `${whitespace.leading}${getEditorLocalization(
        textKey,
      )}${whitespace.trailing}`;
      if (text.nodeValue !== translated) text.nodeValue = translated;
    }
  }

  ["aria-label", "title", "placeholder"].forEach((attribute) => {
    const datasetKey = `i18n${attribute
      .split("-")
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join("")}`;
    const key = element.dataset[datasetKey];
    if (key) element.setAttribute(attribute, getEditorLocalization(key));
  });
}

function localizeEditorSubtree(root) {
  const elements = [];
  if (root instanceof Element) elements.push(root);
  if (root.querySelectorAll) elements.push(...root.querySelectorAll("*"));
  elements.forEach(localizeEditorElement);
  if (root.nodeType === Node.TEXT_NODE) {
    const element = root.parentElement?.closest(
      "[data-i18n], [data-i18n-aria-label], [data-i18n-title], [data-i18n-placeholder]",
    );
    if (element) localizeEditorElement(element);
  }
}

function applyEditorLanguage() {
  const direction = editorLanguage === "ar" ? "rtl" : "ltr";
  if (document.documentElement.lang !== editorLanguage)
    document.documentElement.lang = editorLanguage;
  if (document.documentElement.dir !== direction)
    document.documentElement.dir = direction;
  if (document.title !== "Embedly")
    document.title = "Embedly";

  localizeEditorSubtree(document.body);

  const editorToggle = document.querySelector("#editor-language-toggle");
  const editorToggleLabel =
    editorLanguage === "ar"
      ? localize.EnglishLanguage.en
      : localize.ArabicLanguage.ar;
  if (editorToggle.textContent !== editorToggleLabel)
    editorToggle.textContent = editorToggleLabel;
}

function localizeChangedSubtrees(records) {
  const changedRoots = new Set();
  const changedTextNodes = new Set();
  records.forEach((record) => {
    if (record.type === "characterData") {
      changedTextNodes.add(record.target);
      return;
    }
    record.addedNodes.forEach((node) => changedRoots.add(node));
  });

  const rootsToTranslate = [...changedRoots].filter((root) => {
    let ancestor = root.parentNode;
    while (ancestor) {
      if (changedRoots.has(ancestor)) return false;
      ancestor = ancestor.parentNode;
    }
    return true;
  });
  rootsToTranslate.forEach((root) => localizeEditorSubtree(root));
  changedTextNodes.forEach((node) => {
    let ancestor = node;
    while (ancestor && !changedRoots.has(ancestor))
      ancestor = ancestor.parentNode;
    if (!ancestor) localizeEditorSubtree(node);
  });
}

const editorLanguageObserver = new MutationObserver(localizeChangedSubtrees);
editorLanguageObserver.observe(document.body, {
  childList: true,
  characterData: true,
  subtree: true,
});

function setEditorLanguage(language) {
  editorLanguage = language === "en" ? "en" : "ar";
  localStorage.setItem(EDITOR_LANGUAGE_KEY, editorLanguage);
  applyEditorLanguage();
  renderEventHandlers(
    { handlers: state.settings.appLoadHandlers },
    { appLoad: true },
  );
  const selectedElement = state.elements.find(
    (element) => element.id === state.selectedId,
  );
  renderPluginPicker();
  renderPluginElements();
  renderElementTree();
  if (selectedElement) {
    renderPluginPropertyFields(selectedElement);
    renderEventHandlers(selectedElement.action || {});
  }
}

function loadProject() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return {
        pages: structuredClone(defaultPages),
        elements: pruneElementAttributes(
          structuredClone(defaultElements).map((element) => ({
            ...element,
            pageId: defaultPages[0].id,
          })),
        ),
        components: [],
        userComponents: [],
        variables: [
          {
            id: "serviceId-variable",
            name: "ServiceID",
            source: "static",
            value: "12121212",
            propertyPath: "",
          },
        ],
        assets: [],
        customCss: "",
        theme: structuredClone(defaultTheme),
        settings: structuredClone(defaultSettings),
      };
    }

    const parsed = JSON.parse(saved);
    const legacy = Array.isArray(parsed);
    storedPluginDefinitionsNeedMigration =
      !legacy &&
      Array.isArray(parsed.userComponents) &&
      parsed.userComponents.some(
        (component) =>
          component &&
          typeof component === "object" &&
          Object.hasOwn(component, "plugin"),
      );
    const pageRecords = legacy ? defaultPages : parsed.pages;
    const elementRecords = legacy ? parsed : parsed.elements;
    if (
      !Array.isArray(pageRecords) ||
      !Array.isArray(elementRecords) ||
      elementRecords.some(
        (element) =>
          !element ||
          typeof element.id !== "string" ||
          !Object.hasOwn(typeNames, element.type) ||
          typeof element.content !== "string" ||
          !element.styles ||
          typeof element.styles !== "object",
      )
    ) {
      throw new Error("Saved project data has an invalid shape.");
    }

    const pages = [];
    const pageIds = new Set();
    pageRecords.forEach((page) => {
      if (
        !page ||
        typeof page.id !== "string" ||
        typeof page.name !== "string" ||
        !["page", "splash", "loading", "error"].includes(page.kind) ||
        pageIds.has(page.id)
      )
        return;
      pages.push({
        id: page.id,
        name: page.name.slice(0, 40),
        kind: page.kind === "loading" ? "page" : page.kind,
      });
      pageIds.add(page.id);
    });
    if (!pages.some((page) => page.kind === "page")) {
      pages.unshift({ id: "page-home", name: "home", kind: "page" });
    }
    for (const kind of ["splash", "error"]) {
      if (!pages.some((page) => page.kind === kind)) {
        const fallback = defaultPages.find((page) => page.kind === kind);
        pages.push(structuredClone(fallback));
      }
    }
    const homePageId = pages.find((page) => page.kind === "page").id;
    const validPageIds = new Set(pages.map((page) => page.id));
    const elements = elementRecords.map((element) => ({
      ...element,
      localizations: normalizeLocalizedContent(element.localizations),
      parentId: element.parentId,
      pageId: validPageIds.has(element.pageId) ? element.pageId : homePageId,
      horizontalAlignment: ["start", "center", "end"].includes(
        element.horizontalAlignment,
      )
        ? element.horizontalAlignment
        : "start",
      verticalAlignment: ["top", "center", "bottom"].includes(
        element.verticalAlignment,
      )
        ? element.verticalAlignment
        : "top",
      inputType: inputTypes.includes(element.inputType)
        ? element.inputType
        : "text",
      hidden: Boolean(element.hidden),
      disabled: Boolean(element.disabled),
      filePickerMode:
        element.filePickerMode === "multiple" ? "multiple" : "single",
      filePickerAppearance:
        element.filePickerAppearance === "dropzone" ? "dropzone" : "button",
      min: element.min == null ? "" : String(element.min),
      max: element.max == null ? "" : String(element.max),
      progressMode:
        element.progressMode === "determinate"
          ? "determinate"
          : "indeterminate",
      progressValue: clampNumber(element.progressValue, 0, 1000000, 0),
      progressMax: clampNumber(element.progressMax, 1, 1000000, 100),
      fieldName: typeof element.fieldName === "string" ? element.fieldName : "",
      fieldValue: Object.hasOwn(element, "fieldValue")
        ? element.fieldValue
        : true,
      accordionOpen:
        typeof element.accordionOpen === "boolean"
          ? element.accordionOpen
          : true,
      activeTabId:
        typeof element.activeTabId === "string" ? element.activeTabId : "",
      chipSelected: Boolean(element.chipSelected),
      imageUrl: typeof element.imageUrl === "string" ? element.imageUrl : "",
      imageFit: element.imageFit === "cover" ? "cover" : "contain",
      assetId: typeof element.assetId === "string" ? element.assetId : "",
      className: normalizeClassNames(element.className),
      iconClass:
        typeof element.iconClass === "string" &&
          /^fa-[a-z0-9-]+$/.test(element.iconClass)
          ? element.iconClass
          : element.type === "button"
            ? ""
          : element.iconClass == null
            ? "fa-home"
            : "fa-star",
      customComponentId:
        typeof element.customComponentId === "string"
          ? element.customComponentId
          : "",
      pluginProperties:
        element.pluginProperties &&
          typeof element.pluginProperties === "object" &&
          !Array.isArray(element.pluginProperties)
          ? element.pluginProperties
          : {},
      cardHeader:
        typeof element.cardHeader === "string" ? element.cardHeader : "",
      cardFooter:
        typeof element.cardFooter === "string" ? element.cardFooter : "",
      cardSlot: element.cardSlot === "footer" ? "footer" : "content",
      itemLabelPath:
        typeof element.itemLabelPath === "string" ? element.itemLabelPath : "",
      itemValuePath:
        typeof element.itemValuePath === "string" ? element.itemValuePath : "",
      action:
        element.action && typeof element.action === "object"
          ? element.action
          : { type: "none", requestId: "", serviceId: "", values: "{}" },
      styles: {
        ...element.styles,
        width: normalizeDimension(element.styles.width),
        height: normalizeDimension(element.styles.height),
        margin: clampNumber(element.styles.margin, 0, 100, 0),
        borderWidth: clampNumber(element.styles.borderWidth, 0, 12, 0),
        borderRadius: clampNumber(
          element.styles.borderRadius,
          0,
          100,
          defaultBorderRadius(element.type),
        ),
        borderColor: safeColor(element.styles.borderColor, "#dbe5e1"),
        variant: normalizeElementVariant(element.type, element.styles.variant),
        ...Object.fromEntries(
          ["padding", "margin"].flatMap((kind) => {
            const legacy = clampNumber(
              element.styles[kind],
              0,
              kind === "padding" ? 48 : 100,
              kind === "padding"
                ? element.type === "sheet"
                  ? 20
                  : !element.parentId
                    ? 8
                    : 0
                : 0,
            );
            return ["Top", "Right", "Bottom", "Left"].map((side) => {
              const fallback =
                kind === "padding" &&
                  element.type === "sheet" &&
                  element.styles.padding == null &&
                  side === "Bottom"
                  ? 48
                  : legacy;
              return [
                `${kind}${side}`,
                clampNumber(
                  element.styles[`${kind}${side}`],
                  0,
                  kind === "padding" ? 48 : 100,
                  fallback,
                ),
              ];
            });
          }),
        ),
      },
      layout: [
        "layout",
        "absoluteLayout",
        "grid",
        "collection",
        "scrollView",
        "sheet",
        "accordion",
        "tabs",
        "tab",
      ].includes(element.type)
        ? {
          direction: element.layout?.direction === "row" ? "row" : "column",
          align: ["start", "center", "end", "stretch"].includes(
            element.layout?.align,
          )
            ? element.layout.align
            : "stretch",
          justify: ["start", "center", "end", "space-between"].includes(
            element.layout?.justify,
          )
            ? element.layout.justify
            : "start",
          gap: clampNumber(element.layout?.gap, 0, 48, 8),
          columns: clampNumber(element.layout?.columns, 1, 12, 2),
        }
        : element.layout,
      scroll:
        element.type === "scrollView"
          ? {
            axis: ["vertical", "horizontal", "both"].includes(
              element.scroll?.axis,
            )
              ? element.scroll.axis
              : "vertical",
            height: clampNumber(element.scroll?.height, 0, 100, 100),
          }
          : element.scroll,
      listSource:
        element.type === "list"
          ? {
            type: ["endpoint", "twk"].includes(element.listSource?.type)
              ? element.listSource.type
              : "static",
            requestId:
              typeof element.listSource?.requestId === "string"
                ? element.listSource.requestId
                : "",
            path:
              typeof element.listSource?.path === "string"
                ? element.listSource.path
                : "",
            field:
              typeof element.listSource?.field === "string"
                ? element.listSource.field
                : "",
            labelPath:
              typeof element.listSource?.labelPath === "string"
                ? element.listSource.labelPath
                : "label",
            valuePath:
              typeof element.listSource?.valuePath === "string"
                ? element.listSource.valuePath
                : "value",
          }
          : element.type === "collection"
            ? normalizeCollectionDataSource(element.listSource)
            : element.listSource,
      collectionItems:
        element.type === "collection" && Array.isArray(element.collectionItems)
          ? element.collectionItems
          : element.type === "collection"
            ? structuredClone(defaultCollectionItems)
            : element.collectionItems,
      options: ["list", "radio"].includes(element.type)
        ? normalizeOptions(
          element.options ?? defaultOptions,
          element.type === "radio" || !element.multiple,
        )
        : element.options,
    }));
    elements.forEach((element) => {
      const parent = elements.find(
        (candidate) => candidate.id === element.parentId,
      );
      const parentTypeSupportsChildren =
        [
          "layout",
          "absoluteLayout",
          "grid",
          "collection",
          "scrollView",
          "card",
          "sheet",
          "accordion",
          "tabs",
          "tab",
        ].includes(parent?.type) ||
        // Plugin definitions load asynchronously and are validated after loading.
        parent?.type === "custom";
      if (
        !parentTypeSupportsChildren ||
        parent.id === element.id ||
        parent.pageId !== element.pageId
      )
        element.parentId = null;
      const ancestors = new Set([element.id]);
      let current = parent;
      while (current) {
        if (ancestors.has(current.id)) {
          element.parentId = null;
          break;
        }
        ancestors.add(current.id);
        current = elements.find(
          (candidate) => candidate.id === current.parentId,
        );
      }
    });
    elements
      .filter((element) => element.type === "tabs")
      .forEach((tabs) => {
        const tabChildren = elements.filter(
          (element) =>
            element.parentId === tabs.id &&
            element.pageId === tabs.pageId &&
            element.type === "tab" &&
            !element.hidden,
        );
        if (!tabChildren.some((tab) => tab.id === tabs.activeTabId))
          tabs.activeTabId = tabChildren[0]?.id || "";
      });
    pruneElementAttributes(elements);
    const components = Array.isArray(parsed.components)
      ? parsed.components
        .filter(
          (component) =>
            component &&
            typeof component.id === "string" &&
            typeof component.name === "string" &&
            Array.isArray(component.elements) &&
            component.elements.length > 0 &&
            component.elements.every(
              (element) =>
                element &&
                typeof element.id === "string" &&
                Object.hasOwn(typeNames, element.type) &&
                typeof element.content === "string" &&
                element.styles &&
                typeof element.styles === "object",
            ),
        )
        .map((component) => ({
          id: component.id,
          name: component.name.slice(0, 40),
          elements: pruneElementAttributes(
            component.elements.map((element) => ({ ...element })),
          ),
        }))
      : [];
    const variables = Array.isArray(parsed.variables)
      ? parsed.variables
        .filter(
          (variable) =>
            variable &&
            typeof variable.id === "string" &&
            typeof variable.name === "string" &&
            /^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.name) &&
            variableSourceTypes.includes(variable.source),
        )
        .map((variable) => ({
          id: variable.id,
          name: variable.name,
          source: variable.source,
          value: variable.value,
          fieldName:
            typeof variable.fieldName === "string" ? variable.fieldName : "",
          fieldKey:
            typeof variable.fieldKey === "string" ? variable.fieldKey : "",
          requestId:
            typeof variable.requestId === "string" ? variable.requestId : "",
          path: typeof variable.path === "string" ? variable.path : "",
          propertyPath:
            typeof variable.propertyPath === "string"
              ? variable.propertyPath
              : "",
          elementId:
            typeof variable.elementId === "string" ? variable.elementId : "",
          property:
            typeof variable.property === "string" ? variable.property : "",
        }))
      : [];
    const userComponents = Array.isArray(parsed.userComponents)
      ? parsed.userComponents
        .filter(
          (component) =>
            component &&
            !Object.hasOwn(component, "plugin") &&
            typeof component.id === "string" &&
            typeof component.name === "string" &&
            typeof component.html === "string" &&
            typeof component.css === "string",
        )
        .map((component) => {
          const normalized = {
            id: component.id,
            name: component.name.slice(0, 60),
            html: component.html,
            css: component.css,
          };
          const plugin = normalizeStoredPluginComponent(component);
          if (plugin) normalized.plugin = plugin.plugin;
          return normalized;
        })
      : [];
    const assets = Array.isArray(parsed.assets)
      ? parsed.assets.filter(
        (asset) =>
          asset &&
          typeof asset.id === "string" &&
          typeof asset.name === "string" &&
          typeof asset.dataUrl === "string" &&
          asset.dataUrl.startsWith("data:") &&
          typeof asset.type === "string" &&
          Number.isFinite(asset.size) &&
          asset.size >= 0,
      )
      : [];
    const savedTheme = parsed.theme || {};
    const theme = Object.fromEntries(
      Object.keys(defaultTheme).map((key) => {
        const legacyKey = {
          foreground: "text",
          card: "surface",
          cardForeground: "text",
          popover: "surface",
          popoverForeground: "text",
          secondary: "accent",
        }[key];
        const legacyValue =
          key === "secondaryForeground" &&
            savedTheme.secondary == null &&
            savedTheme.accent
            ? "#ffffff"
            : key === "accentForeground" &&
              savedTheme.secondary == null &&
              savedTheme.accent
              ? "#ffffff"
              : legacyKey
                ? savedTheme[legacyKey]
                : undefined;
        return [
          key,
          safeColor(savedTheme[key] ?? legacyValue, defaultTheme[key]),
        ];
      }),
    );

    return {
      pages,
      elements,
      components,
      userComponents,
      variables,
      assets,
      customCss: typeof parsed.customCss === "string" ? parsed.customCss : "",
      theme,
      settings: {
        ...defaultSettings,
        ...(parsed.settings && typeof parsed.settings === "object"
          ? parsed.settings
          : {}),
        appMargin: clampNumber(parsed.settings?.appMargin, 0, 100, 0),
        appElementSize: ["small", "normal", "large"].includes(
          parsed.settings?.appElementSize,
        )
          ? parsed.settings.appElementSize
          : "normal",
        appTheme: parsed.settings?.appTheme === "dark" ? "dark" : "light",
        appDarkTheme: normalizeThemeColors(
          parsed.settings?.appDarkTheme,
          darkThemeColors,
        ),
        ...normalizeAppSpacing(parsed.settings),
        appTopBarType:
          parsed.settings?.appTopBarType ?? defaultSettings.appTopBarType,
        appLogoAssetId:
          typeof parsed.settings?.appLogoAssetId === "string" &&
            assets.some(
              (asset) =>
                asset.id === parsed.settings.appLogoAssetId &&
                asset.type.startsWith("image/"),
            )
            ? parsed.settings.appLogoAssetId
            : "",
        appLanguage: parsed.settings?.appLanguage === "en" ? "en" : "ar",
        titleLocalizations: normalizeLocalizedContent(
          parsed.settings?.titleLocalizations,
        ),
        organizationLocalizations: normalizeLocalizedContent(
          parsed.settings?.organizationLocalizations,
        ),
        appApiProgressIndicator:
          typeof parsed.settings?.appApiProgressIndicator === "boolean"
            ? parsed.settings.appApiProgressIndicator
            : defaultSettings.appApiProgressIndicator,
        appApiProgressLabel:
          typeof parsed.settings?.appApiProgressLabel === "boolean"
            ? parsed.settings.appApiProgressLabel
            : defaultSettings.appApiProgressLabel,
        appShowErrorMessage:
          typeof parsed.settings?.appShowErrorMessage === "boolean"
            ? parsed.settings.appShowErrorMessage
            : defaultSettings.appShowErrorMessage,
        appLoadHandlers: normalizeAppLoadHandlers(
          parsed.settings?.appLoadHandlers,
        ),
        globalActions: normalizeGlobalActions(parsed.settings?.globalActions),
      },
    };
  } catch (error) {
    console.error("Unable to load the saved builder project.", error);
    return {
      pages: structuredClone(defaultPages),
      elements: pruneElementAttributes(
        structuredClone(defaultElements).map((element) => ({
          ...element,
          pageId: defaultPages[0].id,
        })),
      ),
      components: [],
      userComponents: [],
      variables: [],
      assets: [],
      customCss: "",
      theme: structuredClone(defaultTheme),
      settings: structuredClone(defaultSettings),
    };
  }
}

function loadRequests() {
  try {
    const saved = localStorage.getItem(REQUESTS_STORAGE_KEY);
    if (!saved) {
      return [];
    }
    const parsed = JSON.parse(saved);
    if (
      !Array.isArray(parsed) ||
      parsed.some(
        (request) =>
          !request ||
          typeof request.id !== "string" ||
          typeof request.name !== "string" ||
          !requestMethods.includes(request.method) ||
          typeof request.url !== "string" ||
          !["load", "button"].includes(request.trigger) ||
          typeof request.headers !== "string" ||
          typeof request.body !== "string",
      )
    ) {
      throw new Error("Saved API request data has an invalid shape.");
    }
    return parsed;
  } catch (error) {
    console.error("Unable to load saved API requests.", error);
    return [];
  }
}

let nextElementId = 1;

function createId() {
  const existingIds = new Set([
    ...state.elements.map((element) => element.id),
    ...state.requests.map((request) => request.id),
    ...state.components.map((component) => component.id),
    ...state.components.flatMap((component) =>
      component.elements.map((element) => element.id),
    ),
    ...state.userComponents.map((component) => component.id),
  ]);
  let id = `element-${nextElementId}`;
  while (existingIds.has(id)) {
    nextElementId += 1;
    id = `element-${nextElementId}`;
  }
  nextElementId += 1;
  return id;
}

function createPageId() {
  return `page-${globalThis.crypto.randomUUID()}`;
}

function isContainer(element) {
  return [
    "layout",
    "absoluteLayout",
    "grid",
    "collection",
    "scrollView",
    "card",
    "sheet",
    "accordion",
    "tabs",
    "tab",
  ].includes(element?.type) ||
    (element?.type === "custom" &&
      Boolean(getPluginForElement(element)?.acceptsChildren));
}

function normalizePluginContainerParents() {
  const componentIds = new Set(
    state.userComponents.map((component) => component.id),
  );
  state.elements.forEach((element) => {
    const parent = state.elements.find(
      (candidate) => candidate.id === element.parentId,
    );
    if (
      parent?.type !== "custom" ||
      !componentIds.has(parent.customComponentId) ||
      isContainer(parent)
    )
      return;
    element.parentId = null;
  });
}

function getSingleRootContainer(pageId = state.currentPageId) {
  const rootContainers = state.elements.filter(
    (element) =>
      element.pageId === pageId &&
      !element.parentId &&
      element.type !== "sheet" &&
      isContainer(element),
  );
  return rootContainers.length === 1 ? rootContainers[0] : null;
}

function getAbsoluteLayoutChildAlignment(element) {
  const parent = state.elements.find(
    (candidate) => candidate.id === element?.parentId,
  );
  if (parent?.type !== "absoluteLayout") return null;
  return {
    horizontal: ["start", "center", "end"].includes(element.horizontalAlignment)
      ? element.horizontalAlignment
      : "start",
    vertical: ["top", "center", "bottom"].includes(element.verticalAlignment)
      ? element.verticalAlignment
      : "top",
  };
}

function isInsideCollection(element) {
  let parent = state.elements.find(
    (candidate) => candidate.id === element.parentId,
  );
  while (parent) {
    if (parent.type === "collection") return true;
    parent = state.elements.find(
      (candidate) => candidate.id === parent.parentId,
    );
  }
  return false;
}

function getPreviewItemContext(element) {
  let parent = state.elements.find(
    (candidate) => candidate.id === element?.parentId,
  );
  while (parent) {
    if (parent.type === "collection")
      return getCollectionItems(parent)[0] || null;
    parent = state.elements.find(
      (candidate) => candidate.id === parent.parentId,
    );
  }
  return null;
}

function normalizeExtraData(value) {
  if (!Array.isArray(value)) return [];
  const keys = new Set();
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      key: String(item.key || "").trim(),
      value: String(item.value ?? ""),
    }))
    .filter((item) => {
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(item.key) || keys.has(item.key))
        return false;
      keys.add(item.key);
      return true;
    });
}

/**
 * @typedef {{ type: "static" } | { type: "endpoint", requestId: string, path: string } | { type: "twk", field: string }} CollectionDataSource
 */
function normalizeCollectionDataSource(source) {
  if (source?.type === "endpoint")
    return {
      type: "endpoint",
      requestId: typeof source.requestId === "string" ? source.requestId : "",
      path: typeof source.path === "string" ? source.path : "",
    };
  if (source?.type === "twk")
    return {
      type: "twk",
      field:
        typeof source.field === "string" && source.field
          ? source.field
          : "family_members",
    };
  return { type: "static" };
}

function pruneElementAttributes(elements) {
  const elementsById = new Map(
    elements.map((element) => [element.id, element]),
  );
  const insideCollection = (element) => {
    const visited = new Set([element.id]);
    let parent = elementsById.get(element.parentId);
    while (parent && !visited.has(parent.id)) {
      if (parent.type === "collection") return true;
      visited.add(parent.id);
      parent = elementsById.get(parent.parentId);
    }
    return false;
  };
  const fieldsByType = {
    accordion: ["accordionOpen", "layout"],
    button: ["iconClass"],
    chip: ["chipSelected"],
    progress: ["progressMode", "progressValue", "progressMax"],
    switch: ["checked", "fieldName", "fieldValue"],
    image: ["imageUrl", "assetId", "imageFit"],
    icon: ["iconClass"],
    custom: ["customComponentId", "pluginProperties"],
    card: ["cardHeader", "cardFooter"],
    input: ["fieldName", "inputType", "min", "max"],
    filePicker: ["fieldName", "filePickerMode", "filePickerAppearance"],
    list: ["fieldName", "multiple", "options", "listSource"],
    checkbox: ["fieldName", "checked", "fieldValue"],
    radio: ["fieldName", "options"],
    layout: ["layout"],
    absoluteLayout: [],
    grid: ["layout"],
    collection: ["layout", "listSource", "collectionItems"],
    scrollView: ["layout", "scroll"],
    sheet: ["layout"],
  };

  elements.forEach((element) => {
    if (element.type === "collection")
      element.listSource = normalizeCollectionDataSource(element.listSource);
    const supportedFields = new Set(fieldsByType[element.type] || []);
    if (element.binding?.source === "item" && !insideCollection(element)) {
      delete element.binding;
    }
    supportedFields.add("className");
    supportedFields.add("action");
    supportedFields.add("binding");
    supportedFields.add("parentId");
    supportedFields.add("pageId");
    supportedFields.add("styles");
    supportedFields.add("hidden");
    if (
      [
        "button",
        "input",
        "list",
        "checkbox",
        "radio",
        "chip",
        "fab",
        "switch",
        "toast",
        "filePicker",
      ].includes(element.type)
    )
      supportedFields.add("disabled");
    supportedFields.add("id");
    supportedFields.add("type");
    supportedFields.add("content");
    supportedFields.add("localizations");
    supportedFields.add("extraData");
    supportedFields.add("savedComponentId");
    supportedFields.add("savedComponentInstanceId");
    supportedFields.add("savedComponentElementId");
    if (elementsById.get(element.parentId)?.type === "card")
      supportedFields.add("cardSlot");
    if (
      ["checkbox", "radio", "switch"].includes(element.type) &&
      insideCollection(element)
    ) {
      supportedFields.add("itemLabelPath");
      supportedFields.add("itemValuePath");
    }
    if (elementsById.get(element.parentId)?.type === "absoluteLayout") {
      supportedFields.add("horizontalAlignment");
      supportedFields.add("verticalAlignment");
    }

    [
      "imageUrl",
      "assetId",
      "imageFit",
      "iconClass",
      "iconDirection",
      "customComponentId",
      "pluginProperties",
      "savedComponentId",
      "savedComponentInstanceId",
      "savedComponentElementId",
      "cardHeader",
      "cardFooter",
      "cardSlot",
      "itemLabelPath",
      "itemValuePath",
      "horizontalAlignment",
      "verticalAlignment",
      "fieldName",
      "inputType",
      "min",
      "max",
      "disabled",
      "filePickerMode",
      "filePickerAppearance",
      "progressMode",
      "progressValue",
      "progressMax",
      "multiple",
      "checked",
      "fieldValue",
      "accordionOpen",
      "chipSelected",
      "options",
      "layout",
      "scroll",
      "listSource",
      "collectionItems",
      "localizations",
      "extraData",
    ].forEach((field) => {
      if (!supportedFields.has(field)) delete element[field];
    });
  });
  return elements;
}

function pruneSavedComponents(components) {
  return components
    .filter(
      (component) =>
        component &&
        Array.isArray(component.elements) &&
        component.elements.every(
          (element) => element && typeof element === "object",
        ),
    )
    .map((component) => ({
      ...component,
      elements: pruneElementAttributes(
        component.elements.map((element) => ({
          ...element,
          localizations: normalizeLocalizedContent(element.localizations),
        })),
      ),
    }));
}

function removeDefaultProperties(value, defaults, requiredKeys = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const required = new Set(requiredKeys);
  const cleaned = {};
  Object.entries(value).forEach(([key, child]) => {
    const defaultValue = defaults?.[key];
    if (
      !required.has(key) &&
      defaultValue !== undefined &&
      JSON.stringify(child) === JSON.stringify(defaultValue)
    )
      return;
    if (!required.has(key) && (child == null || child === "")) return;
    if (Array.isArray(child)) {
      if (!required.has(key) && child.length === 0) return;
      cleaned[key] = child;
      return;
    }
    if (child && typeof child === "object") {
      const nested = removeDefaultProperties(child);
      if (!required.has(key) && Object.keys(nested).length === 0) return;
      cleaned[key] = nested;
      return;
    }
    cleaned[key] = child;
  });
  return cleaned;
}

function getDefaultElementOutputValues(element) {
  const savedNextElementId = nextElementId;
  let defaults;
  try {
    defaults = createElement(element.type);
  } finally {
    nextElementId = savedNextElementId;
  }
  delete defaults.id;
  delete defaults.pageId;
  delete defaults.fieldName;
  defaults.activeTabId = "";
  if (element.type === "filePicker") {
    defaults.filePickerMode = "single";
    defaults.filePickerAppearance = "button";
  }
  return defaults;
}

function pruneProjectElementsForOutput(elements) {
  const defaultsByType = new Map();
  return pruneElementAttributes(
    elements.map((source) => {
      const element = { ...source };
      if (!defaultsByType.has(element.type))
        defaultsByType.set(
          element.type,
          getDefaultElementOutputValues(element),
        );
      const defaults = defaultsByType.get(element.type);
      if (
        element.action?.type === "none" &&
        !(
          Array.isArray(element.action.handlers) &&
          element.action.handlers.length
        )
      )
        delete element.action;
      if (element.styles)
        element.styles = removeDefaultProperties(
          element.styles,
          defaults.styles,
        );
      const output = removeDefaultProperties(element, defaults, [
        "id",
        "type",
        "pageId",
        "content",
        "styles",
      ]);
      if (element.type === "collection")
        output.listSource = normalizeCollectionDataSource(element.listSource);
      return output;
    }),
  );
}

function pruneProjectForOutput(project) {
  const output = {
    schemaVersion: project.schemaVersion,
    pages: project.pages,
    elements: pruneProjectElementsForOutput(project.elements),
  };
  if (project.requests?.length) output.requests = project.requests;
  if (project.components?.length)
    output.components = pruneSavedComponents(project.components);
  if (project.userComponents?.length)
    output.userComponents = project.userComponents;
  if (project.variables?.length)
    output.variables = project.variables.map((variable) =>
      removeDefaultProperties(
        variable,
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
  if (project.assets?.length) output.assets = project.assets;
  if (project.customCss) output.customCss = project.customCss;
  const theme = removeDefaultProperties(project.theme, defaultTheme);
  if (Object.keys(theme).length) output.theme = theme;
  output.settings = removeDefaultProperties(project.settings, defaultSettings, [
    "title",
    "orgnization",
    "appTopBarType",
  ]);
  return output;
}

function clearOrphanedItemBindings() {
  state.elements.forEach((element) => {
    if (!isInsideCollection(element)) {
      if (element.binding?.source === "item") delete element.binding;
      delete element.itemLabelPath;
      delete element.itemValuePath;
    }
  });
  pruneElementAttributes(state.elements);
}

function createElement(type) {
  const content = {
    heading: localize.NewTitle.ar,
    text: localize.EnterTextHere.ar,
    button: localize.ClickHere.ar,
    accordion: "تفاصيل إضافية",
    tabs: "",
    tab: "تبويب جديد",
    chip: "اختيار",
    breadcrumbs: "الرئيسية / الصفحة الحالية",
    badge: "جديد",
    fab: "+",
    toast: "تمت العملية بنجاح",
    loading: "جارٍ التحميل",
    progress: "التقدم",
    switch: "مفتاح التشغيل",
    card: localize.EnterCardContent.ar,
    input: localize.EnterText.ar,
    filePicker: localize.FilePicker.ar,
    list: localize.ChooseAnItem.ar,
    checkbox: localize.IAgreeToTheTerms.ar,
    radio: localize.ChooseAnOption.ar,
    layout: "",
    absoluteLayout: "",
    grid: "",
    scrollView: "",
    sheet: "sheet",
    divider: "",
    image: "Image URL is not set",
    collection: "",
    icon: localize.IconAlternativeA.ar,
    custom: "",
  }[type];

  const defaultPadding = (side) => {
    if (type === "divider") return 0;
    if (type !== "sheet") return 8;
    return side === "Bottom" ? 48 : 20;
  };
  const id = createId();
  const element = {
    id,
    type,
    pageId: state.currentPageId,
    content,
    imageUrl: "",
    assetId: "",
    className: "",
    iconClass: type === "button" ? "" : "fa-home",
    customComponentId: "",
    cardHeader: "",
    cardFooter: "",
    cardSlot: "content",
    localizations: {},
    extraData: [],
    itemLabelPath: "",
    itemValuePath: "",
    action: null,
    imageFit: "contain",
    binding: null,
    fieldName: `${type}_${id.slice(-8)}`,
    inputType: "text",
    min: "",
    max: "",
    hidden: false,
    disabled: false,
    multiple: false,
    checked: false,
    fieldValue: true,
    accordionOpen: true,
    chipSelected: false,
    progressMode: "indeterminate",
    progressValue: 0,
    progressMax: 100,
    options: structuredClone(defaultOptions),
    parentId: null,
    horizontalAlignment: "start",
    verticalAlignment: "top",
    layout: {
      direction: "column",
      align: "stretch",
      justify: "start",
      gap: 8,
      columns: 2,
    },
    scroll: { axis: "vertical", height: 100 },
    listSource:
      type === "collection"
        ? { type: "static" }
        : {
          type: "static",
          requestId: "",
          path: "",
          field: "",
          labelPath: "label",
          valuePath: "value",
        },
    collectionItems:
      type === "collection" ? structuredClone(defaultCollectionItems) : [],
    styles: {
      color:
        type === "button" || type === "fab"
          ? "#ffffff"
          : type === "chip"
            ? getActiveThemeColor("accentForeground")
            : type === "badge"
              ? getActiveThemeColor("primaryForeground")
              : state.theme.foreground,
      background:
        type === "button" || type === "fab"
          ? state.theme.primary
          : type === "chip"
            ? state.theme.accent
            : type === "badge"
              ? state.theme.primary
              : state.theme.card,
      fontSize: type === "heading" ? 18 : 14,
      align: "start",
      padding: defaultPadding("Top"),
      width: "",
      height: type === "absoluteLayout" ? "200px" : "",
      margin: 0,
      paddingTop: defaultPadding("Top"),
      paddingRight: defaultPadding("Right"),
      paddingBottom: defaultPadding("Bottom"),
      paddingLeft: defaultPadding("Left"),
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
      borderWidth: 0,
      borderColor: "#dbe5e1",
      borderRadius: defaultBorderRadius(type),
      variant: ["button", "fab", "badge"].includes(type)
        ? "primary"
        : ["chip", "toast"].includes(type)
          ? "secondary"
          : "custom",
    },
  };
  return pruneElementAttributes([element])[0];
}

function normalizeOptions(value, singleSelection = false) {
  if (!Array.isArray(value)) return [];
  let hasSelectedOption = false;
  return value
    .filter((option) => option && Object.hasOwn(option, "value"))
    .map((option, index) => {
      const selected =
        option.selected === true &&
        (!singleSelection || !hasSelectedOption);
      if (selected) hasSelectedOption = true;
      return {
        label:
          typeof option.label === "string"
            ? option.label
            : `الخيار ${index + 1}`,
        value: option.value,
        ...(selected ? { selected: true } : {}),
      };
    });
}

function getFormName(element) {
  return typeof element.fieldName === "string" && element.fieldName.trim()
    ? element.fieldName.trim()
    : element.id;
}

function saveProject() {
  try {
    const project = pruneProjectForOutput({
      schemaVersion: 5,
      pages: state.pages,
      elements: state.elements,
      components: state.components,
      userComponents: state.userComponents.filter(
        (component) => !Object.hasOwn(component, "plugin"),
      ),
      variables: state.variables,
      assets: state.assets,
      customCss: state.customCss,
      theme: state.theme,
      settings: state.settings,
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(state.requests));
    saveStatus.textContent = localize.SavedLocally[editorLanguage];
    return true;
  } catch (error) {
    saveStatus.textContent = localize.UnableToSave[editorLanguage];
    showToast(localize.UnableToSaveChangesInThisBrowser[editorLanguage]);
    console.error("Unable to save the builder project.", error);
    return false;
  }
}

function updateHistoryControls() {
  document.querySelector("#undo-action").disabled =
    elementHistory.undo.length === 0;
  document.querySelector("#redo-action").disabled =
    elementHistory.redo.length === 0;
  document.querySelector("#copy-action").disabled =
    state.selectedIds.length === 0 && !state.selectedId;
  document.querySelector("#paste-action").disabled =
    state.clipboardRootIds.length === 0;
  document.querySelector("#select-all-action").disabled = !state.elements.some(
    (element) =>
      element.pageId === state.currentPageId &&
      !element.hidden &&
      element.type !== "sheet",
  );
}

function recordElementHistory() {
  const snapshot = JSON.stringify(state.elements);
  if (snapshot === elementHistory.snapshot) return;
  const now = performance.now();
  if (
    !elementHistory.undo.length ||
    now - elementHistory.lastRecordedAt > ELEMENT_HISTORY_COALESCE_MS
  ) {
    elementHistory.undo.push(elementHistory.snapshot);
    if (elementHistory.undo.length > ELEMENT_HISTORY_LIMIT)
      elementHistory.undo.shift();
  }
  elementHistory.snapshot = snapshot;
  elementHistory.lastRecordedAt = now;
  elementHistory.redo.length = 0;
  updateHistoryControls();
}

function restoreElementHistorySnapshot(snapshot) {
  state.elements = JSON.parse(snapshot);
  elementHistory.snapshot = snapshot;
  elementHistory.lastRecordedAt = 0;
  state.selectedIds = state.selectedIds.filter((id) =>
    state.elements.some(
      (element) => element.id === id && element.pageId === state.currentPageId,
    ),
  );
  if (!state.selectedIds.includes(state.selectedId))
    state.selectedId = state.selectedIds[state.selectedIds.length - 1] || null;
  renderPreview();
  scheduleSave();
}

function undoBuilderAction() {
  if (!elementHistory.undo.length) return;
  elementHistory.redo.push(elementHistory.snapshot);
  restoreElementHistorySnapshot(elementHistory.undo.pop());
  updateHistoryControls();
}

function redoBuilderAction() {
  if (!elementHistory.redo.length) return;
  elementHistory.undo.push(elementHistory.snapshot);
  restoreElementHistorySnapshot(elementHistory.redo.pop());
  updateHistoryControls();
}

function scheduleSave() {
  recordElementHistory();
  saveStatus.textContent = localize.Saving[editorLanguage];
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  if (state.editingSavedComponentInstanceId) return;
  state.saveTimer = setTimeout(() => {
    state.saveTimer = null;
    saveProject();
  }, 200);
}

window.addEventListener("pagehide", () => {
  if (state.saveTimer === null) return;
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  saveProject();
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const codeEditorLayers = new WeakMap();

function highlightCssSource(source) {
  const tokens =
    /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|@[a-z-]+|#[\da-f]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|vh|vw|%|s|ms)?\b|[{}:;,()]|[.#]?[a-z_-][\w-]*/gi;
  let output = "";
  let cursor = 0;
  for (const match of source.matchAll(tokens)) {
    const index = match.index;
    output += escapeHtml(source.slice(cursor, index));
    const token = match[0];
    let kind = "";
    if (token.startsWith("/*")) kind = "comment";
    else if (/^["']/.test(token)) kind = "string";
    else if (token.startsWith("@")) kind = "keyword";
    else if (/^#[\da-f]{3,8}$/i.test(token)) kind = "value";
    else if (/^\d/.test(token)) kind = "number";
    else if (/^[{}:;,()]$/.test(token)) kind = "punctuation";
    else if (/^[.#]/.test(token)) kind = "selector";
    else {
      const inBlock =
        source.lastIndexOf("{", index) > source.lastIndexOf("}", index);
      kind =
        inBlock && /^\s*:/.test(source.slice(index + token.length))
          ? "property"
          : "value";
    }
    output += `<span class="code-token-${kind}">${escapeHtml(token)}</span>`;
    cursor = index + token.length;
  }
  return output + escapeHtml(source.slice(cursor));
}

function highlightHtmlSource(source) {
  const tags = /<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][^>]*>/g;
  let output = "";
  let cursor = 0;
  for (const match of source.matchAll(tags)) {
    const index = match.index;
    output += escapeHtml(source.slice(cursor, index));
    const tag = match[0];
    if (tag.startsWith("<!--")) {
      output += `<span class="code-token-comment">${escapeHtml(tag)}</span>`;
    } else {
      const parts = tag.match(/^<(\/?)([A-Za-z][\w:-]*)([\s\S]*?)(\/?)>$/);
      if (!parts) {
        output += escapeHtml(tag);
      } else {
        output += `<span class="code-token-punctuation">&lt;${parts[1]}</span><span class="code-token-tag">${escapeHtml(parts[2])}</span>`;
        const attributes = parts[3];
        const attributePattern =
          /([^\s=/>]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)?/g;
        let attributeCursor = 0;
        for (const attribute of attributes.matchAll(attributePattern)) {
          output += escapeHtml(
            attributes.slice(attributeCursor, attribute.index),
          );
          output += `<span class="code-token-attribute">${escapeHtml(attribute[1])}</span>${escapeHtml(attribute[2])}`;
          if (attribute[3])
            output += `<span class="code-token-string">${escapeHtml(attribute[3])}</span>`;
          attributeCursor = attribute.index + attribute[0].length;
        }
        output += escapeHtml(attributes.slice(attributeCursor));
        output += `<span class="code-token-punctuation">${parts[4]}&gt;</span>`;
      }
    }
    cursor = index + tag.length;
  }
  return output + escapeHtml(source.slice(cursor));
}

function refreshCodeEditor(textarea) {
  const editor = codeEditorLayers.get(textarea);
  if (!editor) return;
  const source = textarea.value || " ";
  editor.code.innerHTML =
    textarea.dataset.codeLanguage === "html"
      ? highlightHtmlSource(source)
      : highlightCssSource(source);
  editor.scroller.scrollTop = textarea.scrollTop;
  editor.scroller.scrollLeft = textarea.scrollLeft;
}

function setupCodeEditors() {
  document
    .querySelectorAll("textarea[data-code-language]")
    .forEach((textarea) => {
      const computed = getComputedStyle(textarea);
      const wrapper = document.createElement("div");
      wrapper.className = "code-editor";
      wrapper.style.height = `${textarea.getBoundingClientRect().height}px`;
      wrapper.style.font = computed.font;
      wrapper.style.lineHeight = computed.lineHeight;
      wrapper.style.setProperty("--code-padding", computed.padding);
      const scroller = document.createElement("pre");
      scroller.className = "code-editor-layer";
      scroller.setAttribute("aria-hidden", "true");
      const code = document.createElement("code");
      scroller.append(code);
      textarea.parentNode.insertBefore(wrapper, textarea);
      wrapper.append(scroller, textarea);
      textarea.wrap = "off";
      textarea.style.padding = "var(--code-padding)";
      textarea.style.font = "inherit";
      textarea.style.lineHeight = "inherit";
      textarea.addEventListener("input", () => refreshCodeEditor(textarea));
      textarea.addEventListener("scroll", () => refreshCodeEditor(textarea));
      codeEditorLayers.set(textarea, { code, scroller });
      refreshCodeEditor(textarea);
    });
}

function safeCustomHtml(value) {
  const template = document.createElement("template");
  template.innerHTML = value;
  template.content
    .querySelectorAll("script")
    .forEach((script) => script.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const content = attribute.value.trim().toLowerCase();
      const unsafeUrl =
        /^(?:javascript|vbscript):/.test(content) ||
        /^data:text\/html\b/.test(content);
      if (
        name.startsWith("on") ||
        name === "srcdoc" ||
        (["href", "src", "action", "formaction", "xlink:href", "data"].includes(
          name,
        ) &&
          unsafeUrl)
      )
        node.removeAttribute(attribute.name);
    });
  });
  return template.innerHTML;
}

function scopeCss(css, scope, prioritize = false) {
  if (!css.trim()) return "";
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const serializeDeclarations = (style) => {
    if (!prioritize) return style.cssText;
    const source = style.cssText;
    const declarations = [];
    let start = 0;
    let depth = 0;
    let quote = "";
    let escaped = false;
    const appendDeclaration = (end) => {
      const declaration = source.slice(start, end).trim();
      const separator = declaration.indexOf(":");
      if (separator < 1) return;
      const property = declaration.slice(0, separator).trim();
      const value = style.getPropertyValue(property);
      const priority = style.getPropertyPriority(property) || "important";
      declarations.push(`${property}: ${value}${priority ? ` !${priority}` : ""};`);
    };

    for (let index = 0; index <= source.length; index += 1) {
      const character = source[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (quote) {
        if (character === quote) quote = "";
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
      } else if (character === "(" || character === "[" || character === "{") {
        depth += 1;
      } else if (character === ")" || character === "]" || character === "}") {
        depth -= 1;
      } else if ((character === ";" && depth === 0) || index === source.length) {
        appendDeclaration(index);
        start = index + 1;
      }
    }

    return declarations.join(" ");
  };
  const serialize = (rules) =>
    [...rules]
      .map((rule) => {
        if (rule.type === CSSRule.STYLE_RULE) {
          const selectors = [];
          let selector = "";
          let depth = 0;
          let quote = "";
          for (const character of rule.selectorText) {
            if (quote) {
              selector += character;
              if (character === quote) quote = "";
            } else if (character === '"' || character === "'") {
              quote = character;
              selector += character;
            } else if (character === "(" || character === "[") {
              depth += 1;
              selector += character;
            } else if (character === ")" || character === "]") {
              depth -= 1;
              selector += character;
            } else if (character === "," && depth === 0) {
              selectors.push(selector.trim());
              selector = "";
            } else selector += character;
          }
          selectors.push(selector.trim());
          return `${selectors
            .map((item) => {
              if (item === "*") return `${scope}, ${scope} *`;
              const rootSelector = item.match(
                /^(:root|:host|html|body)(?=$|[\s>+~.#:[\]])/,
              );
              if (rootSelector)
                return `${scope}${item.slice(rootSelector[0].length)}`;
              return `${scope} ${item}`;
            })
            .join(", ")} { ${serializeDeclarations(rule.style)} }`;
        }
        if (rule.cssRules && rule.conditionText) {
          const atRule =
            rule.type === CSSRule.MEDIA_RULE
              ? "@media"
              : rule.type === CSSRule.SUPPORTS_RULE
                ? "@supports"
                : rule.type === CSSRule.CONTAINER_RULE
                  ? "@container"
                  : "";
          if (atRule)
            return `${atRule} ${rule.conditionText} { ${serialize(rule.cssRules)} }`;
        }
        return rule.cssText;
      })
      .join("\n");
  return serialize(sheet.cssRules);
}

function customComponentClass(componentId) {
  const encodedId = Array.from(componentId)
    .map((character) => character.codePointAt(0).toString(16))
    .join("-");
  return `custom-component-${encodedId}`;
}

function buildCustomComponentStyles() {
  return state.userComponents
    .filter((component) => !component.plugin)
    .map((component) =>
      scopeCss(component.css, `.${customComponentClass(component.id)}`),
    )
    .filter(Boolean)
    .join("\n");
}

function buildAdditionalComponentStyles(scope) {
  const styles = `
.content-loading,
.content-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}
.content-loading-spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  border: 3px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: content-loading-spin 750ms linear infinite;
}
@keyframes content-loading-spin {
  to { transform: rotate(360deg); }
}
.content-progress-bar:not([role="progressbar"]) {
  width: 100%;
  min-width: 40px;
  accent-color: var(--theme-primary, #007a53);
}
.content-progress-bar[role="progressbar"] {
  flex: 1 1 auto;
  min-width: 40px;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--theme-muted, #d2e0dc);
}
.content-progress-fill {
  height: 100%;
  background: var(--theme-primary, #007a53);
}
.content-progress-label {
  flex: 0 0 auto;
}
.content-switch-label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
.content-switch-label input {
  appearance: none;
  position: relative;
  width: 42px;
  height: 24px;
  margin: 0;
  border: 0;
  border-radius: 999px;
  background: var(--theme-muted, #d2e0dc);
  cursor: pointer;
  transition: background-color 140ms ease;
}
.content-switch-label input::before {
  position: absolute;
  top: 3px;
  inset-inline-start: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 20%);
  content: "";
  transition: transform 140ms ease;
}
.content-switch-label input:checked {
  background: var(--theme-primary, #007a53);
}
.content-switch-label input:checked::before {
  transform: translateX(18px);
}
.content-switch-label:dir(rtl) input:checked::before {
  transform: translateX(-18px);
}
.content-switch-label input:focus-visible {
  outline: 2px solid var(--theme-ring, #007a53);
  outline-offset: 2px;
}
.content-switch-label input:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.content button:disabled,
.content input:disabled,
.content select:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.element-ripple-layer {
  position: fixed;
  z-index: 9999;
  overflow: hidden;
  box-sizing: border-box;
  pointer-events: none;
}
.element-ripple-wave {
  position: absolute;
  top: var(--ripple-y);
  left: var(--ripple-x);
  width: var(--ripple-size);
  height: var(--ripple-size);
  border-radius: 50%;
  background: currentColor;
  opacity: 0.2;
  transform: translate(-50%, -50%) scale(0);
  animation: element-ripple-wave 600ms ease-out forwards;
}
@keyframes element-ripple-wave {
  to {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .element-ripple-wave {
    animation-duration: 1ms;
  }
}
.content-chip.variant-primary {
  background: var(--theme-primary, #007a53) !important;
  color: var(--primary-foreground, #fff) !important;
}
.content-chip.variant-secondary {
  background: var(--theme-secondary, #e6f4ea) !important;
  color: var(--secondary-foreground, #004d33) !important;
}
.content-chip.variant-success,
.content-toast.variant-success,
.content-badge.variant-success {
  background: #e6f4ea !important;
  color: #176b3a !important;
}
.content-chip.variant-warning,
.content-toast.variant-warning,
.content-badge.variant-warning {
  background: #fff3d6 !important;
  color: #815700 !important;
}
.content-chip.variant-destructive,
.content-toast.variant-destructive,
.content-badge.variant-destructive {
  background: #fde9e6 !important;
  color: #a52c1a !important;
}
.content-chip.variant-outline {
  border-color: var(--theme-primary, #007a53) !important;
  background: transparent !important;
  color: var(--theme-primary, #007a53) !important;
}
.content-toast.variant-primary,
.content-badge.variant-primary {
  background: var(--theme-primary, #007a53) !important;
  color: var(--primary-foreground, #fff) !important;
}
.content-toast.variant-secondary,
.content-badge.variant-secondary {
  background: var(--theme-secondary, #e6f4ea) !important;
  color: var(--secondary-foreground, #004d33) !important;
}`;
  return scopeCss(styles, scope);
}

let sharedPreviewStyles;

function buildSharedPreviewStyles() {
  if (sharedPreviewStyles) return sharedPreviewStyles;

  const styles = buildStyles();
  const start = styles.indexOf(".content-button.variant-primary,");
  if (start < 0) throw new Error("Shared app styles marker was not found.");

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles.slice(start));
  const sharedRules = [...sheet.cssRules]
    .map((rule) => rule.cssText)
    .join("\n");
  sharedPreviewStyles = `${scopeCss(sharedRules, "#app-preview")}
${buildAdditionalComponentStyles("#app-preview")}
#app-preview .content-sheet {
  position: absolute;
  z-index: 6;
  top: auto;
  right: auto;
  bottom: 8px;
  left: 50%;
  width: min(504px, calc(100% - 16px));
  max-height: 75%;
  transform: translateX(-50%);
  opacity: 1;
  visibility: visible;
  transition: none;
}`;
  return sharedPreviewStyles;
}

function safeColor(value, fallback) {
  return /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

function normalizeThemeColors(colors, fallback) {
  const source =
    colors && typeof colors === "object" && !Array.isArray(colors)
      ? colors
      : {};
  return Object.fromEntries(
    Object.entries(fallback).map(([name, defaultColor]) => [
      name,
      safeColor(source[name], defaultColor),
    ]),
  );
}

function getActiveThemeColor(name) {
  const color =
    state.settings.appTheme === "dark"
      ? state.settings.appDarkTheme[name]
      : state.theme[name];
  return safeColor(color, defaultTheme[name]);
}

function applyPreviewTheme() {
  Object.keys(defaultTheme).forEach((name) => {
    const property = `--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
    preview.style.setProperty(property, getActiveThemeColor(name));
  });
  Object.entries(themeCssVariableAliases).forEach(([variable, name]) => {
    preview.style.setProperty(variable, getActiveThemeColor(name));
  });
  preview.style.setProperty("--preview-bg", getActiveThemeColor("background"));
  preview.style.setProperty("--preview-surface", getActiveThemeColor("card"));
  preview.style.setProperty("--preview-text", getActiveThemeColor("foreground"));
}

function getElementThemeColor(element, property) {
  if (property === "background" && element.styles[property] === "transparent")
    return "transparent";
  const value = safeColor(
    element.styles[property],
    property === "color"
      ? ["button", "fab"].includes(element.type)
        ? "#ffffff"
        : element.type === "chip"
          ? getActiveThemeColor("accentForeground")
          : element.type === "badge"
            ? getActiveThemeColor("primaryForeground")
            : element.type === "card"
              ? getActiveThemeColor("cardForeground")
              : getActiveThemeColor("foreground")
      : ["button", "fab"].includes(element.type)
        ? getActiveThemeColor("primary")
        : element.type === "chip"
          ? getActiveThemeColor("accent")
          : element.type === "badge"
            ? getActiveThemeColor("primary")
            : getActiveThemeColor("card"),
  );
  if (element.type === "chip") {
    if (
      property === "background" &&
      ["#eaf4f0", defaultTheme.accent, state.theme.accent.toLowerCase()].includes(
        value.toLowerCase(),
      )
    )
      return getActiveThemeColor("accent");
    if (
      property === "color" &&
      [
        "#176b59",
        "#263b35",
        "#243632",
        defaultTheme.foreground,
        state.theme.accentForeground.toLowerCase(),
      ].includes(
        value.toLowerCase(),
      )
    )
      return getActiveThemeColor("accentForeground");
  }
  if (element.type === "badge") {
    if (
      property === "background" &&
      ["#176b59", defaultTheme.primary, state.theme.primary.toLowerCase()].includes(
        value.toLowerCase(),
      )
    )
      return getActiveThemeColor("primary");
    if (
      property === "color" &&
      [
        "#176b59",
        "#ffffff",
        defaultTheme.primaryForeground,
        state.theme.primaryForeground.toLowerCase(),
      ].includes(
        value.toLowerCase(),
      )
    )
      return getActiveThemeColor("primaryForeground");
  }
  if (
    property === "color" &&
    element.type === "card" &&
    [
      "#263b35",
      "#243632",
      defaultTheme.foreground,
      state.theme.cardForeground.toLowerCase(),
    ].includes(
      value.toLowerCase(),
    )
  )
    return getActiveThemeColor("cardForeground");
  if (
    property === "background" &&
    element.type === "button" &&
    ["#176b59", defaultTheme.primary, state.theme.primary.toLowerCase()].includes(
      value.toLowerCase(),
    )
  )
    return getActiveThemeColor("primary");
  if (
    property === "background" &&
    element.type !== "button" &&
    ["#ffffff", defaultTheme.card, state.theme.card.toLowerCase()].includes(
      value.toLowerCase(),
    )
  )
    return getActiveThemeColor("card");
  if (
    property === "color" &&
    element.type !== "button" &&
    [
      "#263b35",
      "#243632",
      defaultTheme.foreground,
      state.theme.foreground.toLowerCase(),
    ].includes(
      value.toLowerCase(),
    )
  )
    return getActiveThemeColor("foreground");
  return value;
}

function getExportThemeColor(name, value) {
  const activeTheme =
    state.settings.appTheme === "dark"
      ? state.settings.appDarkTheme
      : state.theme;
  return String(value).toLowerCase() ===
    safeColor(activeTheme[name], defaultTheme[name]).toLowerCase()
    ? `var(--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)})`
    : value;
}

function getExportElementThemeColor(element, property) {
  const value = getElementThemeColor(element, property);
  if (value === "transparent") return value;
  const token =
    property === "background"
      ? element.type === "button" || element.type === "fab"
        ? "primary"
        : element.type === "chip"
          ? "accent"
          : element.type === "badge"
            ? "primary"
            : "card"
      : element.type === "button" || element.type === "fab"
        ? "primaryForeground"
        : element.type === "chip"
          ? "accentForeground"
          : element.type === "badge"
            ? "primaryForeground"
            : element.type === "card"
              ? "cardForeground"
              : "foreground";
  return getExportThemeColor(token, value);
}

function safeImageUrl(value) {
  const url = String(value || "").trim();
  if (!url || /^javascript:/i.test(url)) return "";
  if (/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/=]+$/i.test(url))
    return url;
  try {
    const parsed = new URL(url, location.href);
    return ["http:", "https:", "file:"].includes(parsed.protocol) ? url : "";
  } catch {
    return "";
  }
}

function readPath(value, path) {
  if (!path) return value;
  return path
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => {
      if (key === "__proto__" || key === "prototype" || key === "constructor")
        return undefined;
      if (Array.isArray(current) && /^\d+$/.test(key))
        return current[Number(key)];
      return current && typeof current === "object" ? current[key] : undefined;
    }, value);
}

function readValuePath(value, path) {
  const valuePath = typeof path === "string" ? path.trim() : "";
  let source = value;
  if (
    typeof source === "string" &&
    (source.trim().startsWith("{") || source.trim().startsWith("["))
  ) {
    try {
      source = JSON.parse(source);
    } catch {
      if (valuePath) return undefined;
    }
  }
  return valuePath ? readPath(source, valuePath) : source;
}

function formatBoundValue(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const isValueObject = typeof value === "object";
  return isValueObject ? JSON.stringify(value) : String(value);
}

function getPreviewTokenValue(reference, itemContext, visited) {
  const itemToken = reference.match(/^item\.(.+)$/i);
  if (itemToken) return readPath(itemContext, itemToken[1]);
  const extraToken = reference.match(
    /^(.+)\.extra\.([A-Za-z_][A-Za-z0-9_-]*)$/,
  );
  if (extraToken)
    return getPreviewExtraValue(reference, itemContext, new Set(visited));
  const [rawSource, ...pathParts] = reference.split(".");
  const source = rawSource.toLowerCase();
  const path = pathParts.join(".");
  if (source === "twk")
    return TWK_FIELDS.find((field) => field.key === path.toLowerCase())?.sample;
  if (source === "api") {
    const separator = path.indexOf(".");
    if (separator < 1) return undefined;
    return readPath(
      state.responses[path.slice(0, separator)],
      path.slice(separator + 1),
    );
  }
  if (source === "var") {
    const variable = state.variables.find(
      (item) => item.name === path || item.id === path,
    );
    return getPreviewVariableValue(
      variable,
      collectPreviewFormValues(),
      itemContext,
      visited,
    );
  }
  if (source === "form") return collectPreviewFormValues().get(path);
  return undefined;
}

function getPreviewExtraValue(reference, itemContext, visited = new Set()) {
  const match = reference.match(/^(.+)\.extra\.([A-Za-z_][A-Za-z0-9_-]*)$/);
  if (!match) return undefined;
  const [, elementId, key] = match;
  const lookup = `${elementId}.${key}`;
  if (visited.has(lookup)) return undefined;
  visited.add(lookup);
  const source = state.elements.find((element) => element.id === elementId);
  const entry = source?.extraData?.find((item) => item.key === key);
  if (!entry) return undefined;
  const exactToken = entry.value.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
  if (exactToken)
    return getPreviewTokenValue(exactToken[1].trim(), itemContext, visited);
  return entry.value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (token, value) => {
    const resolved = getPreviewTokenValue(value.trim(), itemContext, visited);
    return resolved === undefined ? token : String(resolved);
  });
}

function getElementSourcePropertyOptions(element) {
  const options = [[localize.ElementID[editorLanguage], "id"]];
  const plugin = getPluginForElement(element);
  if (!plugin) options.push([localize.Content[editorLanguage], "content"]);
  if (plugin) {
    const localizedPlugin = localizePluginDefinition(plugin, editorLanguage);
    options.push([localize.PluginProperties[editorLanguage], "plugin"]);
    localizedPlugin.properties.forEach((property) =>
      options.push([
        `${localizedPlugin.title} · ${property.label}`,
        `plugin.${property.key}`,
      ]),
    );
  }
  if (element.type === "image")
    options.push([localize.ImageSource[editorLanguage], "src"]);
  const propertyLabels = {
    value: localize.Value[editorLanguage],
    files: localize.Files[editorLanguage],
    mode: localize.Mode[editorLanguage],
    min: localize.Minimum[editorLanguage],
    max: localize.Maximum[editorLanguage],
    isValid: localize.IsValid[editorLanguage],
    characterCount: localize.CharacterCount[editorLanguage],
    checked: localize.Checked[editorLanguage],
    selectedLabel: localize.SelectedLabel[editorLanguage],
    options: localize.Options[editorLanguage],
  };
  (componentRuntimePropertyRegistry[element.type] || []).forEach((property) => {
    options.push([propertyLabels[property] || property, property]);
  });
  if (element.type === "accordion")
    options.push([localize.OpenOption[editorLanguage], "open"]);
  if (element.type === "chip")
    options.push([localize.SelectedState[editorLanguage], "selected"]);
  options.push(
    [localize.Disabled[editorLanguage], "disabled"],
    [localize.Visible[editorLanguage], "visible"],
  );
  return options;
}

function getPreviewElementPropertyValue(elementId, property) {
  const element = state.elements.find((item) => item.id === elementId);
  if (!element) return undefined;
  const plugin = getPluginForElement(element);
  if (property === "plugin")
    return plugin
      ? normalizePluginProperties(plugin, element.pluginProperties)
      : undefined;
  if (typeof property === "string" && property.startsWith("plugin.")) {
    if (!plugin) return undefined;
    const key = property.slice("plugin.".length);
    if (!plugin.properties.some((candidate) => candidate.key === key))
      return undefined;
    return normalizePluginProperties(plugin, element.pluginProperties)[key];
  }
  const node = preview.querySelector(`[data-id="${CSS.escape(elementId)}"]`);
  const control = node?.matches("input, select, textarea, progress, details")
    ? node
    : node?.querySelector("input, select, textarea, progress, details");
  switch (property) {
    case "id":
      return element.id;
    case "src":
      return node?.getAttribute("src") || getImageSource(element);
    case "checked":
      return control instanceof HTMLInputElement
        ? control.checked
        : Boolean(element.checked);
    case "value":
      if (element.type === "filePicker") return undefined;
      if (["checkbox", "switch"].includes(element.type)) {
        if (!(control instanceof HTMLInputElement)) return undefined;
        try {
          return JSON.parse(control.dataset.formValue ?? control.value);
        } catch {
          return control.value;
        }
      }
      if (element.type === "radio") {
        const selected = node?.querySelector('input[type="radio"]:checked');
        if (!selected) return "";
        try {
          return JSON.parse(selected.dataset.formValue ?? selected.value);
        } catch {
          return selected.value;
        }
      }
      if (control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement) return control.value;
      if (control instanceof HTMLSelectElement) {
        const selectedValues = [...control.selectedOptions]
          .filter((option) => !option.disabled)
          .map((option) => {
            try {
              return JSON.parse(option.dataset.formValue ?? option.value);
            } catch {
              return option.value;
            }
          });
        return control.multiple
          ? selectedValues
          : selectedValues[0] ?? "";
      }
      if (control instanceof HTMLProgressElement) return control.value;
      return undefined;
    case "files":
      if (element.type !== "filePicker") return undefined;
      try {
        return JSON.parse(node?.dataset.filePickerValue || "[]");
      } catch {
        return [];
      }
    case "mode":
      return element.type === "filePicker"
        ? node?.dataset.filePickerMode || element.filePickerMode || "single"
        : undefined;
    case "min":
      return control instanceof HTMLInputElement
        ? control.min
        : control instanceof HTMLProgressElement
          ? 0
          : undefined;
    case "max":
      return control instanceof HTMLInputElement
        ? control.max
        : control instanceof HTMLProgressElement
          ? control.max
          : undefined;
    case "isValid":
      return control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
        ? control.checkValidity()
        : undefined;
    case "characterCount":
      return control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement
        ? control.value.length
        : undefined;
    case "selectedLabel": {
      if (control instanceof HTMLSelectElement) {
        const labels = [...control.selectedOptions]
          .filter((option) => !option.disabled)
          .map((option) => option.textContent || "");
        return control.multiple ? labels : labels[0] ?? "";
      }
      if (element.type === "radio") {
        const selected = node?.querySelector('input[type="radio"]:checked');
        return selected
          ? selected.closest("label")?.querySelector("span")?.textContent ||
          selected.closest("label")?.textContent.trim() ||
          ""
          : "";
      }
      return undefined;
    }
    case "options": {
      const getPreviewOptionValue = (option) => {
        const raw = option.dataset.formValue ?? option.value;
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      };
      if (control instanceof HTMLSelectElement)
        return [...control.options].map((option) => ({
          label: option.textContent || "",
          value: getPreviewOptionValue(option),
          selected: option.selected,
          disabled: option.disabled,
        }));
      if (element.type === "radio" && node)
        return [...node.querySelectorAll('input[type="radio"]')].map(
          (option) => ({
            label:
              option.closest("label")?.querySelector("span")?.textContent ||
              option.closest("label")?.textContent.trim() ||
              "",
            value: getPreviewOptionValue(option),
            selected: option.checked,
            disabled: option.disabled,
          }),
        );
      return undefined;
    }
    case "dataset":
    case "data":
    case "dataAttributes": {
      if (!node) return undefined;
      const dataset = { ...node.dataset };
      if (control && control !== node)
        Object.assign(dataset, control.dataset);
      return dataset;
    }
    case "open":
      return control instanceof HTMLDetailsElement
        ? control.open
        : Boolean(element.accordionOpen);
    case "selected":
      return node
        ? node.getAttribute("aria-pressed") === "true"
        : Boolean(element.chipSelected);
    case "disabled":
      return control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLButtonElement
        ? control.disabled
        : Boolean(element.disabled);
    case "visible":
      return node ? !node.hidden : !element.hidden;
    case "content":
      if (element.type === "input" && control instanceof HTMLInputElement)
        return control.placeholder;
      return getLocalizedContent(element);
    default:
      return undefined;
  }
}

function getRawElementValue(
  element,
  formValues = new Map(),
  itemContext = null,
) {
  if (!element.binding) return undefined;
  let value;
  if (element.binding.source === "element")
    value = getPreviewElementPropertyValue(
      element.binding.elementId,
      element.binding.property,
    );
  else if (element.binding.source === "extra")
    value = getPreviewExtraValue(element.binding.path, itemContext);
  else if (element.binding.source === "item")
    value = readPath(itemContext, element.binding.path);
  else if (element.binding.source === "form")
    value = formValues.get(element.binding.path);
  else if (element.binding.source === "variable") {
    const variable = state.variables.find(
      (item) => item.id === element.binding.path,
    );
    value = getPreviewVariableValue(variable, formValues, itemContext);
  } else if (element.binding.source === "twk")
    value = TWK_FIELDS.find(
      (field) => field.key === element.binding.path,
    )?.sample;
  else if (element.binding.source === "endpoint")
    value = readPath(
      state.responses[element.binding.requestId],
      element.binding.path,
    );
  return readValuePath(value, element.binding.objectPath);
}

function isJsonObjectValue(value) {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return false;
    }
  }
  return value !== null && typeof value === "object";
}

function updateBindingObjectPathVisibility(element) {
  const rawValue =
    element?.binding &&
    getRawElementValue(
      {
        ...element,
        binding: { ...element.binding, objectPath: "" },
      },
      collectPreviewFormValues(),
      getPreviewItemContext(element),
    );
  document.querySelector("#binding-object-path-fields").hidden =
    !isJsonObjectValue(rawValue);
}

function sameBoundValue(left, right) {
  if (Object.is(left, right)) return true;
  if (left && right && typeof left === "object" && typeof right === "object")
    return JSON.stringify(left) === JSON.stringify(right);
  return false;
}

function getPreviewVariableValue(
  variable,
  formValues,
  itemContext,
  visited = new Set(),
) {
  if (!variable || visited.has(variable.id)) return undefined;
  const nextVisited = new Set(visited);
  nextVisited.add(variable.id);
  let value;
  if (variable.source === "static") value = variable.value;
  else if (variable.source === "form")
    value =
      formValues instanceof Map
        ? formValues.get(variable.fieldName)
        : formValues[variable.fieldName];
  else if (variable.source === "twk")
    value = TWK_FIELDS.find((field) => field.key === variable.fieldKey)?.sample;
  else if (variable.source === "endpoint")
    value = readPath(state.responses[variable.requestId], variable.path);
  else if (variable.source === "item")
    value = readPath(itemContext, variable.path);
  else if (variable.source === "extra")
    value = getPreviewExtraValue(variable.path, itemContext, nextVisited);
  else if (variable.source === "element")
    value = getPreviewElementPropertyValue(
      variable.elementId,
      variable.property,
    );
  else if (variable.source === "variable") {
    const source = state.variables.find((item) => item.id === variable.path);
    value = getPreviewVariableValue(
      source,
      formValues,
      itemContext,
      nextVisited,
    );
  }
  return readValuePath(value, variable.propertyPath);
}

function getVariableEditorPreviewValue(variable) {
  const source = document.querySelector("#variable-source").value;
  const draft = { ...variable, source };
  if (source === "static") {
    try {
      draft.value = JSON.parse(
        document.querySelector("#variable-static-value").value,
      );
    } catch {
      return undefined;
    }
  } else if (source === "form") {
    draft.fieldName = document.querySelector("#variable-form-field").value;
  } else if (source === "twk") {
    draft.fieldKey = document.querySelector("#variable-twk-field").value;
  } else if (source === "endpoint") {
    draft.requestId = document.querySelector("#variable-endpoint").value;
    draft.path = document.querySelector("#variable-endpoint-path").value;
  } else if (source === "item") {
    draft.path = document.querySelector("#variable-item-path").value;
  } else if (source === "extra") {
    draft.path = document.querySelector("#variable-extra-source").value;
  } else if (source === "element") {
    draft.elementId = document.querySelector("#variable-element-source").value;
    draft.property = document.querySelector("#variable-element-property").value;
  } else if (source === "variable") {
    draft.path = document.querySelector("#variable-variable-source").value;
  }
  draft.propertyPath = "";
  return getPreviewVariableValue(draft, collectPreviewFormValues(), null);
}

function updateVariablePropertyPathVisibility(variable = selectedVariable()) {
  const value = variable ? getVariableEditorPreviewValue(variable) : undefined;
  document.querySelector("#variable-property-path-fields").hidden =
    !isJsonObjectValue(value);
}

function getElementValue(element, formValues = new Map(), itemContext = null) {
  const fallback = getLocalizedContent(element);
  if (!element.binding) return fallback;
  if (element.binding.source === "element")
    return formatBoundValue(
      readValuePath(
        getPreviewElementPropertyValue(
          element.binding.elementId,
          element.binding.property,
        ),
        element.binding.objectPath,
      ),
      fallback,
    );
  if (element.binding.source === "item")
    return formatBoundValue(
      readValuePath(
        readPath(itemContext, element.binding.path),
        element.binding.objectPath,
      ),
      fallback,
    );
  if (element.binding.source === "extra")
    return formatBoundValue(
      readValuePath(
        getPreviewExtraValue(element.binding.path, itemContext),
        element.binding.objectPath,
      ),
      fallback,
    );
  if (element.binding.source === "variable") {
    const variable = state.variables.find(
      (item) => item.id === element.binding.path,
    );
    return formatBoundValue(
      readValuePath(
        getPreviewVariableValue(variable, formValues, itemContext),
        element.binding.objectPath,
      ),
      fallback,
    );
  }
  if (element.binding.source === "form")
    return formatBoundValue(
      readValuePath(
        formValues.get(element.binding.path),
        element.binding.objectPath,
      ),
      fallback,
    );
  if (element.binding.source === "twk") {
    const field = TWK_FIELDS.find((item) => item.key === element.binding.path);
    return field
      ? formatBoundValue(
        readValuePath(field.sample, element.binding.objectPath),
        fallback,
      )
      : fallback;
  }
  if (element.binding.source === "endpoint") {
    const response = state.responses[element.binding.requestId];
    return formatBoundValue(
      readValuePath(
        readPath(response, element.binding.path),
        element.binding.objectPath,
      ),
      fallback,
    );
  }
  return fallback;
}

function getListOptions(element) {
  const source = element.listSource || { type: "static" };
  if (source.type === "static")
    return normalizeOptions(element.options, !element.multiple);
  let data;
  if (source.type === "twk") {
    data = TWK_FIELDS.find((field) => field.key === source.field)?.sample;
  } else {
    data = readPath(state.responses[source.requestId], source.path || "");
  }
  if (!Array.isArray(data)) return [];
  return data.map((item, index) => {
    const value = source.valuePath ? readPath(item, source.valuePath) : item;
    const label = source.labelPath ? readPath(item, source.labelPath) : item;
    return {
      label:
        label === undefined || label === null
          ? `الخيار ${index + 1}`
          : formatBoundValue(label, ""),
      value: value === undefined ? item : value,
    };
  });
}

function getCollectionItems(element) {
  const source = element.listSource || { type: "static" };
  if (source.type === "static")
    return Array.isArray(element.collectionItems)
      ? element.collectionItems
      : [];
  if (source.type === "twk")
    return TWK_FIELDS.find((field) => field.key === source.field)?.sample || [];
  const data = readPath(state.responses[source.requestId], source.path || "");
  return Array.isArray(data) ? data : [];
}

function renderElementTree() {
  const tree = document.querySelector("#element-tree");
  const pageElements = state.elements.filter(
    (element) => element.pageId === state.currentPageId,
  );
  const selectedIds = new Set(state.selectedIds);
  const signature = JSON.stringify([
    state.currentPageId,
    pageElements.map((element) => [
      element.id,
      element.parentId || "",
      element.type,
      getElementName(element),
      selectedIds.has(element.id),
      collapsedTreeElements.has(element.id),
    ]),
  ]);
  if (signature === renderedElementTreeSignature) return;

  renderedElementTreeSignature = signature;
  const scrollTop = tree.scrollTop;
  const scrollLeft = tree.scrollLeft;
  const childrenByParent = new Map();
  pageElements.forEach((element) => {
    const parentId = element.parentId || null;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(element);
  });
  tree.replaceChildren();
  const addChildren = (parent, parentId = null) => {
    (childrenByParent.get(parentId) || []).forEach((element) => {
      const row = document.createElement("div");
      row.className = "element-tree-row";
      row.dataset.treeElementId = element.id;
      row.setAttribute("role", "treeitem");
      row.setAttribute("aria-selected", String(selectedIds.has(element.id)));
      const children = childrenByParent.get(element.id) || [];
      if (children.length) {
        row.setAttribute(
          "aria-expanded",
          String(!collapsedTreeElements.has(element.id)),
        );
        const toggle = document.createElement("button");
        const expanded = !collapsedTreeElements.has(element.id);
        toggle.type = "button";
        toggle.className = "element-tree-toggle";
        toggle.dataset.toggleTreeElement = element.id;
        toggle.textContent = expanded ? "−" : "+";
        toggle.setAttribute("aria-expanded", String(expanded));
        toggle.setAttribute(
          "aria-label",
          expanded
            ? localize.CollapseChildElements[editorLanguage]
            : localize.ExpandChildElements[editorLanguage],
        );
        row.append(toggle);
      } else {
        const placeholder = document.createElement("span");
        placeholder.className = "element-tree-toggle-placeholder";
        placeholder.setAttribute("aria-hidden", "true");
        row.append(placeholder);
      }
      const select = document.createElement("button");
      select.type = "button";
      select.className = "element-tree-select";
      select.dataset.selectTreeElement = element.id;
      select.draggable = true;
      select.textContent = getElementName(element);
      row.append(select);
      if (children.length) {
        const group = document.createElement("div");
        group.className = "element-tree-children";
        group.setAttribute("role", "group");
        group.hidden = collapsedTreeElements.has(element.id);
        addChildren(group, element.id);
        row.append(group);
      }
      parent.append(row);
    });
  };
  addChildren(tree);
  tree.scrollTop = scrollTop;
  tree.scrollLeft = scrollLeft;
}

function renderPreview(updateProperties = true) {
  const formValues = collectPreviewFormValues();
  const previewScrollTop = preview.scrollTop;
  const pageScrollTop = preview.querySelector(".preview-page")?.scrollTop ?? 0;
  const nestedScrollPositions = new Map(
    [...preview.querySelectorAll(".preview-content.type-scrollView")].map(
      (node) => [node.id, { top: node.scrollTop, left: node.scrollLeft }],
    ),
  );
  unmountPluginElements(preview);
  preview.replaceChildren();
  preview.dataset.theme = state.settings.appTheme === "dark" ? "dark" : "light";
  applyPreviewTheme();
  const sheet = state.elements.find(
    (element) =>
      element.id === state.previewSheetId &&
      element.type === "sheet" &&
      element.pageId === state.currentPageId,
  );
  preview.classList.toggle("has-open-sheet", Boolean(sheet));
  applyPreviewLanguageDirection();
  preview.style.setProperty(
    "--element-size-scale",
    String(getElementSizeScale()),
  );
  const appMargins = normalizeSpacing(state.settings.appMargins, 0, 100);
  const appPaddings = normalizeSpacing(
    state.settings.appPaddings,
    defaultSettings.appPaddings,
    100,
  );
  // preview.style.margin = `${appMargins.top}px ${appMargins.right}px ${appMargins.bottom}px ${appMargins.left}px`;
  preview.style.padding = `${appPaddings.top}px ${appPaddings.right}px ${appPaddings.bottom}px ${appPaddings.left}px`;
  let previewInstanceId = 0;
  const previewHeader = createPreviewHeader();
  if (previewHeader) preview.append(previewHeader);
  const previewPage = document.createElement("div");
  previewPage.className = "preview-page app-page";
  preview.append(previewPage);
  const page = state.pages.find((item) => item.id === state.currentPageId);
  const pageElements = state.elements.filter(
    (element) => element.pageId === state.currentPageId,
  );
  const pageElementIds = new Set(pageElements.map((element) => element.id));
  const pageElementsById = new Map(
    pageElements.map((element) => [element.id, element]),
  );
  const childrenByParent = new Map();
  pageElements.forEach((element) => {
    const parentId = element.parentId || null;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(element);
  });
  const getChildren = (parentId) => childrenByParent.get(parentId) || [];

  if (page?.kind === "error" && state.settings.appShowErrorMessage !== false) {
    const status = document.createElement("p");
    status.className = "preview-runtime-message preview-error-message";
    status.textContent =
      state.settings.appLanguage === "ar"
        ? localize.appearsactioncannotcompleted - alt[editorLanguage]
        : localize.appearsactioncannotcompleted[editorLanguage];
    previewPage.append(status);
  }
  renderPageOptions();

  const renderElement = (element, itemContext = null) => {
    const node = document.createElement(
      !element.hidden && element.type === "input"
        ? "input"
        : !element.hidden && element.type === "image"
          ? "img"
          : element.type === "heading"
            ? "h2"
            : ["button", "chip", "fab", "filePicker"].includes(element.type)
              ? "button"
              : element.type === "accordion"
                ? "details"
                : element.type === "badge"
                  ? "span"
                  : element.type === "breadcrumbs"
                    ? "nav"
                    : element.type === "divider"
                      ? "hr"
                      : "div",
    );
    node.className = `preview-content type-${element.type}${["grid", "collection", "scrollView", "absoluteLayout"].includes(
      element.type,
    )
      ? " type-layout"
      : ""
      }`;
    node.classList.add("content");
    node.classList.toggle("ripple-effect-enabled", element.rippleEffect === true);
    const sharedComponentClasses =
      {
        grid: "content-layout content-grid",
        absoluteLayout: "content-layout content-absolute-layout",
        collection: "content-collection",
        scrollView: "content-layout content-scroll-view",
      }[element.type] || `content-${element.type}`;
    sharedComponentClasses
      .split(" ")
      .filter(Boolean)
      .forEach((className) => node.classList.add(className));
    if (variantOptionsByType[element.type])
      node.classList.add(
        `variant-${getVariantOptions(element.type).includes(element.styles.variant) ? element.styles.variant : getDefaultVariant(element.type)}`,
      );
    if (variantOptionsByType[element.type]) {
      node.dataset.variantBackground = safeColor(
        element.styles.background,
        getElementThemeColor(element, "background"),
      );
      node.dataset.variantColor = safeColor(
        element.styles.color,
        getElementThemeColor(element, "color"),
      );
    }
    if (element.type === "chip" && element.chipSelected)
      node.classList.add("is-selected");
    normalizeClassNames(element.className)
      .split(" ")
      .filter(Boolean)
      .forEach((className) => node.classList.add(className));
    if (element.type === "custom") {
      const component = state.userComponents.find(
        (item) => item.id === element.customComponentId,
      );
      if (component) node.classList.add(customComponentClass(component.id));
    }
    node.dataset.id = element.id;
    node.dataset.type = element.type;
    node.id = itemContext
      ? `${element.id}--preview-${previewInstanceId++}`
      : element.id;
    node.draggable = true;
    const localizedContent = getLocalizedContent(element);
    const displayedContent =
      element.type === "filePicker"
        ? localizedContent
        : element.binding?.source === "item"
          ? formatBoundValue(
            readValuePath(
              readPath(itemContext, element.binding.path),
              element.binding.objectPath,
            ),
            localizedContent,
          )
          : getElementValue(element, formValues, itemContext);
    node.setAttribute(
      "aria-label",
      `${typeNames[element.type]}: ${displayedContent || localize.NoText[editorLanguage]}`,
    );
    node.setAttribute("tabindex", "0");
    if (element.hidden) {
      node.classList.add("is-hidden-component");
      node.textContent = formatEditorMessage(
        localize.HiddenElementWithType[editorLanguage],
        { type: typeNames[element.type] },
      );
    } else if (element.type === "input") {
      node.type = inputTypes.includes(element.inputType)
        ? element.inputType
        : "text";
      node.placeholder =
        node.type === "range" ? localizedContent : displayedContent;
      if (node.type === "range" && element.binding)
        node.value = displayedContent;
      node.dataset.fieldName = getFormName(element);
      if (element.min !== "") node.min = String(element.min ?? "");
      if (element.max !== "") node.max = String(element.max ?? "");
    } else if (element.type === "filePicker") {
      node.dataset.fieldName = getFormName(element);
      node.dataset.filePicker = "";
      node.dataset.filePickerValue = "[]";
      node.dataset.filePickerMode =
        element.filePickerMode === "multiple" ? "multiple" : "single";
      node.setAttribute("aria-label", displayedContent || localize.FilePicker[editorLanguage]);
      if (element.filePickerAppearance === "dropzone")
        node.classList.add("file-picker-dropzone");
      const label = document.createElement("span");
      label.dataset.localizeContent = "";
      label.textContent = displayedContent || localize.FilePicker[editorLanguage];
      node.append(label);
    } else if (element.type === "list") {
      const select = document.createElement("select");
      select.multiple = Boolean(element.multiple);
      const listOptions = getListOptions(element);
      const currentValue = formValues.get(getFormName(element));
      const hasCurrentValue =
        formValues.has(getFormName(element)) &&
        (select.multiple
          ? Array.isArray(currentValue) && currentValue.length > 0
          : currentValue !== "");
      const currentValues = Array.isArray(currentValue)
        ? currentValue
        : [currentValue];
      const defaultSelectedIndex = select.multiple
        ? -1
        : listOptions.findIndex((option) => option.selected);
      if (!select.multiple) {
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = displayedContent || localize.ChooseAnItem[editorLanguage];
        placeholder.selected = true;
        placeholder.disabled = true;
        select.append(placeholder);
      }
      listOptions.forEach((option, index) => {
        const item = document.createElement("option");
        item.value = String(index);
        item.textContent = option.label;
        item.dataset.formValue = JSON.stringify(option.value);
        item.selected = hasCurrentValue
          ? currentValues.some((value) => sameBoundValue(value, option.value))
          : select.multiple
            ? Boolean(option.selected)
            : index === defaultSelectedIndex;
        select.append(item);
      });
      select.setAttribute("aria-label", displayedContent || localize.ChooseAnItem[editorLanguage]);
      select.dataset.fieldName = getFormName(element);
      if (normalizeDimension(element.styles.height)) {
        select.style.height = "100%";
        select.style.minHeight = "0";
      }
      node.append(select);
    } else if (element.type === "checkbox") {
      const label = document.createElement("label");
      label.className = "control-label";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.fieldName = getFormName(element);
      input.dataset.value = JSON.stringify(
        element.fieldValue === undefined ? true : element.fieldValue,
      );
      const boundValue = getRawElementValue(element, formValues, itemContext);
      const currentValue = formValues.get(getFormName(element));
      input.checked = element.binding
        ? typeof boundValue === "boolean"
          ? boundValue
          : sameBoundValue(
            boundValue,
            element.fieldValue === undefined ? true : element.fieldValue,
          )
        : typeof currentValue === "boolean"
          ? currentValue
          : Boolean(element.checked);
      const text = document.createElement("span");
      const itemLabel = readPath(itemContext, element.itemLabelPath);
      text.textContent =
        element.itemLabelPath && itemLabel !== undefined
          ? formatBoundValue(itemLabel, displayedContent)
          : displayedContent;
      const itemValue = readPath(itemContext, element.itemValuePath);
      if (element.itemValuePath && itemValue !== undefined)
        input.dataset.value = JSON.stringify(itemValue);
      label.append(input, text);
      node.append(label);
    } else if (element.type === "radio") {
      node.setAttribute("role", "group");
      node.setAttribute("aria-label", displayedContent || localize.SingleChoice[editorLanguage]);
      const boundValue = getRawElementValue(element, formValues, itemContext);
      const itemLabel = readPath(itemContext, element.itemLabelPath);
      const itemValue = readPath(itemContext, element.itemValuePath);
      const options =
        itemContext && (element.itemLabelPath || element.itemValuePath)
          ? [
            {
              label:
                !element.itemLabelPath || itemLabel === undefined
                  ? displayedContent
                  : formatBoundValue(itemLabel, displayedContent),
              value: !element.itemValuePath
                ? itemContext
                : itemValue === undefined
                  ? null
                  : itemValue,
            },
          ]
          : normalizeOptions(element.options, true);
      const formName = getFormName(element);
      const currentValue = formValues.get(formName);
      const hasCurrentValue = formValues.has(formName);
      options.forEach((option, index) => {
        const label = document.createElement("label");
        label.className = "control-label";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = formName;
        input.dataset.fieldName = formName;
        input.value = String(index);
        input.dataset.formValue = JSON.stringify(option.value);
        input.checked = Boolean(element.binding)
          ? sameBoundValue(boundValue, option.value)
          : hasCurrentValue
            ? sameBoundValue(currentValue, option.value)
            : Boolean(option.selected);
        const text = document.createElement("span");
        text.textContent = option.label;
        label.append(input, text);
        node.append(label);
      });
    } else if (element.type === "image") {
      const imageUrl = getImageSource(element);
      node.alt = localizedContent;
      node.style.objectFit =
        element.imageFit === "contain" ? "contain" : "cover";
      if (imageUrl) {
        node.src = imageUrl;
      } else {
        node.classList.add("preview-image-empty");
        node.alt = localizedContent || localize.ImageURLIsNotSet[editorLanguage];
        node.title = localize.AddAnImageURLInProperties[editorLanguage];
      }
    } else if (element.type === "icon") {
      const icon = document.createElement("i");
      icon.className = `fa-solid ${/^fa-[a-z0-9-]+$/.test(element.iconClass) ? element.iconClass : "fa-star"}`;
      icon.setAttribute("aria-hidden", "true");
      node.append(icon);
    } else if (element.type === "tabs") {
      const tabs = getChildren(element.id).filter(
        (child) => child.type === "tab" && !child.hidden,
      );
      const activeTab = tabs.some((tab) => tab.id === element.activeTabId)
        ? element.activeTabId
        : tabs[0]?.id || "";
      const tabList = document.createElement("div");
      tabList.className = "preview-tab-list content-tab-list";
      tabList.setAttribute("role", "tablist");
      tabList.setAttribute(
        "aria-label",
        displayedContent ||
        (state.settings.appLanguage === "ar" ? localize.Tabs[editorLanguage] : localize.Tabs[editorLanguage]),
      );
      tabs.forEach((tab, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "preview-tab-button content-tab-button";
        button.id = `preview-tab-${tab.id}`;
        button.dataset.tabTarget = tab.id;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-controls", tab.id);
        button.setAttribute("aria-selected", String(tab.id === activeTab));
        button.tabIndex = tab.id === activeTab ? 0 : -1;
        button.textContent =
          getElementValue(tab, formValues, itemContext) || `Tab ${index + 1}`;
        tabList.append(button);
      });
      node.append(tabList);
      const panels = document.createElement("div");
      panels.className = "preview-tab-panels";
      tabs.forEach((tab) => {
        const panel = renderElement(tab, itemContext);
        panel.classList.add("content-tab-panel");
        panel.id = tab.id;
        panel.dataset.tabPanel = tab.id;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", `preview-tab-${tab.id}`);
        panel.tabIndex = 0;
        panel.hidden = tab.id !== activeTab;
        panels.append(panel);
      });
      node.append(panels);
    } else if (element.type === "tab") {
      node.setAttribute("role", "tabpanel");
      node.dataset.tabPanel = element.id;
      node.tabIndex = 0;
      if (pageElementsById.get(element.parentId)?.type !== "tabs") {
        const title = document.createElement("strong");
        title.className = "tab-panel-title";
        title.textContent = displayedContent;
        node.append(title);
      }
      getChildren(element.id).forEach((child) =>
        node.append(renderElement(child, itemContext)),
      );
    } else if (element.type === "accordion") {
      node.open = element.accordionOpen;
      const summary = document.createElement("summary");
      summary.textContent = displayedContent;
      node.append(summary);
      const content = document.createElement("div");
      content.className = "accordion-preview-content content-accordion-panel";
      getChildren(element.id).forEach((child) =>
        content.append(renderElement(child, itemContext)),
      );
      node.append(content);
    } else if (element.type === "button") {
      node.type = "button";
      const label = document.createElement("span");
      label.dataset.localizeContent = "";
      label.textContent = displayedContent;
      const iconClass = /^fa-[a-z0-9-]+$/.test(element.iconClass)
        ? element.iconClass
        : "";
      if (iconClass) {
        const icon = document.createElement("i");
        icon.className = `fa-solid ${iconClass}`;
        icon.setAttribute("aria-hidden", "true");
        node.classList.add("content-button-has-icon");
        node.dir = state.settings.appLanguage === "ar" ? "rtl" : "ltr";
        label.dir = "auto";
        node.append(icon, label);
      } else {
        node.append(label);
      }
    } else if (element.type === "chip") {
      node.type = "button";
      node.setAttribute("aria-pressed", String(element.chipSelected));
      node.textContent = displayedContent;
    } else if (element.type === "loading") {
      node.setAttribute("role", "status");
      const spinner = document.createElement("span");
      spinner.className = "loading-spinner content-loading-spinner";
      spinner.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.dataset.localizeContent = "";
      label.textContent = displayedContent;
      node.append(spinner, label);
    } else if (element.type === "progress") {
      const progress = document.createElement("progress");
      progress.className = "content-progress-bar";
      progress.max = clampNumber(element.progressMax, 1, 1000000, 100);
      if (element.progressMode === "determinate")
        progress.value = clampNumber(element.progressValue, 0, progress.max, 0);
      progress.setAttribute(
        "aria-label",
        displayedContent ||
        (state.settings.appLanguage === "ar" ? "التقدم" : "Progress"),
      );
      node.append(progress);
      const label = document.createElement("span");
      label.className = "content-progress-label";
      label.dataset.localizeContent = "";
      label.textContent = displayedContent;
      node.append(label);
    } else if (element.type === "switch") {
      const label = document.createElement("label");
      label.className = "control-label content-switch-label";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("role", "switch");
      const boundValue = getRawElementValue(element, formValues, itemContext);
      const currentValue = formValues.get(getFormName(element));
      input.checked = element.binding
        ? typeof boundValue === "boolean"
          ? boundValue
          : sameBoundValue(
            boundValue,
            element.fieldValue === undefined ? true : element.fieldValue,
          )
        : typeof currentValue === "boolean"
          ? currentValue
          : Boolean(element.checked);
      input.name = getFormName(element);
      input.dataset.fieldName = getFormName(element);
      input.dataset.value = JSON.stringify(
        element.fieldValue === undefined ? true : element.fieldValue,
      );
      const text = document.createElement("span");
      const itemLabel = readPath(itemContext, element.itemLabelPath);
      text.textContent =
        element.itemLabelPath && itemLabel !== undefined
          ? formatBoundValue(itemLabel, displayedContent)
          : displayedContent;
      label.append(input, text);
      const itemValue = readPath(itemContext, element.itemValuePath);
      if (element.itemValuePath && itemValue !== undefined)
        input.dataset.value = JSON.stringify(itemValue);
      node.append(label);
    } else if (element.type === "fab") {
      node.type = "button";
      node.setAttribute("aria-label", displayedContent || "إجراء سريع");
      node.textContent = displayedContent || "+";
    } else if (element.type === "breadcrumbs") {
      node.setAttribute("aria-label", "Breadcrumb");
      node.textContent = displayedContent;
    } else if (element.type === "badge") {
      node.textContent = displayedContent;
    } else if (element.type === "toast") {
      node.setAttribute("role", "status");
      const message = document.createElement("span");
      message.className = "toast-preview-message content-toast-message";
      message.textContent = displayedContent;
      const close = document.createElement("button");
      close.type = "button";
      close.className = "toast-preview-close content-toast-close";
      close.setAttribute("aria-label", "Dismiss notification");
      close.textContent = "×";
      close.addEventListener("click", (clickEvent) => {
        clickEvent.stopPropagation();
        node.hidden = true;
      });
      node.append(message, close);
    } else if (element.type === "sheet") {
      node.classList.add("preview-sheet");
      node.dir = state.settings.appLanguage === "ar" ? "rtl" : "ltr";
      node.hidden =
        element.id !== state.previewSheetId ||
        (itemContext && itemContext !== getPreviewItemContext(element));
      const toolbar = document.createElement("div");
      toolbar.className = "preview-sheet-toolbar content-sheet-toolbar";
      // toolbar.textContent = `Sheet · ${element.content || element.id}`;
      const close = document.createElement("button");
      close.type = "button";
      close.className = "preview-sheet-close content-sheet-close";
      close.textContent = "×";
      close.setAttribute("aria-label", "إغلاق المعاينة");
      close.addEventListener("click", (clickEvent) => {
        clickEvent.stopPropagation();
        state.previewSheetId = null;
        renderPreview();
      });
      toolbar.append(close);
      node.append(toolbar);
      const sheetChildren = getChildren(element.id);
      sheetChildren.forEach((child) =>
        node.append(renderElement(child, itemContext)),
      );
    } else if (element.type === "card") {
      if (element.cardHeader) {
        const header = document.createElement("strong");
        header.className = "card-header";
        header.textContent = element.cardHeader;
        node.append(header);
      }
      const cardChildren = getChildren(element.id);
      const body = document.createElement("div");
      body.className = "card-body";
      const cardText = document.createElement("span");
      cardText.className = "card-text";
      cardText.textContent = displayedContent;
      body.append(cardText);
      cardChildren
        .filter((child) => child.cardSlot !== "footer")
        .forEach((child) => body.append(renderElement(child, itemContext)));
      node.append(body);
      const footerChildren = cardChildren.filter(
        (child) => child.cardSlot === "footer",
      );
      if (element.cardFooter || footerChildren.length) {
        const footer = document.createElement("div");
        footer.className = "card-footer";
        if (element.cardFooter) {
          const footerText = document.createElement("span");
          footerText.textContent = element.cardFooter;
          footer.append(footerText);
        }
        footerChildren.forEach((child) =>
          footer.append(renderElement(child, itemContext)),
        );
        node.append(footer);
      }
    } else if (element.type === "custom") {
      const component = state.userComponents.find(
        (item) => item.id === element.customComponentId,
      );
      const plugin = component ? getPluginDefinition(component) : null;
      if (plugin) {
        node.setAttribute(
          "aria-label",
          localizePluginDefinition(plugin, state.settings.appLanguage).title,
        );
        node.dataset.pluginId = plugin.id;
        node.dataset.pluginProperties = JSON.stringify(
          normalizePluginProperties(plugin, element.pluginProperties),
        );
        if (plugin.acceptsChildren)
          getChildren(element.id).forEach((child) =>
            node.append(renderElement(child, itemContext)),
          );
      } else if (component) {
        node.innerHTML = safeCustomHtml(component.html);
      }
    } else if (isContainer(element)) {
      const config = element.layout || {};
      if (displayedContent) {
        const title = document.createElement("strong");
        title.className = "layout-title";
        title.textContent = displayedContent;
        node.append(title);
      }
      const children = document.createElement("div");
      children.className =
        element.type === "grid"
          ? "layout-children content-layout-children content-grid-children"
          : "layout-children content-layout-children";
      if (element.type === "scrollView")
        children.classList.add("content-scroll-view-children");
      children.style.display =
        element.type === "absoluteLayout"
          ? "block"
          : element.type === "grid"
            ? "grid"
            : "flex";
      if (element.type === "absoluteLayout") {
        node.style.position = "relative";
        node.style.display = "block";
        children.classList.add("content-absolute-layout-children");
        children.style.position = "absolute";
        children.style.inset = "0";
      }
      if (element.type === "grid")
        children.style.gridTemplateColumns = `repeat(${clampNumber(config.columns, 1, 12, 2)}, minmax(0, 1fr))`;
      const scrollAxis = ["vertical", "horizontal", "both"].includes(
        element.scroll?.axis,
      )
        ? element.scroll.axis
        : "vertical";
      children.style.flexWrap =
        element.type === "scrollView"
          ? scrollAxis === "vertical" && config.direction === "row"
            ? "wrap"
            : "nowrap"
          : element.type === "grid"
            ? "wrap"
            : "nowrap";
      if (element.type === "scrollView" && scrollAxis === "horizontal")
        children.style.width = "max-content";
      children.style.flexDirection =
        config.direction === "row" ||
          (element.type === "scrollView" && scrollAxis === "horizontal")
          ? "row"
          : "column";
      children.style.alignItems =
        config.align === "start"
          ? "flex-start"
          : config.align === "center"
            ? "center"
            : config.align === "end"
              ? "flex-end"
              : "stretch";
      children.style.justifyContent =
        config.justify === "center"
          ? "center"
          : config.justify === "end"
            ? "flex-end"
            : config.justify === "space-between"
              ? "space-between"
              : "flex-start";
      children.style.gap = `${clampNumber(config.gap, 0, 48, 8)}px`;
      if (element.type === "scrollView") {
        node.style.height = `${clampNumber(element.scroll?.height, 0, 100, 100)}%`;
        node.style.minHeight = "0";
        node.style.flexShrink = "0";
        node.style.overflowX =
          scrollAxis === "horizontal" || scrollAxis === "both"
            ? "auto"
            : "hidden";
        node.style.overflowY =
          scrollAxis === "vertical" || scrollAxis === "both"
            ? "auto"
            : "hidden";
      }
      const templateChildren = getChildren(element.id);
      if (element.type === "collection") {
        const records = getCollectionItems(element);
        const previewRecords =
          records.length > 0
            ? records
            : sourceIsDynamic(element.listSource)
              ? [
                {
                  title: localize.SampleElement[editorLanguage],
                  description: localize.BindElementFieldsInProperties[editorLanguage],
                },
              ]
              : [];
        previewRecords.forEach((record, index) => {
          const item = document.createElement("div");
          item.className = "collection-preview-item content-collection-item";
          item.dataset.collectionItem = String(index);
          templateChildren.forEach((child) =>
            item.append(renderElement(child, record)),
          );
          children.append(item);
        });
      } else {
        templateChildren.forEach((child) =>
          children.append(renderElement(child, itemContext)),
        );
      }
      node.append(children);
    } else {
      node.textContent = displayedContent;
    }
    node.style.color = getElementThemeColor(element, "color");
    node.style.backgroundColor =
      element.type === "divider"
        ? "transparent"
        : getElementThemeColor(element, "background");
    node.style.fontSize = `calc(${getElementFontSize(element)}px * var(--element-size-scale, 1))`;
    node.style.textAlign = ["start", "center", "end"].includes(
      element.styles.align,
    )
      ? element.styles.align
      : "start";
    if (
      element.type === "button" &&
      /^fa-[a-z0-9-]+$/.test(element.iconClass)
    ) {
      node.style.justifyContent =
        element.styles.align === "center"
          ? "center"
          : element.styles.align === "end"
            ? "flex-end"
            : "flex-start";
    }
    node.style.padding =
      element.type === "divider"
        ? "0"
        : getScaledSpacingCss(element.styles, "padding");
    node.style.margin = getSpacingCss(element.styles, "margin");
    const borderWidth = clampNumber(element.styles.borderWidth, 0, 12, 0);
    if (borderWidth) {
      node.style.borderWidth = `${borderWidth}px`;
      node.style.borderColor = safeColor(element.styles.borderColor, "#dbe5e1");
    } else {
      node.style.removeProperty("border-width");
      node.style.removeProperty("border-color");
    }
    node.style.borderRadius = `${clampNumber(element.styles.borderRadius, 0, 100, defaultBorderRadius(element.type))}px`;
    const width = normalizeDimension(element.styles.width);
    const height = normalizeDimension(element.styles.height);
    if (width) node.style.width = width;
    if ((width && width !== "auto") || (height && height !== "auto"))
      node.style.flexShrink = "0";
    if (height) {
      node.style.height = height;
      node.style.minHeight = "0";
      if (element.type === "image") node.style.maxHeight = "none";
    }
    if (element.type === "absoluteLayout" && !height)
      node.style.height = "200px";
    const absoluteAlignment = getAbsoluteLayoutChildAlignment(element);
    if (absoluteAlignment) {
      node.dataset.absoluteLayoutChild = "";
      node.dataset.horizontalAlignment = absoluteAlignment.horizontal;
      node.dataset.verticalAlignment = absoluteAlignment.vertical;
      node.style.position = "absolute";
      if (absoluteAlignment.horizontal === "center") {
        node.style.left = "50%";
        node.style.translate =
          absoluteAlignment.vertical === "center" ? "-50% -50%" : "-50% 0";
      } else if (absoluteAlignment.horizontal === "end") {
        node.style.insetInlineEnd = "0";
      } else {
        node.style.insetInlineStart = "0";
      }
      if (absoluteAlignment.vertical === "center") {
        node.style.top = "50%";
        if (absoluteAlignment.horizontal !== "center")
          node.style.translate = "0 -50%";
      } else if (absoluteAlignment.vertical === "bottom") {
        node.style.bottom = "0";
      } else {
        node.style.top = "0";
      }
    }

    if (["button", "fab"].includes(element.type)) {
      node.type = "button";
      const variant = element.styles.variant || "primary";
      node.style.backgroundColor =
        variant === "ghost" || variant === "outline"
          ? "transparent"
          : variant === "secondary"
            ? "var(--theme-secondary)"
            : variant === "destructive"
              ? "var(--destructive)"
              : variant === "custom"
                ? safeColor(element.styles.background, "#176b59")
                : "var(--theme-primary)";
      node.style.color =
        variant === "ghost" || variant === "outline"
          ? "var(--theme-primary)"
          : variant === "custom"
            ? safeColor(element.styles.color, "#ffffff")
            : variant === "secondary"
              ? "var(--secondary-foreground)"
              : "var(--primary-foreground)";
      if (variant === "outline" && !Number(element.styles.borderWidth))
        node.style.borderWidth = "1px";
      if (variant === "outline" && !Number(element.styles.borderWidth))
        node.style.borderColor = "var(--theme-primary)";
    }
    if (element.disabled) {
      node.setAttribute("aria-disabled", "true");
      node.querySelectorAll("button, input, select").forEach((control) => {
        control.disabled = true;
      });
      if ("disabled" in node) node.disabled = true;
    }

    if (state.selectedIds.includes(element.id)) node.classList.add("selected");
    return node;
  };

  pageElements
    .filter(
      (element) =>
        element.type !== "sheet" && !pageElementIds.has(element.parentId),
    )
    .forEach((element) => {
      previewPage.append(renderElement(element));
    });
  pageElements
    .filter(
      (element) => element.type === "sheet" && !isInsideCollection(element),
    )
    .forEach((element) => preview.append(renderElement(element)));
  if (sheet) {
    const toolbar = document.createElement("button");
    toolbar.type = "button";
    toolbar.className = "preview-sheet-open-bar";
    toolbar.textContent = `Sheet · ${sheet.content || sheet.id} · إغلاق`;
    toolbar.addEventListener("click", () => {
      state.previewSheetId = state.previewSheetId ? null : sheet.id;
      renderPreview();
    });
    preview.insertBefore(toolbar, previewPage);
  }

  const sharedStyles = document.createElement("style");
  sharedStyles.textContent = buildSharedPreviewStyles();
  preview.append(sharedStyles);

  if (
    state.customCss.trim() ||
    state.userComponents.some((component) => component.css.trim())
  ) {
    const componentRules = state.elements
      .filter((element) => element.pageId === state.currentPageId)
      .map((element) => {
        const selector = `.preview-content[data-id="${CSS.escape(element.id)}"]`;
        const variant = element.styles.variant || "primary";
        const buttonBackground =
          variant === "ghost" || variant === "outline"
            ? "transparent"
            : variant === "secondary"
              ? "var(--theme-secondary)"
              : variant === "destructive"
                ? "var(--destructive)"
                : variant === "custom"
                  ? safeColor(element.styles.background, "#176b59")
                  : "var(--theme-primary)";
        const buttonColor =
          variant === "ghost" || variant === "outline"
            ? "var(--theme-primary)"
            : variant === "custom"
              ? safeColor(element.styles.color, "#ffffff")
              : variant === "secondary"
                ? "var(--secondary-foreground)"
                : "var(--primary-foreground)";
        const width = normalizeDimension(element.styles.width);
        const height = normalizeDimension(element.styles.height);
        const baseRule = `${selector} { 
  color: ${["button", "fab"].includes(element.type) ? buttonColor : getElementThemeColor(element, "color")};
  background-color: ${element.type === "divider" || (["button", "fab"].includes(element.type) && ["ghost", "outline"].includes(variant)) ? "transparent" : ["button", "fab"].includes(element.type) ? buttonBackground : getElementThemeColor(element, "background")};
  font-size: calc(${getElementFontSize(element)}px * var(--element-size-scale, 1));
  text-align: ${["start", "center", "end"].includes(element.styles.align) ? element.styles.align : "start"}; 
  ${element.type === "button" && /^fa-[a-z0-9-]+$/.test(element.iconClass) ? `justify-content:${element.styles.align === "center" ? "center" : element.styles.align === "end" ? "flex-end" : "flex-start"};` : ""}
  padding: ${element.type === "divider" ? "0" : getScaledSpacingCss(element.styles, "padding")};
  margin: ${getSpacingCss(element.styles, "margin")};
  ${clampNumber(element.styles.borderWidth, 0, 12, 0) || (["button", "fab"].includes(element.type) && variant === "outline") ? `border: ${clampNumber(element.styles.borderWidth, 0, 12, 0) || 1}px solid ${["button", "fab"].includes(element.type) && variant === "outline" ? "var(--theme-primary)" : safeColor(element.styles.borderColor, "#dbe5e1")};` : ""}
  border-radius: ${clampNumber(element.styles.borderRadius, 0, 100, defaultBorderRadius(element.type))}px;
  ${width ? `width:${width};` : ""}
  ${height ? `height:${height};min-height:0;` : ""}
  ${(width && width !== "auto") || (height && height !== "auto") ? "flex-shrink:0;" : ""}
  ${element.type === "image" ? `object-fit:${element.imageFit === "contain" ? "contain" : "cover"};` : ""}
  ${element.type === "image" && height ? "max-height:none;" : ""}
  }`;
        if (element.type !== "scrollView") return baseRule;
        const axis = ["vertical", "horizontal", "both"].includes(
          element.scroll?.axis,
        )
          ? element.scroll.axis
          : "vertical";
        return `${baseRule}\n${selector} { height: ${height || `${clampNumber(element.scroll?.height, 0, 100, 100)}%`}; min-height: 0; flex-shrink: 0; overflow-x: ${["horizontal", "both"].includes(axis) ? "auto" : "hidden"}; overflow-y: ${["vertical", "both"].includes(axis) ? "auto" : "hidden"}; }`;
      })
      .join("\n");
    preview.querySelectorAll(".preview-content").forEach((node) => {
      node.removeAttribute("style");
    });
    const customStyles = document.createElement("style");
    customStyles.textContent = [
      scopeCss(componentRules, "#app-preview"),
      buildCustomComponentStyles(),
      scopeCss(state.customCss, "#app-preview", true),
    ]
      .filter(Boolean)
      .join("\n");
    preview.append(customStyles);
  }

  mountPluginElements(
    preview,
    getPluginRuntimeDefinitions(),
    savePluginPropertyChange,
  );
  document.querySelector("#element-count").textContent = String(
    document.querySelectorAll("#element-palette [data-type]").length,
  );
  renderElementTree();
  if (themeDialog.open) renderThemeFields();
  applyTheme();
  if (updateProperties) renderProperties();
  document.querySelector("#app-language-toggle").textContent =
    state.settings.appLanguage === "ar"
      ? localize.EnglishLanguage.en
      : localize.ArabicLanguage.ar;
  updateAppThemeToggle();
  updateHistoryControls();
  preview.scrollTo({ top: previewScrollTop, behavior: "instant" });
  preview
    .querySelector(".preview-page")
    .scrollTo({ top: pageScrollTop, behavior: "instant" });
  preview
    .querySelectorAll(".preview-content.type-scrollView")
    .forEach((node) => {
      const position = nestedScrollPositions.get(node.id);
      if (position)
        node.scrollTo({
          top: position.top,
          left: position.left,
          behavior: "instant",
        });
    });
}

function setAppLanguage(language) {
  state.settings.appLanguage = language === "en" ? "en" : "ar";
  applyPreviewLanguageDirection();
  renderPreview();
  scheduleSave();
}

function updateAppThemeToggle() {
  const isDark = state.settings.appTheme === "dark";
  const button = document.querySelector("#app-theme-toggle");
  const label = isDark ? localize.LightMode[editorLanguage] : localize.DarkMode[editorLanguage];
  button.innerHTML = `<i class="fa-solid fa-${isDark ? "sun" : "moon"}" aria-hidden="true"></i><span>${label}</span>`;
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  button.setAttribute("aria-pressed", String(isDark));
}

function applyPreviewLanguageDirection() {
  const language = state.settings.appLanguage === "en" ? "en" : "ar";
  const direction = language === "ar" ? "rtl" : "ltr";
  preview.lang = language;
  preview.dir = direction;
  deviceFrame.lang = language;
  deviceFrame.dir = direction;
}

function sourceIsDynamic(source = {}) {
  return source.type === "endpoint" || source.type === "twk";
}

function renderPageOptions() {
  const select = document.querySelector("#page-select");
  const selectedId = state.currentPageId;
  select.replaceChildren();
  state.pages.forEach((page) => {
    const option = document.createElement("option");
    option.value = page.id;
    option.textContent =
      page.kind === "error"
        ? formatEditorMessage(localize.PageStatus[editorLanguage], {
          name: page.name,
          status: localize.PageErrorIndicator[editorLanguage],
        })
        : page.kind === "splash"
          ? formatEditorMessage(localize.PageStatus[editorLanguage], {
            name: page.name,
            status: localize.SplashScreenIndicator[editorLanguage],
          })
          : page.name;
    select.append(option);
  });
  select.value = selectedId;
  const activePage = state.pages.find((page) => page.id === selectedId);
  const nameInput = document.querySelector("#page-name");
  nameInput.value = activePage?.name || "";
  nameInput.disabled = !activePage;
  document.querySelector("#delete-page").disabled =
    !activePage ||
    activePage.kind !== "page" ||
    state.pages.filter((page) => page.kind === "page").length <= 1;
}

function selectPage(pageId) {
  if (!state.pages.some((page) => page.id === pageId)) return;
  state.currentPageId = pageId;
  clearElementSelection();
  renderPreview();
}

function addPage() {
  const page = {
    id: createPageId(),
    name: localize.NewPage.ar,
    kind: "page",
  };
  state.pages.push(page);
  state.currentPageId = page.id;
  clearElementSelection();
  renderPreview();
  document.querySelector("#page-name").focus();
  document.querySelector("#page-name").select();
  scheduleSave();
}

function deleteCurrentPage() {
  const page = state.pages.find((item) => item.id === state.currentPageId);
  if (
    !page ||
    page.kind !== "page" ||
    state.pages.filter((item) => item.kind === "page").length <= 1
  )
    return;
  if (
    !window.confirm(
      localize.ConfirmDeletePage[editorLanguage].replace(
        "{name}",
        () => page.name,
      ),
    )
  )
    return;
  const removedElementIds = new Set(
    state.elements
      .filter((element) => element.pageId === page.id)
      .map((element) => element.id),
  );
  state.elements = state.elements.filter(
    (element) => element.pageId !== page.id,
  );
  state.requests.forEach((request) => {
    if (removedElementIds.has(request.buttonId)) {
      request.trigger = "load";
      request.buttonId = "";
    }
  });
  const fallbackPageId = state.pages.find(
    (item) => item.kind === "page" && item.id !== page.id,
  )?.id;
  state.elements.forEach((element) => {
    const action = element.action || {};
    [
      action,
      ...(Array.isArray(action.handlers) ? action.handlers : []),
      ...(Array.isArray(action.actions) ? action.actions : []),
      ...(Array.isArray(action.elseActions) ? action.elseActions : []),
    ].forEach((configuredAction) => {
      if (
        configuredAction.type === "navigate" &&
        configuredAction.pageId === page.id
      )
        configuredAction.pageId = fallbackPageId;
    });
  });
  state.pages = state.pages.filter((item) => item.id !== page.id);
  state.currentPageId = state.pages.find((item) => item.kind === "page").id;
  clearElementSelection();
  renderPreview();
  scheduleSave();
  showToast(localize.ThePageAndItsElementsWereDeleted[editorLanguage]);
}

async function exportProjectJson() {
  const project = pruneProjectForOutput({
    schemaVersion: 5,
    pages: state.pages,
    elements: state.elements,
    requests: state.requests,
    components: state.components,
    userComponents: state.userComponents,
    variables: state.variables,
    assets: state.assets,
    customCss: state.customCss,
    theme: state.theme,
    settings: state.settings,
  });
  const file = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  try {
    if (await downloadExportFile("tawakkalna-project.json", file))
      showToast(localize.ProjectJSONDownloaded[editorLanguage]);
  } catch (error) {
    console.error("Unable to export project JSON.", error);
    showToast(localize.UnableToSave[editorLanguage]);
  }
}

async function readBundledAppFile(filePath) {
  const desktopReader = window.electronWindow?.readAppFile;
  if (desktopReader) return desktopReader(filePath);

  const response = await fetch(`./${filePath}`);
  if (!response.ok)
    throw new Error(
      `Bundled app file "${filePath}" request failed with status ${response.status}.`,
    );
  return new Uint8Array(await response.arrayBuffer());
}

async function downloadExportFile(fileName, blob) {
  const desktopSaver = window.electronWindow?.saveExportFile;
  if (desktopSaver)
    return desktopSaver(fileName, new Uint8Array(await blob.arrayBuffer()));

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

function validateImportedProject(project) {
  const source = Array.isArray(project)
    ? {
      schemaVersion: 4,
      pages: structuredClone(defaultPages),
      elements: project,
      requests: [],
      components: [],
      userComponents: [],
      variables: [],
      assets: [],
      customCss: "",
      theme: structuredClone(defaultTheme),
      settings: structuredClone(defaultSettings),
    }
    : project;
  const sourceSettings =
    source?.settings &&
      typeof source.settings === "object" &&
      !Array.isArray(source.settings)
      ? { ...defaultSettings, ...source.settings }
      : null;
  if (
    !source ||
    typeof source !== "object" ||
    !Array.isArray(source.pages) ||
    !Array.isArray(source.elements) ||
    !sourceSettings ||
    typeof sourceSettings.appTopBarType !== "string" ||
    typeof sourceSettings.title !== "string" ||
    typeof sourceSettings.orgnization !== "string" ||
    source.pages.some(
      (page) =>
        !page ||
        typeof page.id !== "string" ||
        typeof page.name !== "string" ||
        !["page", "splash", "loading", "error"].includes(page.kind),
    ) ||
    source.elements.some(
      (element) =>
        !element ||
        typeof element.id !== "string" ||
        !Object.hasOwn(typeNames, element.type) ||
        typeof element.content !== "string" ||
        !element.styles ||
        typeof element.styles !== "object",
    )
  ) {
    throw new Error(localize.filedoescontainvalid[editorLanguage]);
  }
  const sourceUserComponents = Array.isArray(source.userComponents)
    ? source.userComponents
    : [];
  const userComponentIds = new Set();
  const requiredPluginIds = new Set();
  sourceUserComponents.forEach((component) => {
    if (!component || typeof component.id !== "string") return;
    if (Object.hasOwn(component, "plugin")) {
      const normalized = normalizeStoredPluginComponent(component);
      if (!bundledPluginIds.has(normalized.id)) {
        const message = formatEditorMessage(
          localize.RequiredPluginUnavailable[editorLanguage],
          { id: normalized.id },
        );
        throw new Error(message);
      }
      requiredPluginIds.add(normalized.id);
    } else if (
      typeof component.name === "string" &&
      typeof component.html === "string" &&
      typeof component.css === "string"
    ) {
      userComponentIds.add(component.id);
    }
  });
  (Array.isArray(sourceSettings.selectedPluginIds)
    ? sourceSettings.selectedPluginIds
    : []
  ).forEach((pluginId) => {
    if (typeof pluginId !== "string") return;
    if (!bundledPluginIds.has(pluginId)) {
      const message = formatEditorMessage(
        localize.RequiredPluginUnavailable[editorLanguage],
        { id: pluginId },
      );
      throw new Error(message);
    }
    requiredPluginIds.add(pluginId);
  });
  const referencedElements = [
    ...source.elements,
    ...(Array.isArray(source.components)
      ? source.components.flatMap((component) =>
        Array.isArray(component?.elements) ? component.elements : [],
      )
      : []),
  ];
  referencedElements.forEach((element) => {
    if (
      element?.type !== "custom" ||
      typeof element.customComponentId !== "string" ||
      !element.customComponentId
    )
      return;
    const componentId = element.customComponentId;
    if (bundledPluginIds.has(componentId)) {
      requiredPluginIds.add(componentId);
      return;
    }
    if (!userComponentIds.has(componentId)) {
      const message = formatEditorMessage(
        localize.RequiredComponentUnavailable[editorLanguage],
        { id: componentId },
      );
      throw new Error(message);
    }
  });
  const requests = source.requests ?? [];
  if (
    !Array.isArray(requests) ||
    requests.some(
      (request) =>
        !request ||
        typeof request.id !== "string" ||
        typeof request.name !== "string" ||
        !requestMethods.includes(request.method) ||
        typeof request.url !== "string" ||
        !["load", "button"].includes(request.trigger) ||
        typeof request.headers !== "string" ||
        typeof request.body !== "string",
    )
  ) {
    throw new Error(localize.apirequestlistfile[editorLanguage]);
  }
  const userComponents = sourceUserComponents.length
    ? sourceUserComponents
      .filter(
        (component) =>
          component &&
          typeof component.id === "string" &&
          typeof component.name === "string" &&
          typeof component.html === "string" &&
          typeof component.css === "string",
      )
      .map((component) => {
        const normalized = {
          id: component.id,
          name: component.name.slice(0, 60),
          html: component.html,
          css: component.css,
        };
        const plugin = normalizeStoredPluginComponent(component);
        if (plugin) normalized.plugin = plugin.plugin;
        return normalized;
      })
    : [];
  return {
    ...source,
    elements: pruneElementAttributes(
      source.elements.map((element) => ({
        ...element,
        localizations: normalizeLocalizedContent(element.localizations),
        pluginProperties:
          element.pluginProperties &&
            typeof element.pluginProperties === "object" &&
            !Array.isArray(element.pluginProperties)
            ? element.pluginProperties
            : {},
      })),
    ),
    components: pruneSavedComponents(
      Array.isArray(source.components) ? source.components : [],
    ),
    userComponents,
    requests,
    settings: {
      ...defaultSettings,
      ...sourceSettings,
      appMargin: clampNumber(sourceSettings.appMargin, 0, 100, 0),
      ...normalizeAppSpacing(sourceSettings),
      appLanguage: sourceSettings.appLanguage === "en" ? "en" : "ar",
      titleLocalizations: normalizeLocalizedContent(
        sourceSettings.titleLocalizations,
      ),
      organizationLocalizations: normalizeLocalizedContent(
        sourceSettings.organizationLocalizations,
      ),
      appTheme: sourceSettings.appTheme === "dark" ? "dark" : "light",
      appDarkTheme: normalizeThemeColors(
        sourceSettings.appDarkTheme,
        darkThemeColors,
      ),
      appLoadHandlers: normalizeAppLoadHandlers(sourceSettings.appLoadHandlers),
      globalActions: normalizeGlobalActions(sourceSettings.globalActions),
      selectedPluginIds: [
        ...new Set([
          ...(Array.isArray(sourceSettings.selectedPluginIds)
            ? sourceSettings.selectedPluginIds.filter((id) =>
              bundledPluginIds.has(id),
            )
            : []),
          ...requiredPluginIds,
        ]),
      ],
    },
  };
}

async function importProjectFile(file) {
  await importProjectData(JSON.parse(await file.text()));
}

async function importProjectData(project) {
  try {
    await bundledPluginLoadPromise;
  } catch (error) {
    throw new Error(
      localize.UnableToVerifyRequiredPlugins[editorLanguage],
      { cause: error },
    );
  }
  const imported = validateImportedProject(project);
  const storedProject = {
    ...imported,
    userComponents: imported.userComponents.filter(
      (component) => !Object.hasOwn(component, "plugin"),
    ),
  };
  const previousProject = localStorage.getItem(STORAGE_KEY);
  const previousRequests = localStorage.getItem(REQUESTS_STORAGE_KEY);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedProject));
    localStorage.setItem(
      REQUESTS_STORAGE_KEY,
      JSON.stringify(imported.requests),
    );
  } catch (error) {
    try {
      if (previousProject === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, previousProject);
      if (previousRequests === null)
        localStorage.removeItem(REQUESTS_STORAGE_KEY);
      else localStorage.setItem(REQUESTS_STORAGE_KEY, previousRequests);
    } catch (restoreError) {
      console.error(
        "Unable to restore project storage after failed import.",
        restoreError,
      );
    }
    throw error;
  }
  showToast(localize.ProjectImportedReloadingTheEditor[editorLanguage]);
  setTimeout(() => window.location.reload(), 400);
}

async function loadProjectGallery() {
  const list = document.querySelector("#project-gallery-list");
  const status = document.querySelector("#project-gallery-status");
  list.replaceChildren();
  status.hidden = false;
  status.textContent = localize.LoadingProjects[editorLanguage];
  try {
    const gallery = JSON.parse(
      new TextDecoder().decode(
        await readBundledAppFile("projects/project-gallery.json"),
      ),
    );
    if (
      !gallery ||
      !Array.isArray(gallery.projects) ||
      gallery.projects.some(
        (project) =>
          !project ||
          typeof project.name !== "string" ||
          typeof project.description !== "string" ||
          typeof project.file !== "string" ||
          !/^[A-Za-z0-9._-]+\.json$/.test(project.file),
      )
    )
      throw new Error("The project gallery manifest has an invalid shape.");

    status.hidden = gallery.projects.length > 0;
    status.textContent = localize.NoSavedProjectsAreAvailable[editorLanguage];
    gallery.projects.forEach((project) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "project-gallery-card";
      button.dataset.projectFile = project.file;
      const name = document.createElement("strong");
      name.textContent = project.name;
      const description = document.createElement("span");
      description.textContent = project.description;
      button.append(name, description);
      list.append(button);
    });
  } catch (error) {
    console.error("Unable to load the project gallery.", error);
    status.textContent = localize.UnableToLoadTheProjectList[editorLanguage];
    status.hidden = false;
  }
}

async function loadGalleryProject(file) {
  if (!/^[A-Za-z0-9._-]+\.json$/.test(file))
    throw new Error("Invalid project file name.");
  const project = JSON.parse(
    new TextDecoder().decode(await readBundledAppFile(`projects/${file}`)),
  );
  await importProjectData(project);
  document.querySelector("#project-gallery-dialog").close();
}

const MAX_ASSET_SIZE = 2 * 1024 * 1024;
const MAX_ASSET_TOTAL_SIZE = 2 * 1024 * 1024;

function formatAssetSize(size) {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function assetArchivePath(asset) {
  const name = asset.name.replace(/[^A-Za-z0-9._-]/g, "_") || "asset";
  return `assets/${asset.id.replace(/[^A-Za-z0-9_-]/g, "")}-${name}`;
}

function isJavaScriptAsset(asset) {
  if (/\.(?:mjs|cjs)$/i.test(asset.name)) return false;
  return (
    /\.js$/i.test(asset.name) ||
    [
      "text/javascript",
      "application/javascript",
      "application/x-javascript",
    ].includes(asset.type.toLowerCase())
  );
}

function isFunctionAssetInUse(assetId) {
  const containsReference = (value) => {
    if (!value || typeof value !== "object") return false;
    if (value.type === "function" && value.scriptAssetId === assetId)
      return true;
    return Object.values(value).some((child) =>
      Array.isArray(child)
        ? child.some(containsReference)
        : containsReference(child),
    );
  };
  return (
    state.elements.some((element) => containsReference(element.action)) ||
    containsReference(state.settings.appLoadHandlers)
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result), {
      once: true,
    });
    reader.addEventListener(
      "error",
      () =>
        reject(
          reader.error ||
          new Error(
            formatEditorMessage(localize.ReadFileFailed[editorLanguage], {
              name: file.name,
            }),
          ),
        ),
      { once: true },
    );
    reader.readAsDataURL(file);
  });
}

function renderAssets() {
  const list = document.querySelector("#asset-list");
  list.replaceChildren();
  document.querySelector("#asset-empty").hidden = state.assets.length > 0;
  state.assets.forEach((asset) => {
    const row = document.createElement("article");
    row.className = "asset-item";
    const details = document.createElement("div");
    details.className = "asset-details";
    if (asset.type.startsWith("image/")) {
      const image = document.createElement("img");
      image.className = "asset-thumbnail";
      image.src = asset.dataUrl;
      image.alt = "";
      details.append(image);
    } else {
      const icon = document.createElement("span");
      icon.className = "asset-thumbnail asset-file-icon";
      const glyph = document.createElement("i");
      glyph.className = asset.type.startsWith("audio/")
        ? "fa-solid fa-volume-high"
        : asset.type.startsWith("video/")
          ? "fa-solid fa-film"
          : "fa-solid fa-file";
      glyph.setAttribute("aria-hidden", "true");
      icon.append(glyph);
      details.append(icon);
    }
    const text = document.createElement("div");
    text.className = "asset-name";
    const name = document.createElement("strong");
    name.textContent = asset.name;
    const metadata = document.createElement("small");
    metadata.textContent = `${asset.type || localize.UnknownFileTypeAlternativeA[editorLanguage]} · ${formatAssetSize(asset.size)}`;
    text.append(name, metadata);
    details.append(text);

    const actions = document.createElement("div");
    actions.className = "asset-actions";
    const download = document.createElement("a");
    download.className = "button button-quiet";
    download.href = asset.dataUrl;
    download.download = asset.name;
    download.setAttribute(
      "aria-label",
      `${localize.Download[editorLanguage]} ${asset.name}`,
    );
    download.title = localize.Download[editorLanguage];
    const downloadIcon = document.createElement("i");
    downloadIcon.className = "fa-solid fa-download";
    downloadIcon.setAttribute("aria-hidden", "true");
    download.append(downloadIcon);
    const remove = document.createElement("button");
    remove.className = "icon-button";
    remove.type = "button";
    remove.dataset.deleteAsset = asset.id;
    remove.setAttribute(
      "aria-label",
      `${localize.Delete[editorLanguage]} ${asset.name}`,
    );
    const removeIcon = document.createElement("i");
    removeIcon.className = "fa-solid fa-trash";
    removeIcon.setAttribute("aria-hidden", "true");
    remove.append(removeIcon);
    actions.append(download, remove);
    row.append(details, actions);

    if (asset.type.startsWith("audio/")) {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = asset.dataUrl;
      row.append(audio);
    } else if (asset.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.controls = true;
      video.src = asset.dataUrl;
      row.append(video);
    }
    list.append(row);
  });
}

async function addAssets(files) {
  let totalSize = state.assets.reduce((total, asset) => total + asset.size, 0);
  for (const file of files) {
    if (file.size > MAX_ASSET_SIZE) {
      showToast(
        localize.FileExceedsSizeLimit[editorLanguage].replace(
          "{fileName}",
          () => file.name,
        ),
      );
      continue;
    }
    if (totalSize + file.size > MAX_ASSET_TOTAL_SIZE) {
      showToast(localize.AssetTotalSizeLimitReached[editorLanguage]);
      break;
    }
    let dataUrl;
    try {
      dataUrl = await readFileAsDataUrl(file);
    } catch (error) {
      console.error(`Unable to read asset ${file.name}.`, error);
      showToast(
        localize.UnableToReadFileFileName[editorLanguage].replace(
          "${file.name}",
          () => file.name,
        ),
      );
      continue;
    }
    const asset = {
      id: createId(),
      name: file.name.slice(0, 180),
      type: file.type || "application/octet-stream",
      size: file.size,
      dataUrl,
    };
    state.assets.push(asset);
    totalSize += file.size;
  }
  renderAssets();
  renderProperties();
  renderPreview(false);
  scheduleSave();
}

function createPreviewHeader() {
  if (state.settings.appTopBarType === "none") return;

  const header = document.createElement("div");
  header.className = "preview-header app-header";

  const brand = document.createElement("div");
  brand.className = "preview-brand";
  const text = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = getLocalizedAppTitle();
  const organization = document.createElement("small");
  organization.textContent = getLocalizedAppOrganization();
  text.append(title, organization);
  if (state.settings.appTopBarType === "standard") {
    const logoAsset = getAppLogoAsset();
    if (logoAsset) {
      const logo = document.createElement("img");
      logo.className = "preview-logo app-logo";
      logo.src = logoAsset.dataUrl;
      logo.alt = "";
      brand.append(logo);
    }
  }
  brand.append(text);
  header.append(brand);
  return header;
}

function collectPreviewFormValues() {
  const groups = new Map();
  preview
    .querySelectorAll("[data-field-name]:not(:disabled)")
    .forEach((control) => {
      const name = control.dataset.fieldName;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(control);
    });
  const values = new Map();
  const readValue = (control) => {
    const raw =
      control.dataset.formValue ??
      (control instanceof HTMLInputElement ? control.dataset.value : undefined);
    if (raw === undefined) return control.value;
    return JSON.parse(raw);
  };
  groups.forEach((controls, name) => {
    const first = controls[0];
    if (first.dataset.filePicker !== undefined) {
      try {
        values.set(name, JSON.parse(first.dataset.filePickerValue || "[]"));
      } catch {
        values.set(name, []);
      }
      return;
    }
    if (first instanceof HTMLSelectElement) {
      const selected = [...first.selectedOptions].filter(
        (option) => !option.disabled,
      );
      const selectedValues = selected.map(readValue);
      if (first.multiple) values.set(name, selectedValues);
      else values.set(name, selectedValues.length ? selectedValues[0] : "");
      return;
    }
    if (first instanceof HTMLInputElement && first.type === "radio") {
      const selected = controls.find((control) => control.checked);
      if (selected) values.set(name, readValue(selected));
      return;
    }
    if (
      controls.every(
        (control) =>
          control instanceof HTMLInputElement && control.type === "checkbox",
      )
    ) {
      if (controls.length === 1) values.set(name, first.checked);
      else
        values.set(
          name,
          controls.filter((control) => control.checked).map(readValue),
        );
      return;
    }
    if (first instanceof HTMLInputElement) values.set(name, first.value);
  });
  return values;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, number))
    : fallback;
}

function normalizeDimension(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const dimension = String(value).trim().toLowerCase();
  if (dimension === "auto") return dimension;
  const match = dimension.match(/^(\d+(?:\.\d+)?)(px|%|rem|em|vw|vh)$/);
  if (!match) return "";
  const number = Number(match[1]);
  if (!Number.isFinite(number) || number > 10000) return "";
  if (match[2] === "%" && number > 100) return "";
  return `${number}${match[2]}`;
}

function getConditionActionLists(action = {}) {
  return readConditionActionLists(action);
}

function ensureWorkflowActionIds(actions) {
  assignWorkflowActionIds(actions, {
    isBranchAction: isWorkflowBranchAction,
    createId,
  });
}

function renderExtraDataFields(element) {
  const container = document.querySelector("#element-extra-data-list");
  container.replaceChildren();
  (element.extraData || []).forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "condition-action element-extra-data-row";
    const key = document.createElement("input");
    key.type = "text";
    key.maxLength = 64;
    key.dir = "ltr";
    key.placeholder = localize.Key[editorLanguage];
    key.value = item.key || "";
    key.dataset.extraDataField = "key";
    key.dataset.extraDataIndex = String(index);
    key.setAttribute(
      "aria-label",
      formatEditorMessage(localize.AdditionalDataName[editorLanguage], {
        index: index + 1,
      }),
    );
    const value = document.createElement("textarea");
    value.rows = 2;
    value.dir = "ltr";
    value.placeholder = localize.ValueOrItemToken[editorLanguage];
    value.value = item.value || "";
    value.dataset.extraDataField = "value";
    value.dataset.extraDataIndex = String(index);
    value.setAttribute(
      "aria-label",
      formatEditorMessage(localize.AdditionalDataValue[editorLanguage], {
        index: index + 1,
      }),
    );
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button button-quiet";
    remove.dataset.removeExtraData = String(index);
    remove.textContent = localize.Delete[editorLanguage];
    row.append(key, value, remove);
    container.append(row);
  });
}

function syncLayoutControlButtons() {
  document
    .querySelectorAll(".layout-alignment-buttons[data-layout-control]")
    .forEach((group) => {
      const select = document.getElementById(group.dataset.layoutControl);
      if (!(select instanceof HTMLSelectElement)) return;
      group.querySelectorAll("[data-layout-value]").forEach((button) => {
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.layoutValue === select.value),
        );
      });
    });
}

function renderProperties() {
  renderEventHandlers(
    { handlers: state.settings.appLoadHandlers },
    { appLoad: true },
  );
  const element = state.elements.find(
    (item) =>
      item.id === state.selectedId && item.pageId === state.currentPageId,
  );
  const hasSelection = Boolean(element);
  const editSavedComponentButton = document.querySelector(
    "#edit-saved-component",
  );
  editSavedComponentButton.hidden =
    !element?.savedComponentInstanceId ||
    element.savedComponentInstanceId ===
    state.editingSavedComponentInstanceId;
  applicationProperties.hidden = hasSelection;
  propertyForm.hidden = !hasSelection;
  document.querySelector("#delete-element").disabled = !hasSelection;

  document.querySelector("#save-selected-component").hidden =
    !hasSelection ||
    !["layout", "grid", "absoluteLayout"].includes(element.type);
  if (!element) {
    document.querySelector("#application-title").value =
      getLocalizedAppTitle();
    document.querySelector("#application-organization").value =
      getLocalizedAppOrganization();
    const logoAssetSelect = document.querySelector("#application-logo-asset");
    logoAssetSelect.replaceChildren(
      new Option(localize.NoImage[editorLanguage], ""),
    );
    state.assets
      .filter((asset) => asset.type.startsWith("image/"))
      .forEach((asset) =>
        logoAssetSelect.add(new Option(asset.name, asset.id)),
      );
    logoAssetSelect.value = getAppLogoAsset()?.id || "";
    document.querySelectorAll("[data-app-spacing]").forEach((input) => {
      const [, kind, side] = input.dataset.appSpacing.match(
        /^(margin|padding)(Top|Right|Bottom|Left)$/,
      );
      const values =
        kind === "margin"
          ? state.settings.appMargins
          : state.settings.appPaddings;
      input.value = values[side.toLowerCase()];
    });
    document.querySelector("#application-topbar-type").value =
      state.settings.appTopBarType;
    document.querySelector("#application-element-size").value = [
      "small",
      "normal",
      "large",
    ].includes(state.settings.appElementSize)
      ? state.settings.appElementSize
      : "normal";
    document.querySelector("#application-api-progress-indicator").checked =
      state.settings.appApiProgressIndicator !== false;
    document.querySelector("#application-api-progress-label").checked =
      state.settings.appApiProgressLabel === true;
    document.querySelector("#application-show-error-message").checked =
      state.settings.appShowErrorMessage !== false;
    return;
  }

  document.querySelector("#property-element-id").value = element.id;
  document.querySelector("#property-content").value =
    getLocalizedContent(element);
  document.querySelector("#property-content-language").textContent =
    state.settings.appLanguage === "ar"
      ? localize.CurrentContentLanguageArabic[editorLanguage]
      : localize.CurrentContentLanguageEnglish[editorLanguage];
  document.querySelector("#property-content-label").textContent =
    element.type === "card" ? localize.CardContent[editorLanguage] : localize.Content[editorLanguage];
  const selectedPlugin = renderPluginPropertyFields(element);
  document.querySelector("#property-content-label").hidden =
    Boolean(selectedPlugin);
  document.querySelector("#property-content").hidden = Boolean(selectedPlugin);
  document.querySelector("#property-content-language").hidden =
    Boolean(selectedPlugin);
  document.querySelector("#card-fields").hidden = element.type !== "card";
  document.querySelector("#property-card-header").value =
    element.cardHeader || "";
  document.querySelector("#property-card-footer").value =
    element.cardFooter || "";
  const parent = state.elements.find(
    (candidate) => candidate.id === element.parentId,
  );
  document.querySelector("#card-slot-field").hidden = parent?.type !== "card";
  document.querySelector("#property-card-slot").value =
    element.cardSlot === "footer" ? "footer" : "content";
  document.querySelector("#property-class-name").value = normalizeClassNames(
    element.className,
  );
  document.querySelector("#icon-fields").hidden =
    !["button", "icon"].includes(element.type);
  document.querySelector("#property-icon-class").value = /^fa-[a-z0-9-]+$/.test(
    element.iconClass,
  )
    ? element.iconClass
    : element.type === "button"
      ? ""
      : "fa-star";
  document.querySelector("#image-fields").hidden = element.type !== "image";
  document.querySelector("#property-image-url").value = element.imageUrl || "";
  const assetSelect = document.querySelector("#property-image-asset");
  assetSelect.replaceChildren(new Option(localize.NoSavedAsset[editorLanguage], ""));
  state.assets
    .filter((asset) => asset.type.startsWith("image/"))
    .forEach((asset) => assetSelect.add(new Option(asset.name, asset.id)));
  assetSelect.value = state.assets.some(
    (asset) => asset.id === element.assetId && asset.type.startsWith("image/"),
  )
    ? element.assetId
    : "";
  document.querySelector("#property-image-fit").value =
    element.imageFit === "contain" ? "contain" : "cover";
  document.querySelector("#property-color").value = safeColor(
    element.styles.color,
    "#263b35",
  );
  document.querySelector("#property-background").value = safeColor(
    element.styles.background,
    "#ffffff",
  );
  document.querySelector("#property-background-transparent").checked =
    element.styles.background === "transparent";
  document.querySelector("#property-background").disabled =
    element.styles.background === "transparent";
  document.querySelector("#property-ripple-effect").checked =
    element.rippleEffect === true;
  document.querySelector("#property-font-size").value = clampNumber(
    element.styles.fontSize,
    14,
    36,
    14,
  );
  document.querySelector("#property-width").value = normalizeDimension(
    element.styles.width,
  );
  document.querySelector("#property-height").value = normalizeDimension(
    element.styles.height,
  );
  document.querySelectorAll("[data-element-spacing]").forEach((input) => {
    input.value = clampNumber(
      element.styles[input.dataset.elementSpacing],
      0,
      input.dataset.elementSpacing.startsWith("padding") ? 48 : 100,
      input.dataset.elementSpacing.startsWith("padding")
        ? clampNumber(element.styles.padding, 0, 48, 8)
        : clampNumber(element.styles.margin, 0, 100, 0),
    );
  });
  const variantOptions = getVariantOptions(element.type);
  const variantSelect = document.querySelector("#property-variant");
  variantSelect.replaceChildren(
    ...variantOptions.map(
      (variant) => new Option(variantLabels[variant], variant),
    ),
  );
  document.querySelector("#button-variant-fields").hidden =
    variantOptions.length === 0;
  document.querySelector("#button-variant-fields .field-label").textContent =
    `${typeNames[element.type]} variant`;
  variantSelect.value = variantOptions.includes(element.styles.variant)
    ? element.styles.variant
    : variantOptions.includes(getDefaultVariant(element.type))
      ? getDefaultVariant(element.type)
      : variantOptions[0] || "";
  document.querySelector("#background-color-field").hidden =
    element.styles.variant !== "custom";

  document.querySelector("#background-transparent-field").hidden =
    element.styles.variant !== "custom";
  const disabledTypes = [
    "button",
    "input",
    "list",
    "checkbox",
    "radio",
    "chip",
    "fab",
    "switch",
    "toast",
    "filePicker",
  ];
  document.querySelector("#disabled-field").hidden = !disabledTypes.includes(
    element.type,
  );
  document.querySelector("#property-disabled").checked = Boolean(
    element.disabled,
  );
  document.querySelector("#property-input-min").value = element.min ?? "";
  document.querySelector("#property-input-max").value = element.max ?? "";
  document.querySelector("#progress-fields").hidden =
    element.type !== "progress";
  document.querySelector("#property-progress-mode").value =
    element.progressMode === "determinate" ? "determinate" : "indeterminate";
  document.querySelector("#progress-value-fields").hidden =
    element.progressMode !== "determinate";
  document.querySelector("#property-progress-value").value = clampNumber(
    element.progressValue,
    0,
    1000000,
    0,
  );
  document.querySelector("#property-progress-max").value = clampNumber(
    element.progressMax,
    1,
    1000000,
    100,
  );

  document.querySelector("#property-border-width").value = clampNumber(
    element.styles.borderWidth,
    0,
    12,
    0,
  );
  document.querySelector("#property-border-color").value = safeColor(
    element.styles.borderColor,
    "#dbe5e1",
  );
  document.querySelector("#property-border-radius").value = clampNumber(
    element.styles.borderRadius,
    0,
    100,
    0,
  );
  document.querySelector("#property-align").value = [
    "start",
    "center",
    "end",
  ].includes(element.styles.align)
    ? element.styles.align
    : "start";
  document.querySelector("#layout-fields").hidden =
    element.type !== "layout" &&
    element.type !== "absoluteLayout" &&
    element.type !== "grid" &&
    element.type !== "collection" &&
    element.type !== "scrollView";
  const absoluteAlignment = getAbsoluteLayoutChildAlignment(element);
  document.querySelector("#absolute-child-alignment-fields").hidden =
    !absoluteAlignment;
  document.querySelector("#flow-layout-fields").hidden =
    element.type === "absoluteLayout";
  document.querySelector("#property-horizontal-alignment").value =
    absoluteAlignment?.horizontal || "start";
  document.querySelector("#property-vertical-alignment").value =
    absoluteAlignment?.vertical || "top";
  document.querySelector("#grid-columns-field").hidden =
    element.type !== "grid";
  document.querySelector("#scroll-view-fields").hidden =
    element.type !== "scrollView";
  const layout = element.layout || {
    direction: "column",
    align: "stretch",
    justify: "start",
    gap: 8,
    columns: 2,
  };
  document.querySelector("#property-layout-direction").value =
    layout.direction === "row" ? "row" : "column";
  document.querySelector("#property-layout-align").value = [
    "start",
    "center",
    "end",
    "stretch",
  ].includes(layout.align)
    ? layout.align
    : "stretch";
  document.querySelector("#property-layout-justify").value = [
    "start",
    "center",
    "end",
    "space-between",
  ].includes(layout.justify)
    ? layout.justify
    : "start";
  syncLayoutControlButtons();
  document.querySelector("#property-layout-gap").value = clampNumber(
    layout.gap,
    0,
    48,
    8,
  );
  document.querySelector("#property-grid-columns").value = clampNumber(
    layout.columns,
    1,
    12,
    2,
  );
  document.querySelector("#property-scroll-axis").value = [
    "vertical",
    "horizontal",
    "both",
  ].includes(element.scroll?.axis)
    ? element.scroll.axis
    : "vertical";

  document.querySelector("#field-name-field").hidden = ![
    "input",
    "list",
    "checkbox",
    "radio",
    "switch",
    "layout",
  ].includes(element.type);
  document.querySelector("#property-field-name").value = getFormName(element);
  renderExtraDataFields(element);
  document.querySelector("#input-type-field").hidden = element.type !== "input";
  document.querySelector("#property-input-type").value = inputTypes.includes(
    element.inputType,
  )
    ? element.inputType
    : "text";
  document.querySelector("#property-hidden").checked = Boolean(element.hidden);
  const listSource = element.listSource || { type: "static" };
  const listSourceType = listSource.type || "static";
  document.querySelector("#list-source-fields").hidden =
    element.type !== "list";
  document.querySelector("#collection-source-fields").hidden =
    element.type !== "collection";
  document.querySelector("#collection-item-fields").hidden =
    element.type !== "collection" || listSource.type !== "static";
  document.querySelector("#property-collection-source").value =
    listSource.type || "static";
  document.querySelector("#collection-endpoint-fields").hidden =
    listSource.type !== "endpoint";
  document.querySelector("#collection-twk-fields").hidden =
    listSource.type !== "twk";
  document.querySelector("#property-collection-path").value =
    listSource.path || "";
  document.querySelector("#property-collection-twk-field").value =
    listSource.field || "family_members";
  document.querySelector("#property-collection-items").value = JSON.stringify(
    element.collectionItems || defaultCollectionItems,
    null,
    2,
  );
  document.querySelector("#property-list-source").value =
    listSourceType;
  document.querySelector("#data-source-static-options").hidden =
    element.type !== "list" || listSourceType !== "static";
  document.querySelector("#list-static-options").hidden =
    element.type !== "list" || listSourceType !== "static";
  document.querySelector("#property-list-options").value = JSON.stringify(
    normalizeOptions(element.options, !element.multiple),
    null,
    2,
  );
  document.querySelector("#property-list-twk-field").value =
    listSource.field || "family_members";
  document.querySelector("#list-endpoint-fields").hidden =
    listSource.type !== "endpoint";
  document.querySelector("#list-twk-fields").hidden = listSource.type !== "twk";
  document.querySelector("#property-list-path").value = listSource.path || "";
  document.querySelector("#property-list-label-path").value =
    listSource.labelPath ?? "label";
  document.querySelector("#property-list-value-path").value =
    listSource.valuePath ?? "value";
  document.querySelector("#radio-static-options").hidden =
    element.type !== "radio" || (element.binding?.source || "static") !== "static";
  document.querySelector("#property-options").value = JSON.stringify(
    normalizeOptions(element.options, true),
    null,
    2,
  );
  document.querySelector("#multiple-field").hidden = element.type !== "list";
  document.querySelector("#property-multiple").checked = Boolean(
    element.multiple,
  );
  document.querySelector("#file-picker-fields").hidden =
    element.type !== "filePicker";
  document.querySelector("#property-file-picker-mode").value =
    element.filePickerMode === "multiple" ? "multiple" : "single";
  document.querySelector("#property-file-picker-appearance").value =
    element.filePickerAppearance === "dropzone" ? "dropzone" : "button";
  document.querySelector("#checked-field").hidden = ![
    "checkbox",
    "switch",
  ].includes(element.type);
  document.querySelector("#property-checked").checked = Boolean(
    element.checked,
  );
  document.querySelector("#checkbox-value-field").hidden =
    element.type !== "checkbox";
  document.querySelector("#item-choice-fields").hidden = !(
    ["checkbox", "radio", "switch"].includes(element.type) &&
    isInsideCollection(element)
  );
  document.querySelector("#property-item-label-path").value =
    element.itemLabelPath || "";
  document.querySelector("#property-item-value-path").value =
    element.itemValuePath || "";
  document.querySelector("#property-checkbox-value").value = JSON.stringify(
    element.fieldValue === undefined ? true : element.fieldValue,
  );
  document.querySelector("#button-action-fields").hidden = true;
  const action = element.action || {
    type: "none",
    event: ["checkbox", "radio", "switch"].includes(element.type)
      ? "change"
      : "click",
    requestId: "",
    serviceId: "",
    values: "{}",
  };
  renderEventHandlers(element.action || action);
  const bindingSourceSelect = document.querySelector(
    "#property-binding-source",
  );
  populateValueSourceOptions(bindingSourceSelect, isInsideCollection(element));
  bindingSourceSelect.value = element.binding?.source || "static";
  const extraBinding = document.querySelector("#property-binding-extra");
  extraBinding.replaceChildren();
  state.elements.forEach((candidate) => {
    normalizeExtraData(candidate.extraData).forEach((extra) => {
      extraBinding.add(
        new Option(
          `${getElementName(candidate)} · ${extra.key}`,
          `${candidate.id}.extra.${extra.key}`,
        ),
      );
    });
  });
  if (!extraBinding.options.length)
    extraBinding.add(
      new Option(localize.AddAdditionalInfoToElementFirst[editorLanguage], ""),
    );
  extraBinding.value =
    element.binding?.source === "extra" ? element.binding.path : "";
  document.querySelector("#extra-binding-fields").hidden =
    element.binding?.source !== "extra";
  renderVariableOptions(
    element.binding?.source === "variable" ? element.binding.path : "",
  );
  document.querySelector(
    '#property-binding-source option[value="variable"]',
  ).disabled = state.variables.length === 0;
  document.querySelector(
    '#property-binding-source option[value="item"]',
  ).hidden = !isInsideCollection(element);
  document.querySelector("#item-binding-fields").hidden =
    element.binding?.source !== "item";
  const formBindingSelect = document.querySelector(
    "#property-binding-form-field",
  );
  populateFormFieldSelect(
    formBindingSelect,
    element.pageId,
    element.binding?.source === "form" ? element.binding.path : "",
  );
  document.querySelector("#form-binding-fields").hidden =
    element.binding?.source !== "form";
  document.querySelector("#property-item-binding-path").value =
    element.binding?.source === "item" ? element.binding.path : "";
  document.querySelector("#property-twk-field").value =
    element.binding?.source === "twk"
      ? element.binding.path
      : TWK_FIELDS[0].key;
  document.querySelector("#property-binding-endpoint").value =
    element.binding?.source === "endpoint"
      ? element.binding.requestId
      : state.requests[0]?.id || "";
  document.querySelector("#property-binding-path").value =
    element.binding?.source === "endpoint" ? element.binding.path : "";
  document.querySelector("#property-binding-object-path").value =
    element.binding?.objectPath || "";
  updateBindingObjectPathVisibility(element);
  const elementBindingTarget = document.querySelector(
    "#property-binding-element",
  );
  elementBindingTarget.replaceChildren();
  state.elements
    .filter((candidate) => candidate.id !== element.id)
    .forEach((candidate) => {
      elementBindingTarget.add(
        new Option(
          `${typeNames[candidate.type]} · ${getElementName(candidate)}`,
          candidate.id,
        ),
      );
    });
  if (!elementBindingTarget.options.length)
    elementBindingTarget.add(
      new Option(localize.AddSourceElementFirst[editorLanguage], ""),
    );
  elementBindingTarget.value =
    element.binding?.source === "element"
      ? element.binding.elementId
      : elementBindingTarget.options[0]?.value || "";
  const elementBindingProperty = document.querySelector(
    "#property-binding-element-property",
  );
  elementBindingProperty.replaceChildren();
  const elementBindingSource = state.elements.find(
    (candidate) => candidate.id === elementBindingTarget.value,
  );
  getElementSourcePropertyOptions(elementBindingSource || { type: "" }).forEach(
    ([label, property]) =>
      elementBindingProperty.add(new Option(label, property)),
  );
  elementBindingProperty.value =
    element.binding?.source === "element"
      ? element.binding.property
      : elementBindingProperty.options[0]?.value || "";
  document.querySelector("#element-binding-fields").hidden =
    element.binding?.source !== "element";
  document.querySelector("#twk-binding-fields").hidden =
    element.binding?.source !== "twk";
  document.querySelector("#endpoint-binding-fields").hidden =
    element.binding?.source !== "endpoint";
  document.querySelector("#variable-binding-fields").hidden =
    element.binding?.source !== "variable";
  document.querySelector(".binding-section").hidden =
    Boolean(selectedPlugin) ||
    ["list", "image", "collection", "icon", "sheet"].includes(element.type);
  renderEndpointOptions();
  updateColorLabels();
}

function renderPluginPropertyFields(element) {
  const section = document.querySelector("#plugin-properties");
  section.replaceChildren();
  const component = state.userComponents.find(
    (item) => item.id === element.customComponentId,
  );
  const plugin = component ? getPluginDefinition(component) : null;
  section.hidden = element.type !== "custom" || !plugin?.properties.length;
  if (!plugin || !plugin.properties.length) return plugin;
  const localizedPlugin = localizePluginDefinition(plugin, editorLanguage);

  element.pluginProperties = normalizePluginProperties(
    plugin,
    element.pluginProperties,
  );
  const heading = document.createElement("span");
  heading.className = "binding-heading";
  heading.textContent = `${localize.PluginProperties[editorLanguage]} · ${localizedPlugin.title}`;
  section.append(heading);

  localizedPlugin.properties.forEach((property) => {
    const value = element.pluginProperties[property.key];
    if (property.type === "boolean") {
      const label = document.createElement("label");
      label.className = "check-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = value === true;
      input.dataset.pluginProperty = property.key;
      const text = document.createElement("span");
      text.textContent = property.label;
      label.append(input, text);
      section.append(label);
      return;
    }

    const label = document.createElement("label");
    label.className = "field-label";
    label.textContent = property.label;
    const input =
      property.type === "select"
        ? document.createElement("select")
        : document.createElement("input");
    if (input instanceof HTMLInputElement) {
      input.type = property.type === "number" ? "number" : property.type;
      input.value = String(value);
    } else {
      property.options?.forEach((option) =>
        input.add(new Option(property.optionLabels?.[option] ?? option, option)),
      );
      input.value = String(value);
    }
    input.dataset.pluginProperty = property.key;
    section.append(label, input);
  });
  return plugin;
}

function getActionElementTargetField(handler) {
  if (["showElement", "hideElement"].includes(handler.type))
    return "elementId";
  if (handler.type === "changeProperty") return "targetElementId";
  if (["showSheet", "hideSheet"].includes(handler.type)) return "sheetId";
  if (handler.type === "showToast") return "toastId";
  if (handler.type === "function" && handler.functionSource === "plugin")
    return "pluginElementId";
  return "";
}

function getActionElementsForPage(handler, pageId) {
  const targetType = {
    showSheet: "sheet",
    hideSheet: "sheet",
    showToast: "toast",
  }[handler.type];
  return getElementsOnPage(state, pageId, (element) => {
    if (targetType) return element.type === targetType;
    if (handler.type === "function" && handler.functionSource === "plugin")
      return (
        element.type === "custom" &&
        state.userComponents.some(
          (component) =>
            component.id === element.customComponentId && component.plugin,
        )
      );
    return true;
  });
}

function updateActionElementPage(handler) {
  const targetField = getActionElementTargetField(handler);
  if (!targetField) return;
  handler[targetField] =
    getActionElementsForPage(handler, handler.targetPageId)[0]?.id || "";
}

function initializeEventHandler(handler) {
  if (handler.type === "condition") {
    handler.condition ||= {
      source: "api",
      requestId: state.requests[0]?.id || "",
      operator: "equals",
      value: "null",
    };
    handler.actions ||= [];
    handler.elseActions ||= [];
  }
  if (twkPermissionActionTypes.includes(handler.type)) {
    delete handler.condition;
    handler.actions ||= [];
    handler.elseActions ||= [];
  }
  if (handler.type === "request")
    handler.requestId = getRequestIdOrDefault(
      state.requests,
      handler.requestId,
    );
  if (handler.type === "navigate")
    handler.pageId ||=
      state.pages.find((page) => page.kind === "page")?.id || "";
  if (handler.type === "setVariable") {
    handler.variableId ||=
      state.variables.find((variable) => variable.source === "static")?.id ||
      "";
    handler.value ??= "null";
  }
  if (handler.type === "changeProperty") {
    handler.targetElementId ||=
      getElementsOnPage(state, state.currentPageId)[0]?.id || "";
    const target = state.elements.find(
      (element) => element.id === handler.targetElementId,
    );
    handler.property ||=
      getChangePropertyOptions(target || { type: "" })[0]?.[1] || "";
    handler.value ??= "";
  }
  if (handler.type === "openService") handler.values ??= "{}";
  if (handler.type === "message") {
    handler.title ??= "";
    handler.message ??= "";
  }
  if (handler.type === "showSheet")
    handler.sheetId ||=
      getElementsOnPage(
        state,
        state.currentPageId,
        (candidate) => candidate.type === "sheet",
      )[0]?.id || "";
  if (handler.type === "hideSheet")
    handler.sheetId ||=
      getElementsOnPage(
        state,
        state.currentPageId,
        (candidate) => candidate.type === "sheet",
      )[0]?.id || "";
  if (handler.type === "showToast")
    handler.toastId ||=
      getElementsOnPage(
        state,
        state.currentPageId,
        (candidate) => candidate.type === "toast",
      )[0]?.id || "";
  if (handler.type === "function") {
    handler.functionSource ||= "global";
    handler.functionName ||= "";
    handler.parameters ||= "[]";
    handler.scriptAssetId ||= state.assets.find(isJavaScriptAsset)?.id || "";
    handler.resultVariableId ||= "";
    if (handler.functionSource === "plugin")
      handler.pluginElementId ||=
        getActionElementsForPage(
          handler,
          handler.targetPageId || state.currentPageId,
        )[0]?.id || "";
  }
  if (handler.type === "globalAction" && !handler.globalActionId)
    handler.globalActionId = state.settings.globalActions?.[0]?.id || "";
}

function getWorkflowGraphLayout(graphKey) {
  return readWorkflowGraphLayout(state.settings.eventWorkflowGraphs, graphKey, {
    clampNumber,
    createWorkflowEdge,
    onMigrate: scheduleSave,
  });
}

function getWorkflowEditorState(graphKey) {
  return getWorkflowEditorStateForGraph(state.workflowEditor, graphKey);
}

function serializeWorkflowGraph(nodes, edges) {
  return serializeWorkflowGraphModel(nodes, edges, isWorkflowBranchAction);
}

function createWorkflowEdge(from, to, kind = "sequence", label = "") {
  return createWorkflowEdgeModel(from, to, kind, label);
}

function saveWorkflowGraphLayout(graphKey, layout) {
  persistWorkflowGraphLayout(state.settings, graphKey, layout, scheduleSave);
}

function insertWorkflowToken(field, token) {
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement))
    return false;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  field.value =
    field.value.slice(0, start) +
    token +
    field.value.slice(end);
  field.setSelectionRange(start + token.length, start + token.length);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function renderWorkflowEdges(stage, svg, layout, zoom) {
  drawWorkflowEdges(stage, svg, layout, zoom, {
    getEditorState: getWorkflowEditorState,
    escapeHtml,
  });
}

function redrawWorkflowGraphs() {
  document.querySelectorAll(".workflow-stage").forEach((stage) => {
    const graphKey = stage.dataset.workflowGraph;
    const layout = getWorkflowGraphLayout(graphKey);
    const svg = stage.querySelector(".workflow-edges");
    const nodeLayer = stage.querySelector(".workflow-node-layer");
    if (!svg || !nodeLayer || !stage.isConnected) return;
    renderWorkflowEdges(
      stage,
      svg,
      layout,
      layout.zoom,
    );
    renderWorkflowMinimap(
      stage.closest(".workflow-editor")?.querySelector(".workflow-minimap"),
      nodeLayer,
      layout,
      graphKey,
    );
  });
}

document.addEventListener(
  "toggle",
  (event) => {
    if (!(event.target instanceof HTMLDetailsElement)) return;
    requestAnimationFrame(redrawWorkflowGraphs);
  },
  true,
);
window.addEventListener("resize", redrawWorkflowGraphs);

function getWorkflowTokenOptions(element, callerContext = false) {
  const hasElementContext = Boolean(element) || callerContext;
  const sources = [
    {
      id: "source:self",
      label: localize.ElementContext[editorLanguage],
      tokens: [
        ...(element
          ? getElementSourcePropertyOptions(element).map(([, property]) => ({
            label: `self.${property}`,
            token: `{{self.${property}}}`,
          }))
          : callerContext
            ? ["id", "content"].map((property) => ({
              label: `self.${property}`,
              token: `{{self.${property}}}`,
            }))
            : []),
        ...(hasElementContext
          ? ["dataset", "data", "dataAttributes"].map((property) => ({
            label: `self.${property}`,
            token: `{{self.${property}}}`,
          }))
          : []),
        ...normalizeExtraData(element?.extraData).map((extra) => ({
          label: `self.extra.${extra.key}`,
          token: `{{self.extra.${extra.key}}}`,
        })),
      ],
    },
    {
      id: "source:twk",
      label: localize.Tawakkalna[editorLanguage],
      tokens: TWK_FIELDS.map((field) => ({
        label: `twk.${field.key}`,
        token: `{{twk.${field.key}}}`,
      })),
    },
    {
      id: "source:var",
      label: localize.Variables[editorLanguage],
      tokens: state.variables.map((variable) => ({
        label: `var.${variable.name}`,
        token: `{{var.${variable.name}}}`,
      })),
    },
    {
      id: "source:api",
      label: localize.APIResponse[editorLanguage],
      tokens: state.requests.map((request) => ({
        label: `api.${request.id}.data`,
        token: `{{api.${request.id}.data}}`,
      })),
    },
  ];
  const formFields = state.elements
    .filter((candidate) =>
      ["input", "list", "checkbox", "radio", "switch", "filePicker"].includes(
        candidate.type,
      ),
    )
    .map((field) => {
      const name = getFormName(field);
      return {
        label: `form.${name}`,
        token: `{{form.${name}}}`,
        category:
          field.type === "input"
            ? "Text inputs"
            : ["list", "radio"].includes(field.type)
              ? "Selection fields"
              : ["checkbox", "switch"].includes(field.type)
                ? "Toggles"
                : "Files",
      };
    });
  if (formFields.length) {
    [...new Set(formFields.map((field) => field.category))].forEach(
      (category) => {
        sources.push({
          id: `source:form:${category}`,
          label: `Form fields · ${category}`,
          tokens: formFields.filter((field) => field.category === category),
        });
      },
    );
  }
  if (callerContext || (element && isInsideCollection(element))) {
    let collection = element
      ? state.elements.find((candidate) => candidate.id === element.parentId)
      : null;
    while (collection && collection.type !== "collection")
      collection = state.elements.find(
        (candidate) => candidate.id === collection.parentId,
      );
    const sample = collection ? getCollectionItems(collection)[0] : null;
    const itemFields =
      sample && typeof sample === "object" && !Array.isArray(sample)
        ? Object.keys(sample).map((key) => ({
          label: `item.${key}`,
          token: `{{item.${key}}}`,
        }))
        : [];
    sources.push({
      id: "source:item",
      label: localize.CurrentItem[editorLanguage],
      tokens: [
        { label: "item.value", token: "{{item.value}}" },
        ...itemFields,
      ],
      itemPathInput: true,
    });
  }
  return sources.filter((source) => source.tokens.length);
}

let activeTokenPickerTarget = null;
let activeTokenPickerElement = null;
let activeTokenPickerCallerContext = false;

function renderTokenPickerOptions(query = "") {
  const list = document.querySelector("#token-picker-options");
  const empty = document.querySelector("#token-picker-empty");
  const normalizedQuery = query.trim().toLowerCase();
  const sources = getWorkflowTokenOptions(
    activeTokenPickerElement,
    activeTokenPickerCallerContext,
  );
  list.replaceChildren();
  let visibleCount = 0;
  sources.forEach((source) => {
    const matches = source.tokens.filter(
      (item) =>
        !normalizedQuery ||
        `${source.label} ${item.label} ${item.token}`
          .toLowerCase()
          .includes(normalizedQuery),
    );
    if (!matches.length) return;
    const section = document.createElement("section");
    section.className = "token-picker-category";
    const heading = document.createElement("h3");
    heading.textContent = source.label;
    const options = document.createElement("div");
    options.className = "token-picker-category-options";
    matches.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "token-picker-option";
      button.dataset.tokenValue = item.token;
      const name = document.createElement("span");
      name.textContent = item.label;
      const token = document.createElement("code");
      token.textContent = item.token;
      button.append(name, token);
      options.append(button);
      visibleCount += 1;
    });
    section.append(heading, options);
    list.append(section);
  });
  empty.hidden = visibleCount > 0;
}

function openTokenPicker(target, element = null, callerContext = false) {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement))
    throw new Error("A text field is required to insert a token.");
  activeTokenPickerTarget = target;
  activeTokenPickerElement = element;
  activeTokenPickerCallerContext = callerContext;
  const dialog = document.querySelector("#token-picker-dialog");
  const search = document.querySelector("#token-picker-search");
  search.value = "";
  renderTokenPickerOptions();
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() => search.focus());
}

function attachTokenPicker(
  input,
  element,
  label = "Insert token",
  callerContext = false,
) {
  const wrapper = document.createElement("div");
  wrapper.className = "token-picker-input";
  input.parentElement?.insertBefore(wrapper, input);
  wrapper.append(input);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-quiet token-picker-trigger";
  button.textContent = label;
  button.setAttribute("aria-label", `${label} into ${input.getAttribute("aria-label") || "value"}`);
  button.addEventListener("click", () =>
    openTokenPicker(input, element, callerContext),
  );
  wrapper.append(button);
  return wrapper;
}

function renderWorkflowMinimap(minimap, nodeLayer, layout, graphKey) {
  drawWorkflowMinimap(minimap, nodeLayer, layout, graphKey);
}

document.addEventListener("keydown", (event) => {
  if (
    event.code !== "Space" ||
    (event.target instanceof Element &&
      event.target.closest("input, textarea, select, [contenteditable='true']"))
  )
    return;
  Object.values(state.workflowEditor).forEach((editor) => {
    editor.spacePressed = true;
  });
});
document.addEventListener("keyup", (event) => {
  if (event.code !== "Space") return;
  Object.values(state.workflowEditor).forEach((editor) => {
    editor.spacePressed = false;
  });
});

function writeWorkflowActions(actions, appLoad, globalActionId = "") {
  const normalized = actions.map((handler) => {
    const copy = { ...handler };
    delete copy.isPrimary;
    delete copy.appLoad;
    delete copy.handlers;
    return copy;
  });
  if (globalActionId) {
    const globalAction = (state.settings.globalActions || []).find(
      (candidate) => candidate.id === globalActionId,
    );
    if (!globalAction) return;
    globalAction.actions = normalized;
    renderEventHandlers(
      { handlers: globalAction.actions },
      { globalActionId },
    );
  } else if (appLoad) {
    state.settings.appLoadHandlers = normalized.map((handler) => ({
      ...handler,
      event: "load",
    }));
    renderEventHandlers(
      { handlers: state.settings.appLoadHandlers },
      { appLoad: true },
    );
  } else {
    const element = state.elements.find(
      (candidate) => candidate.id === state.selectedId,
    );
    if (!element) return;
    const previousEvent = element.action?.event || "click";
    const primary =
      normalized.shift() || { type: "none", event: previousEvent };
    element.action = {
      ...primary,
      handlers: normalized,
    };
    renderEventHandlers(element.action);
    renderPreview(false);
  }
  scheduleSave();
}


function deleteWorkflowAction(index, appLoad, globalActionId = "") {
  const actions = appLoad
    ? state.settings.appLoadHandlers.map((handler) => ({ ...handler }))
    : globalActionId
      ? (state.settings.globalActions || [])
        .find((candidate) => candidate.id === globalActionId)
        ?.actions.map((handler) => ({ ...handler })) || []
      : (() => {
        const element = state.elements.find(
          (candidate) => candidate.id === state.selectedId,
        );
        if (!element) return [];
        return [
          { ...(element.action || { event: "click", type: "none" }) },
          ...(element.action?.handlers || []).map((handler) => ({ ...handler })),
        ];
      })();
  if (!Number.isInteger(index) || index < 0 || index >= actions.length) return;
  actions.splice(index, 1);
  if (!appLoad && !globalActionId && !actions.length) {
    const element = state.elements.find(
      (candidate) => candidate.id === state.selectedId,
    );
    actions.push({
      event: element?.action?.event || "click",
      type: "none",
    });
  }
  writeWorkflowActions(actions, appLoad, globalActionId);
}

const workflowActionOptions = createWorkflowActionOptions({ state, TWK_FIELDS });
const workflowConditionEditor = createWorkflowConditionEditor({
  state,
  editorLanguage,
  localize,
  TWK_FIELDS, typeNames, variantLabels, twkSystemActionOptions, variableSourceTypes, toast,
  getElementName, getChangePropertyOptions, getActionValueType, getVariantOptions,
  populateValueSourceOptions, isInsideCollection, normalizeExtraData, createElement,
  getElementSourcePropertyOptions, isJavaScriptAsset, getConditionActionLists,
  isWorkflowBranchAction, showToast,
});
const workflowActionEditor = createWorkflowActionEditor({
  state, editorLanguage, localize, variantLabels, twkSystemActionOptions, twkPermissionActionTypes, toast,
  getElementName, getChangePropertyOptions, normalizeChangePropertyAction, getVariantOptions,
  getPluginEvents: (element) => getPluginForElement(element)?.events || [],
  isWorkflowBranchAction, normalizeAppLoadHandlers, createId, isInsideCollection, createElement,
  escapeHtml, isJavaScriptAsset, clampNumber, ensureWorkflowActionIds, getWorkflowGraphLayout,
  getWorkflowEditorState, serializeWorkflowGraph, createWorkflowEdge, saveWorkflowGraphLayout,
  renderWorkflowEdges, getWorkflowTokenOptions, attachTokenPicker, renderWorkflowMinimap,
  attachWorkflowCanvasInteractions, writeWorkflowActions, deleteWorkflowAction,
  renderConditionOptions: workflowConditionEditor.renderConditionOptions,
  renderTwkOptions: workflowActionOptions.renderTwkOptions,
  renderEndpointOptions: workflowActionOptions.renderEndpointOptions,
  renderVariableOptions: workflowActionOptions.renderVariableOptions, showToast,
});
const { renderEventHandlers, moveEventHandler } = workflowActionEditor;
const { conditionActionPathValue, parseConditionActionPath, getConditionActionAtPath, getConditionOwnerForField, renderConditionOptions } = workflowConditionEditor;
const { renderTwkOptions, renderEndpointOptions, renderVariableOptions } = workflowActionOptions;

function selectedVariable() {
  return (
    state.variables.find(
      (variable) => variable.id === state.selectedVariableId,
    ) || null
  );
}

function renderVariableList() {
  const list = document.querySelector("#variable-list");
  list.replaceChildren();
  state.variables.forEach((variable) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `request-item${variable.id === state.selectedVariableId ? " active" : ""}`;
    button.dataset.variableId = variable.id;
    const name = document.createElement("strong");
    name.textContent = variable.name;
    const source = document.createElement("span");
    source.textContent = {
      static: localize.StaticValue[editorLanguage],
      form: localize.FormFieldAlternativeA[editorLanguage],
      twk: localize.TawakkalnaData[editorLanguage],
      endpoint: localize.APIResponse[editorLanguage],
      variable: localize.SavedVariable[editorLanguage],
      item: localize.ListItemField[editorLanguage],
      extra: localize.AdditionalData[editorLanguage],
      element: localize.ElementProperty[editorLanguage],
    }[variable.source];
    button.append(name, source);
    list.append(button);
  });
}

function renderVariableForm() {
  const variable = selectedVariable();
  renderVariableList();
  document.querySelector("#variable-empty").hidden = Boolean(variable);
  document.querySelector("#variable-form").hidden = !variable;
  document.querySelector("#delete-variable").disabled = !variable;
  if (!variable) return;

  const formSelect = document.querySelector("#variable-form-field");
  populateFormFieldSelect(
    formSelect,
    state.currentPageId,
    variable.fieldName,
  );

  const twkSelect = document.querySelector("#variable-twk-field");
  twkSelect.replaceChildren(
    ...TWK_FIELDS.map((field) => {
      const option = document.createElement("option");
      option.value = field.key;
      option.textContent = `${field.label} (${field.key})`;
      return option;
    }),
  );
  twkSelect.value = TWK_FIELDS.some((field) => field.key === variable.fieldKey)
    ? variable.fieldKey
    : TWK_FIELDS[0].key;

  const requestSelect = document.querySelector("#variable-endpoint");
  requestSelect.replaceChildren(
    ...state.requests.map((request) => {
      const option = document.createElement("option");
      option.value = request.id;
      option.textContent = request.name || localize.UnnamedRequest[editorLanguage];
      return option;
    }),
  );
  if (!state.requests.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = localize.AddAnAPIRequestFirst[editorLanguage];
    requestSelect.append(option);
  }
  requestSelect.value = state.requests.some(
    (request) => request.id === variable.requestId,
  )
    ? variable.requestId
    : state.requests[0]?.id || "";
  requestSelect.disabled = !state.requests.length;

  const variableSourceSelect = document.querySelector(
    "#variable-variable-source",
  );
  variableSourceSelect.replaceChildren(
    ...state.variables
      .filter((candidate) => candidate.id !== variable.id)
      .map((candidate) => new Option(candidate.name, candidate.id)),
  );
  if (!variableSourceSelect.options.length)
    variableSourceSelect.add(
      new Option(localize.AddAnotherVariableFirst[editorLanguage], ""),
    );
  variableSourceSelect.value =
    variable.source === "variable" ? variable.path || "" : "";
  variableSourceSelect.disabled =
    !variableSourceSelect.options.length ||
    !state.variables.some((candidate) => candidate.id !== variable.id);

  const extraSelect = document.querySelector("#variable-extra-source");
  extraSelect.replaceChildren(
    ...state.elements.flatMap((element) =>
      normalizeExtraData(element.extraData).map(
        (extra) =>
          new Option(
            `${getElementName(element)} · ${extra.key}`,
            `${element.id}.extra.${extra.key}`,
          ),
      ),
    ),
  );
  if (!extraSelect.options.length)
    extraSelect.add(new Option(localize.AddAdditionalInfoFirst[editorLanguage], ""));
  extraSelect.value = variable.source === "extra" ? variable.path || "" : "";

  const elementSelect = document.querySelector("#variable-element-source");
  elementSelect.replaceChildren(
    ...state.elements.map(
      (element) =>
        new Option(
          `${typeNames[element.type]} · ${getElementName(element)}`,
          element.id,
        ),
    ),
  );
  elementSelect.value =
    variable.elementId || elementSelect.options[0]?.value || "";
  const elementSource = state.elements.find(
    (element) => element.id === elementSelect.value,
  );
  const elementPropertySelect = document.querySelector(
    "#variable-element-property",
  );
  elementPropertySelect.replaceChildren(
    ...(elementSource
      ? getElementSourcePropertyOptions(elementSource).map(
        ([label, value]) => new Option(label, value),
      )
      : []),
  );
  elementPropertySelect.value =
    variable.property || elementPropertySelect.options[0]?.value || "";

  document.querySelector("#variable-name").value = variable.name;
  populateValueSourceOptions(document.querySelector("#variable-source"), false);
  document.querySelector("#variable-source").value = variable.source;
  document.querySelector("#variable-static-value").value = JSON.stringify(
    variable.value,
    null,
    2,
  );
  document.querySelector("#variable-endpoint-path").value = variable.path || "";
  document.querySelector("#variable-item-path").value =
    variable.source === "item" ? variable.path || "" : "";
  document.querySelector("#variable-property-path").value =
    variable.propertyPath || "";
  updateVariableSourceFields(variable.source);
}

function updateVariableSourceFields(source) {
  document.querySelector("#variable-static-fields").hidden =
    source !== "static";
  document.querySelector("#variable-form-fields").hidden = source !== "form";
  document.querySelector("#variable-twk-fields").hidden = source !== "twk";
  document.querySelector("#variable-endpoint-fields").hidden =
    source !== "endpoint";
  document.querySelector("#variable-item-fields").hidden = source !== "item";
  document.querySelector("#variable-extra-fields").hidden = source !== "extra";
  document.querySelector("#variable-element-fields").hidden =
    source !== "element";
  document.querySelector("#variable-variable-fields").hidden =
    source !== "variable";
  if (source === "form") {
    populateFormFieldSelect(
      document.querySelector("#variable-form-field"),
      state.currentPageId,
      selectedVariable()?.fieldName || "",
    );
  }
  updateVariablePropertyPathVisibility();
}

function addVariable() {
  const variable = {
    id: createId(),
    name: `variable_${state.variables.length + 1}`,
    source: "static",
    value: "",
    propertyPath: "",
    fieldName: "",
    fieldKey: TWK_FIELDS[0].key,
    requestId: state.requests[0]?.id || "",
    path: "",
    elementId: state.elements[0]?.id || "",
    property: "content",
  };
  state.variables.push(variable);
  state.selectedVariableId = variable.id;
  renderVariableForm();
  document.querySelector("#variable-name").focus();
  document.querySelector("#variable-name").select();
}

function replaceVariableReferences(oldName, newName) {
  if (oldName === newName) return;
  const token = new RegExp(`\\{\\{\\s*var\\.${oldName}\\s*\\}\\}`, "g");
  const replacement = `{{var.${newName}}}`;
  const replace = (value) =>
    typeof value === "string" ? value.replace(token, replacement) : value;
  const replaceNestedValues = (value) => {
    if (typeof value === "string") return replace(value);
    if (Array.isArray(value)) return value.map(replaceNestedValues);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          key === "variableName" && child === oldName
            ? newName
            : replaceNestedValues(child),
        ]),
      );
    return value;
  };
  state.elements.forEach((element) => {
    element.content = replace(element.content);
    element.localizations = Object.fromEntries(
      Object.entries(normalizeLocalizedContent(element.localizations)).map(
        ([language, content]) => [language, replace(content)],
      ),
    );
    if (element.action) element.action.values = replace(element.action.values);
  });
  state.requests.forEach((request) => {
    request.url = replace(request.url);
    request.headers = replace(request.headers);
    request.body = replace(request.body);
  });
  state.settings.appLoadHandlers = replaceNestedValues(
    state.settings.appLoadHandlers,
  );
}

function saveVariable() {
  const variable = selectedVariable();
  if (!variable) return;
  const name = document.querySelector("#variable-name").value.trim();
  const source = document.querySelector("#variable-source").value;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    showToast(localize.invalidvariablenameenglish[editorLanguage]);
    return;
  }
  if (
    state.variables.some(
      (item) => item.id !== variable.id && item.name === name,
    )
  ) {
    showToast(localize.AnotherVariableAlreadyUsesThisName[editorLanguage]);
    return;
  }
  if (!variableSourceTypes.includes(source)) {
    showToast(localize.InvalidVariableSource[editorLanguage]);
    return;
  }

  let value = variable.value;
  if (source === "static") {
    try {
      value = JSON.parse(
        document.querySelector("#variable-static-value").value,
      );
    } catch {
      showToast(localize.EnterValidVariableJSONValue[editorLanguage]);
      return;
    }
  }
  const fieldName = document.querySelector("#variable-form-field").value;
  const fieldKey = document.querySelector("#variable-twk-field").value;
  const requestId = document.querySelector("#variable-endpoint").value;
  const variableSourceId = document.querySelector(
    "#variable-variable-source",
  ).value;
  const extraPath = document.querySelector("#variable-extra-source").value;
  const elementId = document.querySelector("#variable-element-source").value;
  const property = document.querySelector("#variable-element-property").value;
  const itemPath = document.querySelector("#variable-item-path").value.trim();
  const propertyPath = document
    .querySelector("#variable-property-path")
    .value.trim();
  if (
    source === "form" &&
    !getPageFormFields(state.currentPageId).some(
      (element) => getFormName(element) === fieldName,
    )
  ) {
    showToast(localize.AddAPageFieldToUseAsASource[editorLanguage]);
    return;
  }
  if (source === "twk" && !TWK_FIELDS.some((field) => field.key === fieldKey)) {
    showToast(localize.ChooseAValidTawakkalnaDataField[editorLanguage]);
    return;
  }
  if (
    source === "endpoint" &&
    !state.requests.some((item) => item.id === requestId)
  ) {
    showToast(localize.AddValidAPIRequestForResponseSource[editorLanguage]);
    return;
  }
  if (
    source === "variable" &&
    !state.variables.some(
      (item) => item.id === variableSourceId && item.id !== variable.id,
    )
  ) {
    showToast(localize.ChooseValidSourceVariable[editorLanguage]);
    return;
  }
  if (source === "extra" && !extraPath) {
    showToast(localize.ChooseValidAdditionalData[editorLanguage]);
    return;
  }
  if (source === "item" && !itemPath) {
    showToast(localize.EnterListItemFieldPath[editorLanguage]);
    return;
  }
  if (
    source === "element" &&
    (!state.elements.some((item) => item.id === elementId) || !property)
  ) {
    showToast(localize.ChooseValidElementAndProperty[editorLanguage]);
    return;
  }

  replaceVariableReferences(variable.name, name);
  Object.assign(variable, {
    name,
    source,
    value,
    fieldName,
    fieldKey,
    requestId,
    path:
      source === "endpoint"
        ? document.querySelector("#variable-endpoint-path").value.trim()
        : source === "variable"
          ? variableSourceId
          : source === "extra"
            ? extraPath
            : source === "item"
              ? itemPath
              : "",
    elementId,
    property,
    propertyPath,
  });
  renderVariableForm();
  renderProperties();
  renderPreview(false);
  scheduleSave();
  showToast(
    localize.VariableSaved[editorLanguage].replace("{name}", () => name),
  );
}

function updateColorLabels() {
  document.querySelector("#color-value").textContent = document
    .querySelector("#property-color")
    .value.toUpperCase();
  document.querySelector("#background-value").textContent =
    document.querySelector("#property-background-transparent").checked
      ? localize.Ghost[editorLanguage]
      : document.querySelector("#property-background").value.toUpperCase();
}

function focusSelectedPreviewElement(id) {
  cancelAnimationFrame(previewFocusFrame);
  previewFocusFrame = requestAnimationFrame(() => {
    previewFocusFrame = null;
    const node = preview.querySelector(
      `.preview-content[data-id="${CSS.escape(id)}"]`,
    );
    if (!node) return;
    node.focus({ preventScroll: true });
    let targetRect = node.getBoundingClientRect();
    let ancestor = node.parentElement;
    while (ancestor) {
      const isDocumentScroller = ancestor === document.scrollingElement;
      const style = getComputedStyle(ancestor);
      const canScrollY =
        (isDocumentScroller || ["auto", "scroll"].includes(style.overflowY)) &&
        ancestor.scrollHeight >
        (isDocumentScroller ? innerHeight : ancestor.clientHeight);
      const canScrollX =
        (isDocumentScroller || ["auto", "scroll"].includes(style.overflowX)) &&
        ancestor.scrollWidth >
        (isDocumentScroller ? innerWidth : ancestor.clientWidth);
      if (canScrollY || canScrollX) {
        const bounds = isDocumentScroller
          ? { top: 0, bottom: innerHeight, left: 0, right: innerWidth }
          : ancestor.getBoundingClientRect();
        let top = ancestor.scrollTop;
        let left = ancestor.scrollLeft;
        if (canScrollY && targetRect.top < bounds.top)
          top -= bounds.top - targetRect.top;
        else if (canScrollY && targetRect.bottom > bounds.bottom)
          top += targetRect.bottom - bounds.bottom;
        if (canScrollX && targetRect.left < bounds.left)
          left -= bounds.left - targetRect.left;
        else if (canScrollX && targetRect.right > bounds.right)
          left += targetRect.right - bounds.right;
        if (top !== ancestor.scrollTop || left !== ancestor.scrollLeft) {
          ancestor.scrollTo({ top, left, behavior: "instant" });
          targetRect = node.getBoundingClientRect();
        }
      }
      if (isDocumentScroller) break;
      ancestor = ancestor.parentElement;
    }
  });
}

function setElementSelection(ids, primaryId = ids[ids.length - 1] || null) {
  const validIds = ids.filter((id) =>
    state.elements.some(
      (element) =>
        element.id === id &&
        element.pageId === state.currentPageId &&
        (!state.editingSavedComponentInstanceId ||
          element.savedComponentInstanceId ===
          state.editingSavedComponentInstanceId),
    ),
  );
  state.selectedIds = [...new Set(validIds)];
  state.selectedId = state.selectedIds.includes(primaryId)
    ? primaryId
    : state.selectedIds[state.selectedIds.length - 1] || null;
}

function clearElementSelection() {
  if (state.editingSavedComponentInstanceId) {
    const componentRoot = state.elements.find(
      (element) =>
        element.savedComponentInstanceId ===
        state.editingSavedComponentInstanceId &&
        !state.elements.some(
          (candidate) =>
            candidate.savedComponentInstanceId ===
            state.editingSavedComponentInstanceId &&
            candidate.id === element.parentId,
        ),
    );
    if (componentRoot) {
      setElementSelection([componentRoot.id], componentRoot.id);
      return;
    }
  }
  state.selectedId = null;
  state.selectedIds = [];
}

function selectAllElements() {
  const ids = state.elements
    .filter(
      (element) =>
        element.pageId === state.currentPageId &&
        !element.hidden &&
        element.type !== "sheet",
    )
    .map((element) => element.id);
  setElementSelection(ids);
  renderPreview();
}

function selectElement(id, focusPreviewElement = true, additive = false) {
  if (!focusPreviewElement) {
    cancelAnimationFrame(previewFocusFrame);
    previewFocusFrame = null;
  }
  const selected = state.elements.find((element) => element.id === id);
  if (
    state.editingSavedComponentInstanceId &&
    selected?.savedComponentInstanceId !==
    state.editingSavedComponentInstanceId
  )
    return;
  let treeAncestor = selected;
  while (treeAncestor?.parentId) {
    collapsedTreeElements.delete(treeAncestor.parentId);
    treeAncestor = state.elements.find(
      (candidate) => candidate.id === treeAncestor.parentId,
    );
  }
  let ancestor = selected;
  while (ancestor && ancestor.type !== "sheet")
    ancestor = state.elements.find(
      (candidate) => candidate.id === ancestor.parentId,
    );
  state.previewSheetId = ancestor?.id || null;
  if (additive) {
    const selectedIds = state.selectedIds.includes(id)
      ? state.selectedIds.filter((selectedId) => selectedId !== id)
      : [...state.selectedIds, id];
    setElementSelection(
      selectedIds,
      selectedIds.includes(state.selectedId) ? state.selectedId : id,
    );
  } else {
    setElementSelection([id], id);
  }
  renderPreview();
  if (focusPreviewElement && state.selectedIds.includes(id))
    focusSelectedPreviewElement(id);
}

function addElement(
  type,
  beforeId = null,
  parentId = null,
  customComponentId = "",
) {
  const resetContainerChildSpacing = (child) => {
    [
      "padding",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "margin",
      "marginTop",
      "marginRight",
      "marginBottom",
      "marginLeft",
    ].forEach((property) => {
      child.styles[property] = 0;
    });
  };
  const element = createElement(type);
  if (type === "custom") {
    element.customComponentId = customComponentId;
    const component = state.userComponents.find(
      (item) => item.id === customComponentId,
    );
    const plugin = component ? getPluginDefinition(component) : null;
    if (plugin)
      element.pluginProperties = normalizePluginProperties(plugin, {});
  }
  if (type === "sheet") {
    parentId = null;
  } else if (beforeId) {
    const beforeElement = state.elements.find((item) => item.id === beforeId);
    if (!parentId && beforeElement) parentId = beforeElement.parentId || null;
  } else if (!parentId) {
    const selected = state.elements.find(
      (item) => item.id === state.selectedId,
    );
    if (selected?.type === "tabs" && type !== "tab")
      parentId = selected.activeTabId || null;
    else if (type === "tab") {
      let ancestor = selected;
      while (ancestor && ancestor.type !== "tabs")
        ancestor = state.elements.find((item) => item.id === ancestor.parentId);
      if (ancestor) parentId = ancestor.id;
      else if (isContainer(selected)) parentId = selected.id;
      else if (selected?.parentId) parentId = selected.parentId;
    } else if (isContainer(selected)) parentId = selected.id;
    else if (selected?.parentId) parentId = selected.parentId;
  }
  if (!parentId && !beforeId && type !== "sheet")
    parentId = getSingleRootContainer()?.id || null;
  element.parentId = parentId;
  const componentParent = state.elements.find(
    (candidate) => candidate.id === parentId,
  );
  if (
    state.editingSavedComponentInstanceId &&
    componentParent?.savedComponentInstanceId !==
    state.editingSavedComponentInstanceId
  ) {
    showToast(localize.choosecontainerinsidecomponen[editorLanguage]);
    return;
  }
  if (
    state.editingSavedComponentInstanceId &&
    componentParent?.savedComponentInstanceId ===
    state.editingSavedComponentInstanceId
  ) {
    element.savedComponentId = componentParent.savedComponentId;
    element.savedComponentInstanceId =
      componentParent.savedComponentInstanceId;
  }
  if (parentId) resetContainerChildSpacing(element);
  if (state.elements.find((item) => item.id === parentId)?.type === "card") {
    element.cardSlot = "content";
  }
  const index = beforeId
    ? state.elements.findIndex((item) => item.id === beforeId)
    : -1;
  if (index === -1) state.elements.push(element);
  else state.elements.splice(index, 0, element);
  if (type === "tabs") {
    const firstTab = createElement("tab");
    firstTab.parentId = element.id;
    if (element.savedComponentInstanceId) {
      firstTab.savedComponentId = element.savedComponentId;
      firstTab.savedComponentInstanceId = element.savedComponentInstanceId;
    }
    resetContainerChildSpacing(firstTab);
    element.activeTabId = firstTab.id;
    state.elements.push(firstTab);
  } else if (type === "tab" && parentId) {
    const parent = state.elements.find((item) => item.id === parentId);
    if (parent?.type === "tabs") parent.activeTabId = element.id;
  }
  pruneElementAttributes(state.elements);
  setElementSelection([element.id], element.id);
  let parent = state.elements.find((item) => item.id === element.parentId);
  while (parent && parent.type !== "sheet")
    parent = state.elements.find((item) => item.id === parent.parentId);
  state.previewSheetId =
    element.type === "sheet" ? element.id : parent?.id || null;
  renderPreview();
  focusSelectedPreviewElement(element.id);
  scheduleSave();
}

function deleteSelected() {
  const selectedIds =
    state.selectedIds.filter((id) =>
      state.elements.some(
        (element) => element.id === id && element.pageId === state.currentPageId,
      ),
    );
  if (
    !selectedIds.length &&
    state.selectedId &&
    state.elements.some(
      (element) =>
        element.id === state.selectedId &&
        element.pageId === state.currentPageId,
    )
  )
    selectedIds.push(state.selectedId);
  const rootIds = getSelectedElementRoots(selectedIds);
  if (!rootIds.length) return;
  if (state.editingSavedComponentInstanceId) {
    const instanceElements = state.elements.filter(
      (element) =>
        element.savedComponentInstanceId ===
        state.editingSavedComponentInstanceId,
    );
    if (
      rootIds.some((id) => {
        const selectedRoot = instanceElements.find(
          (element) => element.id === id,
        );
        return (
          !selectedRoot ||
          !instanceElements.some(
            (element) => element.id === selectedRoot.parentId,
          )
        );
      })
    ) {
      showToast(localize.componentrootcannotdeleted[editorLanguage]);
      return;
    }
  }
  const deletedIds = getElementSubtreeIds(rootIds);
  state.elements = state.elements.filter(
    (element) => !deletedIds.has(element.id),
  );
  state.elements
    .filter((element) => element.type === "tabs")
    .forEach((tabs) => {
      const tabChildren = state.elements.filter(
        (element) =>
          element.parentId === tabs.id &&
          element.pageId === tabs.pageId &&
          element.type === "tab" &&
          !element.hidden,
      );
      if (!tabChildren.some((tab) => tab.id === tabs.activeTabId))
        tabs.activeTabId = tabChildren[0]?.id || "";
    });
  clearOrphanedItemBindings();
  clearElementSelection();
  renderPreview();
  scheduleSave();
}

function duplicateSelected() {
  const index = state.elements.findIndex(
    (element) => element.id === state.selectedId,
  );
  if (index === -1) return;

  const selected = state.elements[index];
  const subtree = getOrderedElementSubtree([selected.id]);

  const ids = new Map(subtree.map((element) => [element.id, createId()]));

  const copies = subtree.map((element) => {
    const copy = remapCopiedElementReferences(
      structuredClone(element),
      ids,
    );
    copy.id = ids.get(element.id);
    copy.parentId = ids.get(element.parentId) || element.parentId || null;
    if (copy.savedComponentInstanceId) {
      delete copy.savedComponentElementId;
    }
    if (element.id === selected.id && copy.content)
      copy.content = `${copy.content} (نسخة)`;
    return copy;
  });

  const lastIndex = Math.max(
    ...subtree.map((element) =>
      state.elements.findIndex((item) => item.id === element.id),
    ),
  );

  state.elements.splice(lastIndex + 1, 0, ...copies);
  pruneElementAttributes(state.elements);
  setElementSelection([ids.get(selected.id)], ids.get(selected.id));

  renderPreview();
  focusSelectedPreviewElement(state.selectedId);
  scheduleSave();
}

function getSelectedElementRoots(selectedIds) {
  const selected = new Set(selectedIds);
  return selectedIds.filter((id) => {
    let element = state.elements.find((candidate) => candidate.id === id);
    while (element?.parentId) {
      if (selected.has(element.parentId)) return false;
      element = state.elements.find(
        (candidate) => candidate.id === element.parentId,
      );
    }
    return true;
  });
}

function getElementSubtreeIds(rootIds) {
  const subtreeIds = new Set();
  const visit = (id) => {
    if (subtreeIds.has(id)) return;
    subtreeIds.add(id);
    state.elements
      .filter((element) => element.parentId === id)
      .forEach((element) => visit(element.id));
  };
  rootIds.forEach(visit);
  return subtreeIds;
}

function getOrderedElementSubtree(rootIds) {
  const rootSet = new Set(rootIds);
  const pending = state.elements.filter((element) => rootSet.has(element.id));
  const subtree = [];
  const visited = new Set();
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const element = pending[cursor];
    if (visited.has(element.id)) continue;
    visited.add(element.id);
    subtree.push(element);
    if (isContainer(element))
      pending.push(
        ...state.elements.filter(
          (candidate) => candidate.parentId === element.id,
        ),
      );
  }
  return subtree;
}

function copySelectedElements(showFeedback = true) {
  const selectedIds = state.selectedIds.length
    ? state.selectedIds
    : state.selectedId
      ? [state.selectedId]
      : [];
  const rootIds = getSelectedElementRoots(selectedIds);
  if (!rootIds.length) return false;
  state.clipboardElements = structuredClone(
    getOrderedElementSubtree(rootIds),
  );
  state.clipboardRootIds = rootIds;
  updateHistoryControls();
  if (showFeedback) showToast(localize.ElementsCopied[editorLanguage]);
  return true;
}

function remapCopiedElementReferences(value, idMap, key = "") {
  if (Array.isArray(value))
    return value.map((item) => remapCopiedElementReferences(item, idMap));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        remapCopiedElementReferences(child, idMap, childKey),
      ]),
    );
  }
  if (typeof value !== "string") return value;
  if (
    [
      "activeTabId",
      "elementId",
      "parentId",
      "sheetId",
      "targetElementId",
      "toastId",
    ].includes(key) &&
    idMap.has(value)
  )
    return idMap.get(value);
  return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (token, reference) => {
    const extra = reference.match(/^(.+)\.extra\.([A-Za-z_][A-Za-z0-9_-]*)$/);
    return extra && idMap.has(extra[1])
      ? token.replace(reference, `${idMap.get(extra[1])}.extra.${extra[2]}`)
      : token;
  });
}

function pasteCopiedElements(showFeedback = true) {
  if (!state.clipboardRootIds.length || !state.clipboardElements.length)
    return false;
  if (
    state.editingSavedComponentInstanceId &&
    state.clipboardElements.some(
      (element) =>
        element.savedComponentInstanceId !==
        state.editingSavedComponentInstanceId,
    )
  ) {
    showToast(localize.CopyOnlyComponentElementsWhileEditing[editorLanguage]);
    return false;
  }
  const idMap = new Map(
    state.clipboardElements.map((element) => [element.id, createId()]),
  );
  const copies = state.clipboardElements.map((source) => {
    const copy = remapCopiedElementReferences(structuredClone(source), idMap);
    copy.id = idMap.get(source.id);
    copy.pageId = state.currentPageId;
    if (state.editingSavedComponentInstanceId) {
      delete copy.savedComponentElementId;
    } else {
      delete copy.savedComponentId;
      delete copy.savedComponentInstanceId;
      delete copy.savedComponentElementId;
    }
    if (source.parentId && !idMap.has(source.parentId)) {
      const parent = state.elements.find(
        (element) =>
          element.id === source.parentId &&
          element.pageId === state.currentPageId,
      );
      if (!parent) copy.parentId = null;
    }
    return copy;
  });
  const clipboardIds = new Set(
    state.clipboardElements.map((element) => element.id),
  );
  const sourceIndexes = state.elements
    .map((element, index) =>
      clipboardIds.has(element.id) && element.pageId === state.currentPageId
        ? index
        : -1,
    )
    .filter((index) => index >= 0);
  const insertAt =
    sourceIndexes.length === state.clipboardElements.length
      ? Math.max(...sourceIndexes) + 1
      : state.elements.length;
  state.elements.splice(insertAt, 0, ...copies);
  clearOrphanedItemBindings();
  const pastedRootIds = state.clipboardRootIds.map((id) => idMap.get(id));
  setElementSelection(pastedRootIds, pastedRootIds[pastedRootIds.length - 1]);
  renderPreview();
  if (state.selectedId) focusSelectedPreviewElement(state.selectedId);
  scheduleSave();
  if (showFeedback) showToast(localize.ElementsPasted[editorLanguage]);
  return true;
}

function moveElement(
  draggedId,
  targetId,
  placeAfter,
  parentId = null,
  dropIntoContainer = true,
) {
  if (draggedId === targetId) return;
  const draggedIndex = state.elements.findIndex(
    (element) => element.id === draggedId,
  );
  if (draggedIndex === -1) return;
  const dragged = state.elements[draggedIndex];
  const target = state.elements.find((element) => element.id === targetId);
  if (targetId && !target) return;
  if (isContainer(target) && dropIntoContainer) parentId = target.id;
  else parentId = targetId ? target.parentId || null : null;
  if (
    state.editingSavedComponentInstanceId &&
    (dragged.savedComponentInstanceId !==
      state.editingSavedComponentInstanceId ||
      state.elements.find((element) => element.id === parentId)
        ?.savedComponentInstanceId !==
      state.editingSavedComponentInstanceId)
  )
    return;
  let ancestor = state.elements.find((element) => element.id === parentId);
  while (ancestor) {
    if (ancestor.id === draggedId) return;
    ancestor = state.elements.find(
      (element) => element.id === ancestor.parentId,
    );
  }
  if (isContainer(target) && dropIntoContainer) {
    dragged.parentId = parentId;
    clearOrphanedItemBindings();
    renderPreview();
    scheduleSave();
    return;
  }
  const [moved] = state.elements.splice(draggedIndex, 1);
  moved.parentId = parentId;
  if (!targetId) {
    state.elements.push(moved);
    clearOrphanedItemBindings();
    renderPreview();
    scheduleSave();
    return;
  }
  const adjustedTargetIndex = state.elements.findIndex(
    (element) => element.id === targetId,
  );
  state.elements.splice(adjustedTargetIndex + (placeAfter ? 1 : 0), 0, moved);
  clearOrphanedItemBindings();
  renderPreview();
  scheduleSave();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("visible"), 2300);
}

function renderCustomComponents() {
  const list = document.querySelector("#custom-component-list");
  list.replaceChildren();
  state.components.forEach((component) => {
    const row = document.createElement("div");
    row.className = "saved-component";
    const use = document.createElement("button");
    use.className = "saved-component-use";
    use.type = "button";
    use.dataset.insertComponent = component.id;
    use.textContent = component.name;
    const remove = document.createElement("button");
    remove.className = "saved-component-delete";
    remove.type = "button";
    remove.dataset.deleteComponent = component.id;
    remove.setAttribute(
      "aria-label",
      formatEditorMessage(localize.DeleteComponentNamed[editorLanguage], {
        name: component.name,
      }),
    );
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-xmark";
    icon.setAttribute("aria-hidden", "true");
    remove.append(icon);
    row.append(use, remove);
    list.append(row);
  });
  const userList = document.querySelector("#user-component-list");
  userList.replaceChildren();
  state.userComponents.filter((component) => !component.plugin).forEach((component) => {
    const row = document.createElement("div");
    row.className = "saved-component";
    const use = document.createElement("button");
    use.className = "saved-component-use";
    use.type = "button";
    use.dataset.insertUserComponent = component.id;
    use.textContent = component.name;
    const edit = document.createElement("button");
    edit.className = "saved-component-delete saved-component-edit";
    edit.type = "button";
    edit.dataset.editUserComponent = component.id;
    edit.setAttribute(
      "aria-label",
      formatEditorMessage(localize.EditComponentNamed[editorLanguage], {
        name: component.name,
      }),
    );
    edit.innerHTML = '<i class="fa-solid fa-pen" aria-hidden="true"></i>';
    const remove = document.createElement("button");
    remove.className = "saved-component-delete";
    remove.type = "button";
    remove.dataset.deleteUserComponent = component.id;
    remove.setAttribute(
      "aria-label",
      formatEditorMessage(localize.DeleteComponentNamed[editorLanguage], {
        name: component.name,
      }),
    );
    remove.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    row.append(use, edit, remove);
    userList.append(row);
  });
  renderPluginElements();
}

function getPluginIdsInUse() {
  const pluginIds = new Set(
    state.userComponents
      .filter((component) => getPluginDefinition(component))
      .map((component) => component.id),
  );
  const elements = [
    ...state.elements,
    ...state.components.flatMap((component) => component.elements || []),
  ];
  return new Set(
    elements
      .filter(
        (element) =>
          element.type === "custom" &&
          pluginIds.has(element.customComponentId),
      )
      .map((element) => element.customComponentId),
  );
}

function synchronizeSelectedPluginIds() {
  const availableIds = new Set(
    state.userComponents
      .filter((component) => getPluginDefinition(component))
      .map((component) => component.id),
  );
  const selectedIds = new Set(
    Array.isArray(state.settings.selectedPluginIds)
      ? state.settings.selectedPluginIds.filter((id) => availableIds.has(id))
      : [],
  );
  getPluginIdsInUse().forEach((id) => selectedIds.add(id));
  state.settings.selectedPluginIds = [...selectedIds];
}

function renderPluginPicker() {
  const list = document.querySelector("#plugin-picker-list");
  const empty = document.querySelector("#plugin-picker-empty");
  const intro = document.querySelector("#plugin-picker-intro");
  list.replaceChildren();
  const plugins = state.userComponents
    .map((component) => ({
      component,
      plugin: getPluginDefinition(component),
    }))
    .filter(({ plugin }) => plugin);
  const selectedIds = new Set(state.settings.selectedPluginIds || []);
  const inUseIds = getPluginIdsInUse();
  intro.textContent = localize.PluginPickerIntroduction[editorLanguage];
  empty.hidden = plugins.length > 0;
  empty.textContent = localize.NoPluginsAvailable[editorLanguage];

  plugins.forEach(({ component, plugin }) => {
    const localizedPlugin = localizePluginDefinition(plugin, editorLanguage);
    const label = document.createElement("label");
    label.className = "plugin-picker-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.pluginSelection = component.id;
    checkbox.checked = selectedIds.has(component.id) || inUseIds.has(component.id);
    checkbox.disabled = inUseIds.has(component.id);
    if (checkbox.disabled) label.classList.add("is-required");
    const text = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = localizedPlugin.title;
    const description = document.createElement("small");
    description.textContent =
      localizedPlugin.description || localizedPlugin.group;
    text.append(title, description);
    label.append(checkbox, text);
    list.append(label);
  });
}

function updatePluginSelection(pluginId, selected) {
  if (!selected && getPluginIdsInUse().has(pluginId)) return;
  const selectedIds = new Set(state.settings.selectedPluginIds || []);
  if (selected) selectedIds.add(pluginId);
  else selectedIds.delete(pluginId);
  state.settings.selectedPluginIds = [...selectedIds];
  renderPluginElements();
  scheduleSave();
}

function renderPluginElements() {
  const container = document.querySelector("#plugin-categories");
  container.replaceChildren();
  const groups = new Map();
  const selectedIds = new Set(state.settings.selectedPluginIds || []);
  const inUseIds = getPluginIdsInUse();
  state.userComponents.forEach((component) => {
    const plugin = getPluginDefinition(component);
    if (
      !plugin ||
      (!selectedIds.has(component.id) && !inUseIds.has(component.id))
    )
      return;
    const localizedPlugin = localizePluginDefinition(plugin, editorLanguage);
    if (!groups.has(localizedPlugin.group))
      groups.set(localizedPlugin.group, []);
    groups.get(localizedPlugin.group).push({
      component,
      plugin: localizedPlugin,
    });
  });

  groups.forEach((items, group) => {
    const category = document.createElement("details");
    category.className = "element-category plugin-category";
    const summary = document.createElement("summary");
    summary.className = "eyebrow";
    summary.textContent = group;
    category.append(summary);
    items.forEach(({ component, plugin }) => {
      const row = document.createElement("div");
      row.className = "plugin-element-row";
      const button = document.createElement("button");
      button.className = "element-card";
      button.type = "button";
      button.draggable = true;
      button.dataset.type = "custom";
      button.dataset.pluginId = component.id;
      button.title = plugin.description;
      const icon = document.createElement("span");
      icon.className = "element-icon icon-card";
      icon.setAttribute("aria-hidden", "true");
      const iconGlyph = document.createElement("i");
      iconGlyph.className = `fa-solid ${plugin.icon}`;
      icon.append(iconGlyph);
      const text = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = plugin.title;
      const description = document.createElement("small");
      description.textContent = plugin.description;
      text.append(title, description);
      const add = document.createElement("span");
      add.className = "add-symbol";
      add.setAttribute("aria-hidden", "true");
      add.textContent = "+";
      button.append(icon, text, add);
      row.append(button);
      if (!bundledPluginIds.has(component.id)) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "plugin-remove-button";
        remove.dataset.removePlugin = component.id;
        remove.setAttribute(
          "aria-label",
          `${localize.RemovePlugin[editorLanguage]} ${plugin.title}`,
        );
        remove.title = localize.RemovePlugin[editorLanguage];
        remove.textContent = "×";
        row.append(remove);
      }
      category.append(row);
    });
    container.append(category);
  });
  filterElementPalette();
}

function removePlugin(pluginId) {
  if (bundledPluginIds.has(pluginId)) return;
  const component = state.userComponents.find(
    (item) => item.id === pluginId && item.plugin,
  );
  if (!component) return;
  const used =
    state.elements.some((element) => element.customComponentId === pluginId) ||
    state.components.some((saved) =>
      saved.elements.some((element) => element.customComponentId === pluginId),
    );
  if (
    used &&
    !window.confirm(
      `Removing "${component.name}" will also remove its instances from this project. Continue?`,
    )
  )
    return;
  state.elements = state.elements.filter(
    (element) => element.customComponentId !== pluginId,
  );
  state.components = state.components
    .map((saved) => ({
      ...saved,
      elements: saved.elements.filter(
        (element) => element.customComponentId !== pluginId,
      ),
    }))
    .filter((saved) => saved.elements.length > 0);
  state.userComponents = state.userComponents.filter(
    (item) => item.id !== pluginId,
  );
  state.settings.selectedPluginIds =
    (state.settings.selectedPluginIds || []).filter((id) => id !== pluginId);
  clearElementSelection();
  renderCustomComponents();
  renderPreview();
  scheduleSave();
}

function openCustomMarkupDialog(component = null) {
  const form = document.querySelector("#custom-markup-form");
  form.dataset.editingId = component?.id || "";
  document.querySelector("#custom-markup-title").textContent = component
    ? localize.EditHTMLAndCSSComponent[editorLanguage]
    : localize.AddHTMLAndCSSComponent[editorLanguage];
  document.querySelector("#custom-markup-name").value = component?.name || "";
  document.querySelector("#custom-markup-html").value = component?.html || "";
  document.querySelector("#custom-markup-css").value = component?.css || "";
  refreshCodeEditor(document.querySelector("#custom-markup-html"));
  refreshCodeEditor(document.querySelector("#custom-markup-css"));
  customMarkupDialog.showModal();
  document.querySelector("#custom-markup-name").focus();
}

function openSaveComponentDialog() {
  const selected = state.elements.find(
    (element) => element.id === state.selectedId,
  );
  if (!["layout", "grid", "absoluteLayout"].includes(selected?.type)) {
    showToast(localize.SelectLayoutGroupOrGridToSaveAsComponent[editorLanguage]);
    return;
  }
  const nameInput = document.querySelector("#component-name");
  nameInput.value = selected.content.slice(0, 40);
  componentDialog.showModal();
  nameInput.focus();
  nameInput.select();
}

function saveSelectedComponent(name) {
  const selected = state.elements.find(
    (element) => element.id === state.selectedId,
  );
  if (!["layout", "grid", "absoluteLayout"].includes(selected?.type)) {
    componentDialog.close();
    showToast(localize.SelectLayoutGroupOrGridToSaveAsComponent[editorLanguage]);
    return;
  }
  const trimmedName = name.trim().slice(0, 40);
  if (!trimmedName) {
    showToast(localize.EnterAComponentName[editorLanguage]);
    return;
  }
  const elements = [selected];
  for (let index = 0; index < elements.length; index += 1) {
    if (!isContainer(elements[index])) continue;
    elements.push(
      ...state.elements.filter(
        (element) => element.parentId === elements[index].id,
      ),
    );
  }
  state.components.push({
    id: `component-${globalThis.crypto.randomUUID()}`,
    name: trimmedName,
    elements: elements.map((element) => structuredClone(element)),
  });
  componentDialog.close();
  renderCustomComponents();
  scheduleSave();
  showToast(
    localize.ComponentSaved[editorLanguage].replace(
      "{name}",
      () => trimmedName,
    ),
  );
}

function addSavedComponent(componentId) {
  const component = state.components.find((item) => item.id === componentId);
  if (!component) return;
  const instanceId = createId();
  const ids = new Map(
    component.elements.map((element) => [element.id, createId()]),
  );
  const defaultParentId = getSingleRootContainer()?.id || null;
  const copies = component.elements.map((element) => {
    const copy = remapCopiedElementReferences(
      structuredClone(element),
      ids,
    );
    copy.id = ids.get(element.id);
    copy.pageId = state.currentPageId;
    copy.parentId = ids.get(element.parentId) || defaultParentId;
    copy.savedComponentId = component.id;
    copy.savedComponentInstanceId = instanceId;
    copy.savedComponentElementId = element.id;
    return copy;
  });
  const selectedIndex = state.elements.findIndex(
    (element) => element.id === state.selectedId,
  );
  const insertIndex =
    selectedIndex < 0 ? state.elements.length : selectedIndex + 1;
  state.elements.splice(insertIndex, 0, ...copies);
  clearOrphanedItemBindings();
  const rootTemplate = component.elements.find(
    (element) => !ids.has(element.parentId),
  );
  const rootId = rootTemplate ? ids.get(rootTemplate.id) : null;
  setElementSelection(rootId ? [rootId] : [], rootId);
  renderPreview();
  scheduleSave();
}

function syncSavedComponentInstances(component, templateElements) {
  const rootTemplateId = component.elements[0]?.id;
  if (!rootTemplateId) return;
  const instanceIds = new Set(
    state.elements
      .filter((element) => element.savedComponentId === component.id)
      .map((element) => element.savedComponentInstanceId)
      .filter(Boolean),
  );
  const definitions = templateElements.map((element) => structuredClone(element));
  const templateIds = new Set(definitions.map((element) => element.id));
  definitions.forEach((element) => {
    if (element.parentId && !templateIds.has(element.parentId))
      element.parentId = null;
  });

  for (const instanceId of instanceIds) {
    const existing = state.elements.filter(
      (element) => element.savedComponentInstanceId === instanceId,
    );
    const existingByTemplateId = new Map(
      existing.map((element) => [element.savedComponentElementId, element]),
    );
    const rootInstance = existingByTemplateId.get(rootTemplateId);
    if (!rootInstance) continue;
    const idMap = new Map(
      definitions.map((element) => [
        element.id,
        existingByTemplateId.get(element.id)?.id || createId(),
      ]),
    );
    const replacement = definitions.map((definition) => {
      return {
        ...remapCopiedElementReferences(
          structuredClone(definition),
          idMap,
        ),
        id: idMap.get(definition.id),
        pageId: rootInstance.pageId,
        parentId: definition.parentId
          ? idMap.get(definition.parentId)
          : rootInstance.parentId,
        savedComponentId: component.id,
        savedComponentInstanceId: instanceId,
        savedComponentElementId: definition.id,
      };
    });
    const firstIndex = state.elements.findIndex(
      (element) => element.savedComponentInstanceId === instanceId,
    );
    state.elements = state.elements.filter(
      (element) => element.savedComponentInstanceId !== instanceId,
    );
    state.elements.splice(Math.max(firstIndex, 0), 0, ...replacement);
  }
}

function startSavedComponentEditing(instanceId) {
  if (!instanceId) return;
  const instance = state.elements.filter(
    (element) => element.savedComponentInstanceId === instanceId,
  );
  const component = state.components.find(
    (candidate) => candidate.id === instance[0]?.savedComponentId,
  );
  if (!component || !instance.length) {
    showToast(localize.EditableComponentDefinitionNotFound[editorLanguage]);
    return;
  }
  if (state.saveTimer !== null) {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
    saveProject();
  }
  state.editingSavedComponentHistory = {
    undo: [...elementHistory.undo],
    redo: [...elementHistory.redo],
    snapshot: elementHistory.snapshot,
    lastRecordedAt: elementHistory.lastRecordedAt,
  };
  state.editingSavedComponentInstanceId = instanceId;
  document.querySelector("#saved-component-edit-bar").hidden = false;
  document.querySelector("#saved-component-edit-name").textContent =
    component.name;
  renderProperties();
  renderPreview(false);
}

function applySavedComponentEditing(saveChanges) {
  const instanceId = state.editingSavedComponentInstanceId;
  if (!instanceId) return;
  const instance = state.elements.filter(
    (element) => element.savedComponentInstanceId === instanceId,
  );
  const component = state.components.find(
    (candidate) => candidate.id === instance[0]?.savedComponentId,
  );
  if (!component) {
    state.editingSavedComponentInstanceId = null;
    state.editingSavedComponentHistory = null;
    document.querySelector("#saved-component-edit-bar").hidden = true;
    showToast(localize.ComponentDefinitionNotFound[editorLanguage]);
    return;
  }

  let definitions = component.elements;
  if (saveChanges) {
    const instanceById = new Map(instance.map((element) => [element.id, element]));
    const templateIdByInstanceId = new Map(
      instance.map((element) => [
        element.id,
        element.savedComponentElementId || createId(),
      ]),
    );
    definitions = instance.map((element) => {
      const definition = remapCopiedElementReferences(
        structuredClone(element),
        templateIdByInstanceId,
      );
      const parent = instanceById.get(element.parentId);
      definition.id = templateIdByInstanceId.get(element.id);
      definition.parentId = parent
        ? templateIdByInstanceId.get(parent.id)
        : null;
      delete definition.pageId;
      delete definition.savedComponentId;
      delete definition.savedComponentInstanceId;
      delete definition.savedComponentElementId;
      return definition;
    });
    component.elements = definitions;
  }

  syncSavedComponentInstances(component, definitions);
  state.editingSavedComponentInstanceId = null;
  const editHistory = state.editingSavedComponentHistory;
  state.editingSavedComponentHistory = null;
  if (!saveChanges && editHistory) {
    elementHistory.undo = editHistory.undo;
    elementHistory.redo = editHistory.redo;
    elementHistory.snapshot = JSON.stringify(state.elements);
    elementHistory.lastRecordedAt = editHistory.lastRecordedAt;
    updateHistoryControls();
  }
  document.querySelector("#saved-component-edit-bar").hidden = true;
  renderCustomComponents();
  renderProperties();
  renderPreview();
  scheduleSave();
  showToast(
    saveChanges
      ? localize.SavedComponentChangesApplied[editorLanguage].replace(
        "{name}",
        () => component.name,
      )
      : localize.SavedComponentChangesCancelled[editorLanguage],
  );
}

document
  .querySelector("#apply-saved-component-edits")
  .addEventListener("click", () => applySavedComponentEditing(true));
document
  .querySelector("#cancel-saved-component-edits")
  .addEventListener("click", () => applySavedComponentEditing(false));

function renderThemeFields() {
  const modeSelect = document.querySelector("#theme-mode-select");
  const mode = modeSelect.value;
  const colors = mode === "dark" ? state.settings.appDarkTheme : state.theme;
  Object.entries(colors).forEach(([name, value]) => {
    const input = document.querySelector(`#theme-${name}`);
    if (!input) return;
    input.value = safeColor(value, defaultTheme[name]);
    input.nextElementSibling.textContent = input.value.toUpperCase();
  });
  document.querySelector("#reset-theme").textContent =
    mode === "dark" ? localize.RestoreDefaultDarkModeColors[editorLanguage] : localize.RestoreDefaultColors[editorLanguage];
}

function renderSettingsFields() {
  if (!state.settings) return;
  Object.entries(state.settings).forEach(([name, value]) => {
    const input = document.querySelector(`#settings-${name}`);
    if (input) input.value = value ?? defaultSettings[name];
  });
}

function applyTheme() {
  const root = document.documentElement;
  const theme = Object.fromEntries(
    Object.entries(defaultTheme).map(([name, fallback]) => [
      name,
      safeColor(state.theme[name], fallback),
    ]),
  );
  Object.entries(theme).forEach(([name, value]) => {
    root.style.setProperty(
      `--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      value,
    );
  });
  root.style.setProperty("--theme-primary", theme.primary);
  root.style.setProperty("--theme-accent", theme.accent);
  root.style.setProperty("--theme-secondary", theme.secondary);
  root.style.setProperty("--theme-background", theme.background);
  root.style.setProperty("--theme-surface", theme.card);
  root.style.setProperty("--theme-text", theme.foreground);
  root.style.setProperty("--theme-border", theme.border);
  root.style.setProperty("--theme-input", theme.input);
  root.style.setProperty("--theme-muted", theme.mutedForeground);
  root.style.setProperty("--theme-ring", theme.ring);
  root.style.setProperty("--radius-sm", "8px");
  root.style.setProperty("--radius-md", "12px");
  root.style.setProperty("--radius-lg", "16px");
  root.style.setProperty("--shadow-sm", "0 2px 8px rgba(23, 107, 89, 0.06)");
  root.style.setProperty("--shadow-md", "0 4px 16px rgba(0, 0, 0, 0.08)");
  root.style.setProperty("--preview-bg", theme.background);
  root.style.setProperty("--preview-surface", theme.card);
  root.style.setProperty("--preview-text", theme.foreground);
  preview.style.backgroundColor = getActiveThemeColor("background");
  const brand = preview.querySelector(".preview-brand strong");
  if (brand) brand.style.color = getActiveThemeColor("foreground");
}

function getSelectedRequest() {
  return (
    state.requests.find((request) => request.id === state.selectedRequestId) ||
    null
  );
}

function renderRequestList() {
  const list = document.querySelector("#request-list");
  list.replaceChildren();
  state.requests.forEach((request, index) => {
    const row = document.createElement("div");
    row.className = "request-list-entry";
    const button = document.createElement("button");
    button.type = "button";
    button.className = `request-item${request.id === state.selectedRequestId ? " active" : ""}`;
    button.dataset.requestId = request.id;
    const name = document.createElement("strong");
    name.textContent = request.name || localize.UnnamedRequest[editorLanguage];
    const methodUrl = document.createElement("span");
    methodUrl.textContent = `${request.method}`;
    button.append(name, methodUrl);
    const moveUp = document.createElement("button");
    moveUp.type = "button";
    moveUp.dataset.moveRequest = "up";
    moveUp.dataset.requestId = request.id;
    moveUp.disabled = index === 0;
    moveUp.setAttribute(
      "aria-label",
      formatEditorMessage(localize.MoveRequestUp[editorLanguage], {
        name: request.name,
      }),
    );
    moveUp.textContent = "↑";
    const moveDown = document.createElement("button");
    moveDown.type = "button";
    moveDown.dataset.moveRequest = "down";
    moveDown.dataset.requestId = request.id;
    moveDown.disabled = index === state.requests.length - 1;
    moveDown.setAttribute(
      "aria-label",
      formatEditorMessage(localize.MoveRequestDown[editorLanguage], {
        name: request.name,
      }),
    );
    moveDown.textContent = "↓";
    row.append(button, moveUp, moveDown);
    list.append(row);
  });
}

function renderApiEditor() {
  renderRequestList();
  const request = getSelectedRequest();
  const hasRequest = Boolean(request);
  document.querySelector("#api-empty").hidden = hasRequest;
  document.querySelector("#api-form").hidden = !hasRequest;
  document.querySelector("#delete-request").disabled = !hasRequest;
  document.querySelector("#test-request").disabled = !hasRequest;
  if (!request) {
    applyEditorLanguage();
    return;
  }

  document.querySelector("#request-name").value = request.name;
  document.querySelector("#request-url").value = request.url;
  document.querySelector("#request-method").value = request.method;
  document.querySelector("#request-run-on-load").checked =
    request.trigger === "load";

  document.querySelector("#request-headers").value = request.headers;
  document.querySelector("#request-body").value = request.body;
  renderRequestParameterEditor("headers");
  renderRequestParameterEditor("body");
  const testResult = requestTestResults.get(request.id);
  setRequestResult(
    testResult?.message ?? localize.TheRequestHasNotBeenSent[editorLanguage],
    testResult?.status ?? "idle",
  );
  applyEditorLanguage();
}

function getRequestParameterEditor(kind) {
  return document.querySelector(
    `[data-request-parameter-editor="${kind}"]`,
  );
}

function renderRequestParameterEditor(kind) {
  const editor = getRequestParameterEditor(kind);
  const source = document.querySelector(
    kind === "headers" ? "#request-headers" : "#request-body",
  );
  const error = document.querySelector(
    `[data-request-parameter-error="${kind}"]`,
  );
  let parameters = {};
  if (source.value.trim()) {
    try {
      parameters = JSON.parse(source.value);
    } catch (parseError) {
      error.textContent = formatEditorMessage(
        localize.InvalidJSONError[editorLanguage],
        { error: parseError.message },
      );
      error.hidden = false;
      editor.replaceChildren();
      return;
    }
    if (
      !parameters ||
      typeof parameters !== "object" ||
      Array.isArray(parameters)
    ) {
      error.textContent =
        localize.ParametersMustBeJSONObject[editorLanguage];
      error.hidden = false;
      editor.replaceChildren();
      return;
    }
  }
  error.hidden = true;
  editor.replaceChildren();
  Object.entries(parameters).forEach(([key, value]) => {
    appendRequestParameterRow(editor, kind, key, value);
  });
}

function appendRequestParameterRow(editor, kind, key = "", value = "") {
  const row = document.createElement("div");
  row.className = "api-parameter-row";
  row.dataset.valueKind = typeof value === "string" ? "string" : "json";

  const keyInput = document.createElement("input");
  keyInput.type = "text";
  keyInput.className = "api-parameter-key";
  keyInput.value = key;
  keyInput.placeholder = localize.Key[editorLanguage];
  keyInput.setAttribute("aria-label", localize.ParameterKey[editorLanguage]);

  const valueType = document.createElement("select");
  valueType.className = "api-parameter-type";
  valueType.setAttribute("aria-label", localize.ValueType[editorLanguage]);
  valueType.add(new Option(localize.StaticValue[editorLanguage], "static"));
  valueType.add(new Option(localize.TokenType[editorLanguage], "token"));

  const valueInput = document.createElement("input");
  valueInput.type = "text";
  valueInput.className = "api-parameter-value";
  valueInput.dir = "ltr";
  valueInput.setAttribute("aria-label", localize.ParameterValue[editorLanguage]);
  const stringValue =
    typeof value === "string" ? value : JSON.stringify(value);
  valueInput.value = stringValue ?? "";
  const isToken = /\{\{\s*[^{}]+?\s*\}\}/.test(valueInput.value);
  valueType.value = isToken ? "token" : "static";
  valueInput.placeholder =
    valueType.value === "token" ? "{{form.fieldName}}" : localize.Value[editorLanguage];

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "icon-button api-parameter-remove";
  remove.textContent = "×";
  remove.setAttribute("aria-label", localize.RemoveParameter[editorLanguage]);

  const valueCell = document.createElement("div");
  valueCell.className = "api-parameter-value-cell";
  valueCell.append(valueInput);
  attachTokenPicker(
    valueInput,
    state.elements.find((element) => element.id === state.selectedId) || null,
    localize.Token[editorLanguage],
  );
  valueCell.append(remove);
  row.append(keyInput, valueType, valueCell);
  editor.append(row);

  const updateType = () => {
    valueInput.placeholder =
      valueType.value === "token" ? "{{form.fieldName}}" : localize.Value[editorLanguage];
    valueCell.classList.toggle("is-token", valueType.value === "token");
  };
  updateType();
  const onEdit = () => serializeRequestParameterEditor(kind);
  valueType.addEventListener("change", updateType);
  remove.addEventListener("click", () => {
    row.remove();
    serializeRequestParameterEditor(kind);
  });
  row.addEventListener("input", onEdit);
  row.addEventListener("change", onEdit);
  return row;
}

function serializeRequestParameterEditor(kind) {
  const editor = getRequestParameterEditor(kind);
  const source = document.querySelector(
    kind === "headers" ? "#request-headers" : "#request-body",
  );
  const error = document.querySelector(
    `[data-request-parameter-error="${kind}"]`,
  );
  const parameters = {};
  for (const row of editor.querySelectorAll(".api-parameter-row")) {
    const key = row.querySelector(".api-parameter-key").value.trim();
    const valueInput = row.querySelector(".api-parameter-value");
    const valueType = row.querySelector(".api-parameter-type").value;
    if (!key) {
      error.textContent = localize.EachParameterNeedsKey[editorLanguage];
      error.hidden = false;
      return false;
    }
    if (Object.hasOwn(parameters, key)) {
      error.textContent = formatEditorMessage(
        localize.DuplicateParameterKey[editorLanguage],
        { key },
      );
      error.hidden = false;
      return false;
    }
    let value = valueInput.value;
    if (kind === "body" && valueType === "static" && row.dataset.valueKind === "json") {
      try {
        value = JSON.parse(value);
      } catch {
        value = valueInput.value;
        row.dataset.valueKind = "string";
      }
    }
    parameters[key] = value;
  }
  error.hidden = true;
  source.value =
    kind === "body" && !Object.keys(parameters).length
      ? ""
      : JSON.stringify(parameters, null, 2);
  syncRequestForm();
  return true;
}

function setRequestResult(message, status) {
  const result = document.querySelector("#request-result");
  result.textContent = message;
  result.dataset.state = status;
}

function setRequestTestResult(requestId, message, status) {
  requestTestResults.set(requestId, { message, status });
  if (state.selectedRequestId === requestId) setRequestResult(message, status);
}

function newRequest() {
  return {
    id: createId(),
    name: localize.NewRequest[editorLanguage],
    method: "GET",
    url: "",
    trigger: "load",
    buttonId: "",
    headers: "{}",
    body: "",
  };
}

function syncRequestForm() {
  const request = getSelectedRequest();
  if (!request) return;
  const name = document.querySelector("#request-name").value;
  const url = document.querySelector("#request-url").value;
  const method = document.querySelector("#request-method").value;
  const trigger = document.querySelector("#request-run-on-load").checked
    ? "load"
    : "button";
  const headers = document.querySelector("#request-headers").value;
  const body = document.querySelector("#request-body").value;
  if (
    request.name !== name ||
    request.url !== url ||
    request.method !== method ||
    request.trigger !== trigger ||
    request.headers !== headers ||
    request.body !== body
  ) {
    requestTestResults.delete(request.id);
    delete state.responses[request.id];
    setRequestResult(
      localize.TheRequestHasNotBeenSent[editorLanguage],
      "idle",
    );
  }
  request.name = name;
  request.url = url;
  request.method = method;
  request.trigger = trigger;
  request.headers = headers;
  request.body = body;

  renderRequestList();
  const selectedElement = state.elements.find(
    (element) => element.id === state.selectedId,
  );
  if (selectedElement) renderEventHandlers(selectedElement.action || {});
  scheduleSave();
}

function parseHelperResult(result, field) {
  let data = result;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return data;
    }
  }

  const originalData = data;
  while (data && typeof data === "object") {
    if (Object.hasOwn(data, field.responseKey)) return data[field.responseKey];
    const nested = data.results ?? data.data;
    if (nested === undefined || nested === data) break;
    data = nested;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return originalData;
      }
    }
  }
  return originalData;
}

async function getTwkValue(fieldKey, useMock) {
  const field = TWK_FIELDS.find((item) => item.key === fieldKey);
  if (!field)
    throw new Error(
      formatEditorMessage(localize.UnknownTWKField[editorLanguage], {
        field: fieldKey,
      }),
    );
  if (useMock) return field.sample;
  const helperMethod = window.TWK?.[field.method];
  if (typeof helperMethod !== "function") {
    throw new Error(
      formatEditorMessage(localize.TWKHelperUnavailable[editorLanguage], {
        method: field.method,
      }),
    );
  }
  const result = await helperMethod.call(window.TWK);
  return parseHelperResult(result, field);
}

async function resolveEditorVariable(
  name,
  formValues = {},
  visited = new Set(),
) {
  const variable = state.variables.find((item) => item.name === name);
  if (!variable)
    throw new Error(
      formatEditorMessage(localize.UnknownVariable[editorLanguage], { name }),
    );
  if (visited.has(variable.id))
    throw new Error(
      formatEditorMessage(localize.CircularVariableReference[editorLanguage], {
        name,
      }),
    );
  const nextVisited = new Set(visited);
  nextVisited.add(variable.id);
  let value;
  if (variable.source === "static") value = variable.value;
  else if (variable.source === "twk")
    value = await getTwkValue(variable.fieldKey, true);
  else if (variable.source === "form") {
    if (!Object.hasOwn(formValues, variable.fieldName))
      throw new Error(
        formatEditorMessage(localize.FormFieldUnavailable[editorLanguage], {
          field: variable.fieldName,
        }),
      );
    value = formValues[variable.fieldName];
  } else if (variable.source === "variable") {
    const source = state.variables.find((item) => item.id === variable.path);
    if (!source)
      throw new Error(
        formatEditorMessage(localize.VariableSourceUnavailable[editorLanguage], {
          name,
        }),
      );
    value = await resolveEditorVariable(source.name, formValues, nextVisited);
  } else if (variable.source === "item")
    throw new Error(
      formatEditorMessage(localize.ListItemDataUnavailable[editorLanguage], {
        name,
      }),
    );
  else if (variable.source === "extra")
    value = getPreviewExtraValue(variable.path, null);
  else if (variable.source === "element")
    value = getPreviewElementPropertyValue(
      variable.elementId,
      variable.property,
    );
  else {
    if (!Object.hasOwn(state.responses, variable.requestId))
      throw new Error(
        formatEditorMessage(localize.APIResponseUnavailable[editorLanguage], {
          name,
        }),
      );
    value = readPath(state.responses[variable.requestId], variable.path);
    if (value === undefined)
      throw new Error(
        formatEditorMessage(localize.APIResponsePathUnavailable[editorLanguage], {
          name,
        }),
      );
  }
  return readValuePath(value, variable.propertyPath);
}

async function resolveEditorToken(source, key, formValues, useMock) {
  if (source === "twk") return getTwkValue(key.toLowerCase(), useMock);
  if (source === "var") {
    const [name, ...path] = key.split(".");
    const value = await resolveEditorVariable(name, formValues);
    if (!path.length) return value;
    const nestedValue = readValuePath(value, path.join("."));
    if (nestedValue === undefined)
      throw new Error(
        formatEditorMessage(localize.VariablePathUnavailable[editorLanguage], {
          path: `${name}.${path.join(".")}`,
        }),
      );
    return nestedValue;
  }
  if (!Object.hasOwn(formValues, key))
    throw new Error(
      formatEditorMessage(localize.FormFieldKeyUnavailable[editorLanguage], {
        key,
      }),
    );
  return formValues[key];
}

async function resolveTemplate(
  value,
  useMock,
  encodeValues = false,
  formValues = {},
) {
  const tokenPattern = /\{\{\s*(twk|form|var)\.([^{}]+?)\s*\}\}/gi;
  const matches = [...value.matchAll(tokenPattern)];
  const isCompleteToken =
    matches.length === 1 && matches[0][0] === value;
  const replacements = new Map();
  await Promise.all(
    matches.map(async (match) => {
      const source = match[1].toLowerCase();
      const key = match[2].trim();
      const token = `${source}:${key}`;
      if (!replacements.has(token))
        replacements.set(
          token,
          await resolveEditorToken(source, key, formValues, useMock),
        );
    }),
  );
  return value.replace(tokenPattern, (_match, source, key) => {
    const valueForToken = replacements.get(
      `${source.toLowerCase()}:${key.trim()}`,
    );
    const text =
      valueForToken && typeof valueForToken === "object"
        ? JSON.stringify(valueForToken)
        : String(valueForToken ?? "");
    return encodeValues && !isCompleteToken
      ? encodeURIComponent(text)
      : text;
  });
}

async function resolveJsonTemplate(value, useMock, formValues = {}) {
  if (Array.isArray(value))
    return Promise.all(
      value.map((item) => resolveJsonTemplate(item, useMock, formValues)),
    );
  if (value && typeof value === "object") {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, item]) => [
        key,
        await resolveJsonTemplate(item, useMock, formValues),
      ]),
    );
    return Object.fromEntries(entries);
  }
  if (typeof value !== "string") return value;

  const exactToken = value.match(/^\{\{\s*(twk|form|var)\.([^{}]+?)\s*\}\}$/i);
  if (exactToken)
    return resolveEditorToken(
      exactToken[1].toLowerCase(),
      exactToken[2].trim(),
      formValues,
      useMock,
    );
  return resolveTemplate(value, useMock, false, formValues);
}

async function executeRequest(request, useMock = false) {
  if (!request.url.trim()) throw new Error(localize.EnterTheRequestURLFirst[editorLanguage]);
  if (!requestMethods.includes(request.method))
    throw new Error(localize.UnsupportedRequestMethod[editorLanguage]);

  const formValues = Object.fromEntries(collectPreviewFormValues());
  const urlText = await resolveTemplate(
    request.url.trim(),
    useMock,
    true,
    formValues,
  );
  let url;
  try {
    url = new URL(urlText);
  } catch {
    throw new Error(localize.TheRequestURLIsInvalid[editorLanguage]);
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error(localize.UseHTTPOrHTTPS[editorLanguage]);

  let headers;
  try {
    headers = await resolveJsonTemplate(
      JSON.parse(request.headers || "{}"),
      useMock,
      formValues,
    );
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error(localize.InvalidJSONHeaders[editorLanguage]);
    throw error;
  }
  if (!headers || Array.isArray(headers) || typeof headers !== "object") {
    throw new Error(localize.HeadersMustBeJSONObject[editorLanguage]);
  }
  for (const [key, value] of Object.entries(headers)) {
    headers[key] = typeof value === "string" ? value : String(value);
  }

  let body;
  if (request.body.trim() && request.method !== "GET") {
    let templateBody;
    try {
      templateBody = JSON.parse(request.body);
    } catch {
      throw new Error(localize.InvalidJSONRequestBody[editorLanguage]);
    }
    body = JSON.stringify(
      await resolveJsonTemplate(templateBody, useMock, formValues),
    );
    if (
      !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")
    ) {
      headers["Content-Type"] = "application/json";
    }
  }

  const response = await fetch(url, { method: request.method, headers, body });
  const text = await response.text();
  let data = text;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const detail =
      typeof data === "string"
        ? data.slice(0, 240)
        : JSON.stringify(data).slice(0, 240);
    throw new Error(
      formatEditorMessage(localize.ServerRequestFailed[editorLanguage], {
        status: response.status,
        detail: detail ? `: ${detail}` : "",
      }),
    );
  }
  return data;
}

function responseSummary(data) {
  const summary = JSON.stringify(data, null, 2);
  return summary.length > 4000
    ? `${summary.slice(0, 4000)}${localize.TruncatedResponse[editorLanguage]}`
    : summary;
}

function buildStyles() {
  const appMargins = normalizeSpacing(state.settings.appMargins, 0, 100);
  const appPaddings = normalizeSpacing(
    state.settings.appPaddings,
    defaultSettings.appPaddings,
    100,
  );
  const baseStyles = `
:root {
  color-scheme: ${state.settings.appTheme === "dark" ? "dark" : "light"};
  --element-size-scale: ${getElementSizeScale()};
  --background: ${getActiveThemeColor("background")};
  --foreground: ${getActiveThemeColor("foreground")};
  --card: ${getActiveThemeColor("card")};
  --card-foreground: ${getActiveThemeColor("cardForeground")};
  --popover: ${getActiveThemeColor("popover")};
  --popover-foreground: ${getActiveThemeColor("popoverForeground")};
  --primary: ${getActiveThemeColor("primary")};
  --primary-foreground: ${getActiveThemeColor("primaryForeground")};
  --secondary: ${getActiveThemeColor("secondary")};
  --secondary-foreground: ${getActiveThemeColor("secondaryForeground")};
  --muted: ${getActiveThemeColor("muted")};
  --muted-foreground: ${getActiveThemeColor("mutedForeground")};
  --accent: ${getActiveThemeColor("accent")};
  --accent-foreground: ${getActiveThemeColor("accentForeground")};
  --destructive: ${getActiveThemeColor("destructive")};
  --border: ${getActiveThemeColor("border")};
  --input: ${getActiveThemeColor("input")};
  --ring: ${getActiveThemeColor("ring")};
  --theme-primary: ${getActiveThemeColor("primary")};
  --theme-accent: ${getActiveThemeColor("accent")};
  --theme-secondary: ${getActiveThemeColor("secondary")};
  --theme-background: var(--background);
  --theme-surface: var(--card);
  --theme-text: var(--foreground);
  --theme-border: var(--border);
  --theme-input: var(--input);
  --theme-muted: var(--muted-foreground);
  --theme-ring: var(--ring);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --shadow-sm: 0 2px 8px rgba(23, 107, 89, 0.06);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.08);
}

:root[data-app-theme="light"] {
  color-scheme: light;
${Object.entries(defaultTheme)
      .map(
        ([name, fallback]) =>
          `  --${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}: ${safeColor(state.theme[name], fallback)};`,
      )
      .join("\n")}
  --theme-primary: var(--primary);
  --theme-accent: var(--accent);
  --theme-secondary: var(--secondary);
}

:root[data-app-theme="dark"] {
  color-scheme: dark;
${Object.entries(defaultTheme)
      .map(
        ([name, fallback]) =>
          `  --${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}: ${safeColor(state.settings.appDarkTheme[name], darkThemeColors[name] ?? fallback)};`,
      )
      .join("\n")}
  --theme-primary: var(--primary);
  --theme-accent: var(--accent);
  --theme-secondary: var(--secondary);
}

* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

[hidden] {
  display: none !important;
}

body {
  display: flex;
  justify-content: center;
  margin: 0;
  padding: 0;
  background: var(--theme-background);
  color: var(--theme-text);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Tahoma, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  line-height: 1.4;
}

/* Container Structure */
.embedded-app {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(520px, calc(100% - ${appMargins.left + appMargins.right}px));
  max-width: 520px;
  height: calc(100vh - ${appMargins.top + appMargins.bottom}px);
  min-height: calc(100vh - ${appMargins.top + appMargins.bottom}px);
  gap: 8px;
  margin: ${appMargins.top}px ${appMargins.right}px ${appMargins.bottom}px ${appMargins.left}px;
  padding: ${appPaddings.top}px ${appPaddings.right}px calc(${appPaddings.bottom}px + env(safe-area-inset-bottom, 0px)) ${appPaddings.left}px;
  background: transparent;
  // border-radius: var(--radius-lg);
  // box-shadow: var(--shadow-md);
  overflow: hidden;
}

.content-button.variant-primary,
.content-fab.variant-primary {
  background-color: var(--theme-primary);
  color: var(--primary-foreground);
}
.content-button.variant-secondary,
.content-fab.variant-secondary {
  background-color: var(--secondary);
  color: var(--secondary-foreground);
}
.content-button.variant-destructive,
.content-fab.variant-destructive {
  background-color: var(--destructive);
  color: var(--primary-foreground);
}
.content-button.variant-ghost,
.content-button.variant-outline,
.content-fab.variant-ghost,
.content-fab.variant-outline {
  background-color: transparent;
  color: var(--theme-primary);
}
.content-button.variant-ghost:hover,
.content-fab.variant-ghost:hover {
  background-color: var(--accent);
  color: var(--accent-foreground);
}
.content-fab.variant-outline {
  border: 1px solid var(--theme-primary);
}
.content-button.variant-outline {
  border: 1px solid var(--theme-primary);
}
.content-accordion {
  display: block;
  overflow: hidden;
  border: 1px solid var(--theme-input);
  border-radius: var(--radius-md);
  background: var(--theme-surface);
}
.content-accordion > summary,
.content-accordion-toggle {
  padding: calc(12px * var(--element-size-scale, 1)) calc(14px * var(--element-size-scale, 1));
  cursor: pointer;
  font-weight: 700;
  list-style-position: inside;
}
.content-accordion-toggle {
  width: 100%;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: start;
}
.content-accordion-panel {
  display: grid;
  gap: calc(8px * var(--element-size-scale, 1));
  padding: 0 calc(14px * var(--element-size-scale, 1)) calc(14px * var(--element-size-scale, 1));
}
.content-accordion-panel[hidden] {
  display: none !important;
}
.content-tabs {
  display: grid;
  gap: 0;
}
.content-tab-list {
  display: flex;
  gap: calc(4px * var(--element-size-scale, 1));
  overflow-x: auto;
  border-bottom: 1px solid var(--theme-border);
}
.content-tab-button {
  flex: 0 0 auto;
  padding: calc(9px * var(--element-size-scale, 1)) calc(12px * var(--element-size-scale, 1));
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--theme-muted);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.content-tab-button[aria-selected="true"] {
  border-bottom-color: var(--theme-primary);
  color: var(--theme-primary);
}
.content-tab-panels {
  min-width: 0;
}
.content-tab-panel {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: calc(8px * var(--element-size-scale, 1));
}
.content-collection {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.content-collection-items {
  display: flex;
  flex-direction: column;
  gap: calc(8px * var(--element-size-scale, 1));
}
.content-chip {
  display: inline-flex;
  min-height: calc(34px * var(--element-size-scale, 1));
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-foreground);
  cursor: pointer;
  font: inherit;
}
.content-chip.is-selected {
  border-color: var(--theme-primary);
  background: var(--theme-primary) !important;
  color: var(--primary-foreground) !important;
}
.content-chip:hover:not(.is-selected) {
  background: var(--accent);
  color: var(--accent-foreground);
}
.content-chip:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
.content-breadcrumbs {
  display: block;
  color: var(--theme-muted);
  font-size: 14px;
}
.content-breadcrumbs > span {
  color: var(--theme-text);
}
.content-badge {
  display: inline-flex;
  min-height: calc(22px * var(--element-size-scale, 1));
  align-items: center;
  border-radius: 999px;
  background: var(--theme-primary) !important;
  color: var(--primary-foreground) !important;
  font-size: 14px;
  font-weight: 700;
}
.content-fab {
  position: absolute;
  z-index: 10;
  right: 18px;
  bottom: 18px;
  display: grid;
  width: calc(56px * var(--element-size-scale, 1));
  height: calc(56px * var(--element-size-scale, 1));
  place-items: center;
  border: 0;
  margin-bottom:  max(28px, calc(20px + env(safe-area-inset-bottom, 20px))) !important;
  border-radius: 50%;
  background: var(--theme-primary);
  color: var(--primary-foreground);
  box-shadow: var(--shadow-md);
  cursor: pointer;
  font-size: calc(24px * var(--element-size-scale, 1));
}
.content-toast {
  position: fixed;
  z-index: 1002;
  top: 16px;
  right: 16px;
  left: 16px;
  width: min(420px, calc(100% - 32px));
  margin-inline: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: var(--radius-md);
  background: var(--popover);
  color: var(--popover-foreground);
  box-shadow: var(--shadow-sm);
}
.content-toast-close {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: 20px;
}
  
.content-sheet {
  position: fixed;
  z-index: 1001;
  top: auto;
  right: auto;
  bottom: 8px;
  left: 50%;
  display: flex;
  width: min(504px, calc(100vw - 16px));
  max-height: 75vh;
  max-height: min(75dvh, 75vh);
  flex-direction: column;
  overflow: auto;
  border-radius: 18px 18px 0 0;
  background: var(--popover);
  color: var(--popover-foreground);
  box-shadow: 0 -8px 32px rgb(17 34 27 / 18%);
  overscroll-behavior: contain;
  transform: translate(-50%, calc(100% + 8px));
  opacity: 0;
  visibility: hidden;
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
              opacity 0.3s ease,
              visibility 0.3s ease;
}

.content-sheet::after {
  content: "";
  flex: 0 0 env(safe-area-inset-bottom, 32px);
}

.content-sheet.is-active {
  transform: translate(-50%, 0);
  opacity: 1;
  visibility: visible;
}

.app-sheet-backdrop {
  position: fixed;
  z-index: 1000;
  inset: 0;
  border: 0;
  background: rgb(15 28 23 / 42%);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s ease, visibility 0.3s ease;
}

.app-sheet-backdrop.is-active {
  opacity: 1;
  visibility: visible;
}

.content-sheet-toolbar {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  // background: var(--accent);
  color: var(--accent-foreground);
  font: inherit;
  font-size: 11px;
}

.content-sheet-close {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: 20px;
}

/* Header UI */
.app-header {
  display: flex;
  align-items: center;
  justify-content: start;
  gap: 16px;
  padding: 4px 4px 12px;
}

.app-logo {
  display: block;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: var(--radius-md);
  background: transparent;
  object-fit: contain;
}

.app-header strong,
.app-header small {
  display: block;
}

.app-header strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--theme-text);
}

.app-header small {
  margin-top: 2px;
  color: var(--theme-muted);
  font-size: 14px;
}

.app-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 4px;
  scroll-behavior: smooth;
  scrollbar-width: none; /* Firefox */
}

.app-page::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

.app-page.is-entering {
  animation: app-page-enter 200ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.content {
  min-height: 20px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  white-space: normal;
  overflow-wrap: anywhere;
}

.content-heading {
  margin: 4px 0;
  font-weight: 700;
  line-height: 1.4;
}

.content-text {
  line-height: 1.4;
  color: var(--theme-text);
}

.content-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: calc(48px * var(--element-size-scale, 1));
  padding: 12px 16px;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--theme-primary);
  color: var(--primary-foreground);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.1s ease;
  box-shadow: var(--shadow-sm);
}

.content-button-has-icon {
  gap: 8px;
}

.content-button:active {
  transform: scale(0.98);
  opacity: 0.9;
}

.content-button:focus-visible,
.content-fab:focus-visible,
.content-chip:focus-visible {
  outline: 2px solid var(--theme-ring);
  outline-offset: 2px;
}

.content-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: calc(70px * var(--element-size-scale, 1));
  padding: 16px;
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-md);
  background: var(--theme-surface);
  color: var(--card-foreground);
  box-shadow: var(--shadow-sm);
}

.card-header {
  display: block;
  margin-bottom: 8px;
  font-size: 1.05em;
  font-weight: 700;
}

.card-body {
  line-height: 1.4;
}

.card-text {
  white-space: pre-wrap;
}

.card-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--theme-border);
  color: var(--theme-muted);
  font-size: 14px;
}

.content-file-picker {
  display: inline-flex;
  min-height: calc(44px * var(--element-size-scale, 1));
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--theme-primary);
  border-radius: var(--radius-sm);
  background: var(--theme-primary);
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.content-file-picker-dropzone {
  display: flex;
  width: 100%;
  min-height: 100px;
  border: 1px dashed var(--theme-primary);
  background: #f1f7f4;
  color: var(--theme-primary);
}
.content-file-picker:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.content-input,
.content-list select {
  width: 100%;
  min-height: calc(44px * var(--element-size-scale, 1));
  padding: calc(10px * var(--element-size-scale, 1)) calc(12px * var(--element-size-scale, 1));
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-sm);
  background: var(--theme-surface);
  color: var(--theme-text);
  font: inherit;
  font-size: calc(14px * var(--element-size-scale, 1));
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.content-input[type="range"] {
  min-height: calc(24px * var(--element-size-scale, 1));
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  accent-color: var(--theme-primary);
  cursor: pointer;
}

.content-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.content-input:focus-visible,
.content-list select:focus-visible {
  border-color: var(--theme-ring);
  outline: 2px solid var(--theme-ring);
  outline-offset: 2px;
  box-shadow: none;
}

.content-input[aria-invalid="true"],
.content-list select[aria-invalid="true"] {
  border-color: var(--destructive);
}

.content-checkbox,
.content-radio {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.control-label {
  display: flex;
  align-items: center;
  gap: calc(10px * var(--element-size-scale, 1));
  min-height: calc(32px * var(--element-size-scale, 1));
  cursor: pointer;
  font-size: calc(14px * var(--element-size-scale, 1));
}

.control-label input {
  width: calc(18px * var(--element-size-scale, 1));
  height: calc(18px * var(--element-size-scale, 1));
  margin: 0;
  accent-color: var(--theme-primary);
  cursor: pointer;
}

.content-layout {
  display: flex;
  flex-direction: column;
  gap: calc(8px * var(--element-size-scale, 1));
  min-height: calc(52px * var(--element-size-scale, 1));
  padding: calc(8px * var(--element-size-scale, 1));
  background: var(--muted);
}

.content-layout-children {
  width: 100%;
  min-width: 0;
}

.content-layout .content {
  width: auto;
  max-width: 100%;
}

.content-absolute-layout {
  position: relative;
  min-height: 200px;
}

.content-absolute-layout-children {
  position: absolute;
  inset: 0;
}

.content-absolute-layout-children > [data-absolute-layout-child] {
  position: absolute;
}

.content-absolute-layout-children > [data-absolute-layout-child][data-horizontal-alignment="start"] {
  inset-inline-start: 0;
}

.content-absolute-layout-children > [data-absolute-layout-child][data-horizontal-alignment="center"] {
  left: 50%;
  translate: -50% 0;
}

.content-absolute-layout-children > [data-absolute-layout-child][data-horizontal-alignment="end"] {
  inset-inline-end: 0;
}

.content-absolute-layout-children > [data-absolute-layout-child][data-vertical-alignment="top"] {
  top: 0;
}

.content-absolute-layout-children > [data-absolute-layout-child][data-vertical-alignment="center"] {
  top: 50%;
  translate: 0 -50%;
}

.content-absolute-layout-children
  > [data-absolute-layout-child][data-horizontal-alignment="center"][data-vertical-alignment="center"] {
  translate: -50% -50%;
}

.content-absolute-layout-children > [data-absolute-layout-child][data-vertical-alignment="bottom"] {
  bottom: 0;
}

.layout-title {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: var(--theme-muted);
  margin-bottom: 2px;
}

.content-scroll-view {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overscroll-behavior: contain;
}

.content-scroll-view-children {
  width: 100%;
  min-width: 0;
  min-height: 26px;
}

.content-scroll-view-children > * {
  flex: 0 0 auto;
  width: auto;
  max-width: 100%;
  margin: 0;
}

.content-collection-item {
  display: flex;
  flex-direction: column;
  gap: calc(4px * var(--element-size-scale, 1));
  background: var(--theme-surface);
}

.content-image {
  display: block;
  width: 100%;
  min-height: 54px;
  max-height: 240px;
  object-fit: cover;
  border-radius: var(--radius-md);
}

.preview-image-empty {
  display: grid;
  place-items: center;
  min-height: 80px;
  border: 1px dashed var(--theme-border);
  border-radius: var(--radius-md);
  color: var(--theme-muted);
  background: #f1f5f3;
  font-size: 14px;
}

.content-divider {
  width: 100%;
  min-height: 1px;
  margin: 6px 0;
  border: 0;
  border-top: 1px solid var(--theme-border);
}

.content-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
}

/* Modals & Dialogs */
.app-message-dialog {
  position: fixed;
  z-index: 10000;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 16px;
  border-radius: var(--radius-lg);
  background: rgba(15, 28, 23, 0.5);
  color: var(--popover-foreground);
  overflow: auto;
}

.app-message-dialog[hidden] {
  display: none !important;
}

.app-message-dialog-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  max-height: 100%;
  overflow: auto;
  padding: 24px;
  border-radius: var(--radius-lg);
  background: var(--popover);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
}

.app-message-dialog h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.app-message-dialog p {
  margin: 16px 0 0;
  line-height: 1.4;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.app-message-dialog button {
  margin-top: 16px;
  min-height: 44px;
  border: 0;
  border-radius: var(--radius-md);
  background: var(--theme-primary);
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.app-runtime-message {
  margin: 0 0 12px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: #edf4f1;
  font-size: 14px;
  line-height: 1.4;
}

.app-page-error .app-runtime-message {
  color: #913a33;
  background: #fff0ee;
  border: 1px solid #f2cfcb;
}

.app-api-progress[hidden] {
  display: none;
}

.app-api-progress {
  position: fixed;
  z-index: 9999;
  inset: 0;
  display: grid;
  place-items: center;
  gap: 12px;
  background: rgb(20 35 31 / 18%);
}

.app-api-progress-indicator {
  width: 18px;
  height: 18px;
  border: 3px solid #b9d4cd;
  border-top-color: var(--theme-primary);
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 0 10px #ffffff;
  animation: app-spin 0.75s linear infinite;
}

.app-api-progress-label {
  color: var(--theme-text);
  font-size: 14px;
}

@keyframes app-spin {
  to {
    transform: rotate(360deg);
  }
}
  
@keyframes app-page-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.request-status {
  margin: 0;
  color: #8a2e27;
  font-size: 14px;
  line-height: 1.4;
}

@media (prefers-reduced-motion: reduce) {
  .app-page.is-entering,
  .app-api-progress-indicator {
    animation: none;
  }
}
`.trim();
  return baseStyles;
}

const renderPreviewMarkup = createPreviewRenderer({
  TemplateEngine,
  EXPORT_HTML_TEMPLATES,
  state,
  escapeHtml,
  normalizeClassNames,
  getLocalizedContent,
  getElementThemeColor,
  getExportElementThemeColor,
  getExportThemeColor,
  getElementFontSize,
  getScaledSpacingCss,
  getSpacingCss,
  clampNumber,
  safeColor,
  defaultBorderRadius,
  normalizeDimension,
  getAbsoluteLayoutChildAlignment,
  getFormName,
  inputTypes,
  getAsset,
  safeImageUrl,
  isInsideCollection,
  getVariantOptions,
  getDefaultVariant,
  normalizeOptions,
  customComponentClass,
  safeCustomHtml,
});

function buildMarkup(assetUrlFor = (asset) => asset.dataUrl) {
  return renderPreviewMarkup(assetUrlFor);
}

const renderRuntimeScript = createRuntimeBuilder({
  TWK_FIELDS,
  state,
  componentRuntimePropertyRegistry,
  normalizeExtraData,
  normalizeLocalizedContent,
  normalizeCollectionDataSource,
  removeDefaultProperties,
  normalizeAppLoadHandlers,
  isJavaScriptAsset,
  assetArchivePath,
  twkSystemActionOptions,
  twkPermissionActionTypes,
  variantOptionsByType,
});

function buildScript(assetUrlFor = (asset) => asset.dataUrl) {
  return renderRuntimeScript(assetUrlFor);
}

function getExportContent(tab) {
  if (tab === "css")
    return [
      buildStyles(),
      buildAdditionalComponentStyles(".embedded-app"),
      buildAdditionalComponentStyles(".app-sheet-portal"),
      buildCustomComponentStyles(),
      state.customCss.trim(),
    ]
      .filter(Boolean)
      .join("\n\n");
  if (tab === "js") return buildScript();
  return buildMarkup();
}

function buildHtmlFile() {
  const indent = (value, spaces) =>
    value
      .split("\n")
      .map((line) => `${" ".repeat(spaces)}${line}`)
      .join("\n");
  const componentStyles = [
    buildAdditionalComponentStyles(".embedded-app"),
    buildAdditionalComponentStyles(".app-sheet-portal"),
    buildCustomComponentStyles(),
    scopeCss(state.customCss, ".embedded-app", true),
    scopeCss(state.customCss, ".app-sheet-portal", true),
  ]
    .filter(Boolean)
    .join("\n");
  const styles = [buildStyles(), componentStyles]
    .filter(Boolean)
    .join("\n");

  return TemplateEngine.render(
    EXPORT_HTML_TEMPLATES.document,
    {
      language: state.settings.appLanguage,
      direction: state.settings.appLanguage === "ar" ? "rtl" : "ltr",
      themeColor: safeColor(state.theme.primary, defaultTheme.primary),
      helperUrl: TWK_HELPER_URL,
      title: getLocalizedAppTitle(),
      styles: TemplateEngine.raw(indent(styles, 4)),
      markup: TemplateEngine.raw(
        indent(
          buildMarkup((asset) => `./${assetArchivePath(asset)}`),
          2,
        ),
      ),
      script: TemplateEngine.raw(
        indent(
          buildScript((asset) => `./${assetArchivePath(asset)}`),
          4,
        ),
      ),
    },
    EXPORT_HTML_TEMPLATES,
  );
}

function refreshExportCode() {
  exportCode.textContent = getExportContent(state.exportTab);
  document.querySelectorAll(".export-tab").forEach((button) => {
    const selected = button.dataset.tab === state.exportTab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
}

const elementPalette = document.querySelector("#element-palette");
const elementSearch = document.querySelector("#element-search");
const emptyElementSearchMessage = document.querySelector(
  "#element-search-empty",
);
let elementCategoryOpenState = null;

function normalizeElementSearchText(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function filterElementPalette() {
  const categories = [...elementPalette.querySelectorAll(".element-category")];
  const query = normalizeElementSearchText(elementSearch.value);

  if (query && !elementCategoryOpenState) {
    elementCategoryOpenState = new Map(
      categories.map((category) => [category, category.open]),
    );
  } else if (!query && elementCategoryOpenState) {
    elementCategoryOpenState.forEach((open, category) => {
      category.open = open;
    });
    elementCategoryOpenState = null;
  }

  let matchCount = 0;
  categories.forEach((category) => {
    let categoryMatchCount = 0;
    category.querySelectorAll(".element-card").forEach((card) => {
      const searchableText = normalizeElementSearchText(
        `${card.dataset.type} ${card.textContent}`,
      );
      const matches = !query || searchableText.includes(query);
      card.hidden = !matches;
      if (matches) {
        categoryMatchCount += 1;
        matchCount += 1;
      }
    });
    category.hidden = categoryMatchCount === 0;
    if (query && categoryMatchCount > 0) category.open = true;
  });

  emptyElementSearchMessage.hidden = matchCount > 0;
}

elementSearch.addEventListener("input", filterElementPalette);
function handleElementPaletteClick(event) {
  const removeButton = event.target.closest("[data-remove-plugin]");
  if (removeButton) {
    removePlugin(removeButton.dataset.removePlugin);
    return;
  }
  const button = event.target.closest("[data-type]");
  if (!button) return;
  if (button.dataset.pluginId)
    addElement("custom", null, null, button.dataset.pluginId);
  else addElement(button.dataset.type);
}
elementPalette.addEventListener("click", handleElementPaletteClick);
document
  .querySelector(".toolbar-menubar")
  .addEventListener("click", (event) => {
    if (event.target.closest("button")) {
      const menu = event.target.closest(".toolbar-menu");
      if (menu) menu.open = false;
    } else if (event.target.closest("summary")) {
      const currentMenu = event.target.closest(".toolbar-menu");
      setTimeout(() => {
        document.querySelectorAll(".toolbar-menu").forEach((menu) => {
          if (menu !== currentMenu) menu.open = false;
        });
      }, 0);
    }
  });
document
  .querySelector("#editor-language-toggle")
  .addEventListener("click", () => {
    setEditorLanguage(editorLanguage === "ar" ? "en" : "ar");
    filterElementPalette();
  });
document.querySelector("#app-language-toggle").addEventListener("click", () => {
  setAppLanguage(state.settings.appLanguage === "ar" ? "en" : "ar");
});
document.querySelector("#app-theme-toggle").addEventListener("click", () => {
  state.settings.appTheme = state.settings.appTheme === "dark" ? "light" : "dark";
  renderPreview();
  refreshExportCode();
  scheduleSave();
});

document.querySelector("#add-custom-markup").addEventListener("click", () => {
  openCustomMarkupDialog();
});
document.querySelector("#import-plugin").addEventListener("click", () => {
  renderPluginPicker();
  document.querySelector("#import-plugin-file").click();
});
document.querySelector("#manage-plugins").addEventListener("click", () => {
  renderPluginPicker();
  document.querySelector("#plugin-picker-dialog").showModal();
});
document.querySelector("#close-plugin-picker").addEventListener("click", () => {
  document.querySelector("#plugin-picker-dialog").close();
});
document
  .querySelector("#plugin-picker-list")
  .addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-plugin-selection]");
    if (!(checkbox instanceof HTMLInputElement)) return;
    updatePluginSelection(checkbox.dataset.pluginSelection, checkbox.checked);
  });
document
  .querySelector("#import-plugin-file")
  .addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (
      !window.confirm(localize.TrustedPluginWarning[editorLanguage])
    )
      return;
    try {
      const plugin = await importPluginArchive(file, JSZip);
      if (state.userComponents.some((component) => component.id === plugin.id))
        throw new Error(
          formatEditorMessage(localize.PluginAlreadyInstalled[editorLanguage], {
            id: plugin.id,
          }),
        );
      const savePlugin = window.electronWindow?.savePlugin;
      if (savePlugin) await savePlugin(plugin);
      state.userComponents.push(createPluginComponent(plugin));
      updatePluginSelection(plugin.id, true);
      renderCustomComponents();
      renderPluginPicker();
      renderPreview();
      scheduleSave();
      const importedMessage = savePlugin
        ? localize.PluginSavedToAppFolder[editorLanguage]
        : localize.PluginImportedForThisSession[editorLanguage];
      showToast(
        importedMessage.replace(
          "{title}",
          () =>
            localizePluginDefinition(plugin, editorLanguage).title,
        ),
      );
    } catch (error) {
      console.error("Unable to import plugin archive.", error);
      showToast(
        localize.UnableToImportPluginErrorMessage[editorLanguage].replace(
          "{error}",
          () => error.message,
        ),
      );
    }
  });
document
  .querySelector("#user-component-list")
  .addEventListener("click", (event) => {
    const useButton = event.target.closest("[data-insert-user-component]");
    if (useButton) {
      addElement("custom", null, null, useButton.dataset.insertUserComponent);
      return;
    }
    const editButton = event.target.closest("[data-edit-user-component]");
    if (editButton) {
      const component = state.userComponents.find(
        (item) => item.id === editButton.dataset.editUserComponent,
      );
      if (component) openCustomMarkupDialog(component);
      return;
    }
    const deleteButton = event.target.closest("[data-delete-user-component]");
    if (!deleteButton) return;
    const component = state.userComponents.find(
      (item) => item.id === deleteButton.dataset.deleteUserComponent,
    );
    if (!component) return;
    const used =
      state.elements.some(
        (element) => element.customComponentId === component.id,
      ) ||
      state.components.some((saved) =>
        saved.elements.some(
          (element) => element.customComponentId === component.id,
        ),
      );
    if (
      used &&
      !window.confirm(
        formatEditorMessage(
          localize.DeleteComponentUsedInstancesWarning[editorLanguage],
          { name: component.name },
        ),
      )
    )
      return;
    state.elements = state.elements.filter(
      (element) => element.customComponentId !== component.id,
    );
    state.components = state.components
      .map((saved) => ({
        ...saved,
        elements: saved.elements.filter(
          (element) => element.customComponentId !== component.id,
        ),
      }))
      .filter((saved) => saved.elements.length > 0);
    state.userComponents = state.userComponents.filter(
      (item) => item.id !== component.id,
    );
    clearElementSelection();
    renderPreview();
    renderCustomComponents();
    scheduleSave();
  });
document
  .querySelector("#user-component-list")
  .addEventListener("dragstart", (event) => {
    const button = event.target.closest("[data-insert-user-component]");
    if (!button) return;
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(
      "application/x-builder-custom-component",
      button.dataset.insertUserComponent,
    );
  });

document
  .querySelector("#save-selected-component")
  .addEventListener("click", openSaveComponentDialog);
document
  .querySelector("#custom-component-list")
  .addEventListener("click", (event) => {
    const useButton = event.target.closest("[data-insert-component]");
    if (useButton) {
      addSavedComponent(useButton.dataset.insertComponent);
      return;
    }
    const deleteButton = event.target.closest("[data-delete-component]");
    if (!deleteButton) return;
    state.components = state.components.filter(
      (component) => component.id !== deleteButton.dataset.deleteComponent,
    );
    renderCustomComponents();
    scheduleSave();
  });

document
  .querySelector("#element-palette")
  .addEventListener("dragstart", (event) => {
    const button = event.target.closest("[data-type]");
    if (!button) return;
    event.dataTransfer.effectAllowed = "copy";
    if (button.dataset.customComponentId) {
      event.dataTransfer.setData(
        "application/x-builder-custom-component",
        button.dataset.customComponentId,
      );
      return;
    }
    if (button.dataset.pluginId) {
      event.dataTransfer.setData(
        "application/x-builder-custom-component",
        button.dataset.pluginId,
      );
      return;
    }
    event.dataTransfer.setData(
      "application/x-builder-element",
      button.dataset.type,
    );
  });

preview.addEventListener("click", (event) => {
  if (!event.isTrusted && event.target.closest("[data-plugin-id]")) return;
  const tabButton = event.target.closest("[data-tab-target]");
  if (tabButton) {
    const tabs = state.elements.find(
      (element) =>
        element.id === tabButton.closest("[data-id]")?.dataset.id &&
        element.type === "tabs",
    );
    if (tabs) {
      tabs.activeTabId = tabButton.dataset.tabTarget;
      renderPreview(false);
      scheduleSave();
    }
    return;
  }
  const accordionSummary = event.target.closest(
    ".preview-content.type-accordion > summary",
  );
  if (accordionSummary) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      selectElement(accordionSummary.parentElement.dataset.id, true, true);
      return;
    }
    const accordion = state.elements.find(
      (element) =>
        element.id === accordionSummary.parentElement.dataset.id &&
        element.type === "accordion",
    );
    if (!accordion) return;
    accordion.accordionOpen = !accordion.accordionOpen;
    selectElement(accordion.id);
    scheduleSave();
    return;
  }
  const chip = event.target.closest(".preview-content.type-chip");
  if (chip) {
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      selectElement(chip.dataset.id, true, true);
      return;
    }
    const element = state.elements.find(
      (candidate) => candidate.id === chip.dataset.id,
    );
    if (!element) return;
    element.chipSelected = !element.chipSelected;
    selectElement(element.id);
    scheduleSave();
    return;
  }
  const node = event.target.closest(".preview-content");
  if (node) {
    if (
      state.previewSheetId &&
      !node.closest(".preview-sheet") &&
      !node.classList.contains("type-sheet")
    )
      state.previewSheetId = null;
    selectElement(
      node.dataset.id,
      true,
      event.ctrlKey || event.metaKey || event.shiftKey,
    );
  }
});

document.querySelector(".canvas-scroll").addEventListener("click", (event) => {
  if (event.target.closest(".preview-content")) return;
  clearElementSelection();
  state.previewSheetId = null;
  renderPreview();
});

document.querySelector("#element-tree").addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-toggle-tree-element]");
  if (toggle) {
    const elementId = toggle.dataset.toggleTreeElement;
    if (collapsedTreeElements.has(elementId))
      collapsedTreeElements.delete(elementId);
    else collapsedTreeElements.add(elementId);
    renderElementTree();
    return;
  }
  const select = event.target.closest("[data-select-tree-element]");
  if (select) {
    const elementId = select.dataset.selectTreeElement;
    selectElement(
      elementId,
      true,
      event.ctrlKey || event.metaKey || event.shiftKey,
    );
    return;
  }
});

const elementTree = document.querySelector("#element-tree");
elementTree.addEventListener("dragstart", (event) => {
  const select = event.target.closest("[data-select-tree-element]");
  if (!select) return;
  state.draggingId = select.dataset.selectTreeElement;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(
    "application/x-builder-existing",
    state.draggingId,
  );
  requestAnimationFrame(() =>
    select.closest(".element-tree-row")?.classList.add("is-dragging"),
  );
});

elementTree.addEventListener("dragover", (event) => {
  const draggedId = state.draggingId;
  if (!draggedId) return;
  event.preventDefault();
  elementTree
    .querySelectorAll(".drop-before, .drop-after, .drop-into")
    .forEach((row) =>
      row.classList.remove("drop-before", "drop-after", "drop-into"),
    );

  const row = event.target.closest(".element-tree-row");
  if (!row || row.dataset.treeElementId === draggedId) return;
  const target = state.elements.find(
    (element) => element.id === row.dataset.treeElementId,
  );
  if (!target) return;

  const rect = row.getBoundingClientRect();
  const position = (event.clientY - rect.top) / rect.height;
  if (isContainer(target) && position >= 0.25 && position <= 0.75) {
    row.classList.add("drop-into");
  } else {
    const placeAfter = position >= (isContainer(target) ? 0.75 : 0.5);
    row.classList.add(placeAfter ? "drop-after" : "drop-before");
  }
});

elementTree.addEventListener("dragleave", (event) => {
  const row = event.target.closest(".element-tree-row");
  if (row && !row.contains(event.relatedTarget))
    row.classList.remove("drop-before", "drop-after", "drop-into");
});

elementTree.addEventListener("drop", (event) => {
  const draggedId =
    event.dataTransfer.getData("application/x-builder-existing") ||
    state.draggingId;
  if (!draggedId) return;
  event.preventDefault();

  const row = event.target.closest(".element-tree-row");
  if (!row) {
    moveElement(draggedId, null, true);
    return;
  }

  const targetId = row.dataset.treeElementId;
  const target = state.elements.find((element) => element.id === targetId);
  if (!target || targetId === draggedId) return;
  const rect = row.getBoundingClientRect();
  const position = (event.clientY - rect.top) / rect.height;
  const dropIntoContainer =
    isContainer(target) && position >= 0.25 && position <= 0.75;
  const placeAfter = position >= (isContainer(target) ? 0.75 : 0.5);
  moveElement(
    draggedId,
    targetId,
    placeAfter,
    null,
    dropIntoContainer,
  );
});

elementTree.addEventListener("dragend", () => {
  state.draggingId = null;
  elementTree.querySelectorAll(".element-tree-row").forEach((row) => {
    row.classList.remove(
      "is-dragging",
      "drop-before",
      "drop-after",
      "drop-into",
    );
  });
});

preview.addEventListener("keydown", (event) => {
  const node = event.target.closest(".preview-content");
  if (
    node &&
    event.target === node &&
    (event.key === "Enter" || event.key === " ")
  ) {
    event.preventDefault();
    selectElement(
      node.dataset.id,
      true,
      event.ctrlKey || event.metaKey || event.shiftKey,
    );
  }
});

preview.addEventListener("dragstart", (event) => {
  const node = event.target.closest(".preview-content");
  if (!node) return;
  state.draggingId = node.dataset.id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-builder-existing", node.dataset.id);
  requestAnimationFrame(() => node.classList.add("is-dragging"));
});

preview.addEventListener("dragover", (event) => {
  const target = event.target.closest(".preview-content");
  preview
    .querySelectorAll(".drop-target, .drop-before, .drop-after")
    .forEach((node) =>
      node.classList.remove("drop-target", "drop-before", "drop-after"),
    );
  if (!target) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  const targetElement = state.elements.find(
    (element) => element.id === target.dataset.id,
  );
  if (isContainer(targetElement)) {
    target.classList.add("drop-target");
    return;
  }

  const parentNode = target.parentElement.closest(".preview-content");
  if (parentNode) parentNode.classList.add("drop-target");
  const rect = target.getBoundingClientRect();
  const placeAfter = event.clientY > rect.top + rect.height / 2;
  target.classList.toggle("drop-after", placeAfter);
  target.classList.toggle("drop-before", !placeAfter);
});

preview.addEventListener("dragleave", (event) => {
  if (!preview.contains(event.relatedTarget)) {
    preview
      .querySelectorAll(".drop-target, .drop-before, .drop-after")
      .forEach((node) =>
        node.classList.remove("drop-target", "drop-before", "drop-after"),
      );
  }
});

preview.addEventListener("drop", (event) => {
  event.preventDefault();
  const target = event.target.closest(".preview-content");
  const customComponentId = event.dataTransfer.getData(
    "application/x-builder-custom-component",
  );
  if (customComponentId) {
    const targetElement = state.elements.find(
      (element) => element.id === target?.dataset.id,
    );
    if (isContainer(targetElement))
      addElement("custom", null, targetElement.id, customComponentId);
    else
      addElement("custom", targetElement?.id || null, null, customComponentId);
    return;
  }
  const newType = event.dataTransfer.getData("application/x-builder-element");

  if (newType && Object.hasOwn(typeNames, newType)) {
    const targetElement = state.elements.find(
      (element) => element.id === target?.dataset.id,
    );
    if (isContainer(targetElement)) addElement(newType, null, targetElement.id);
    else addElement(newType, targetElement?.id || null);
    return;
  }

  const draggedId = event.dataTransfer.getData(
    "application/x-builder-existing",
  );
  if (!draggedId) return;
  if (!target) {
    moveElement(draggedId, null, true);
    return;
  }

  const rect = target.getBoundingClientRect();
  moveElement(
    draggedId,
    target.dataset.id,
    event.clientY > rect.top + rect.height / 2,
  );
});

preview.addEventListener("dragend", () => {
  state.draggingId = null;
  preview.querySelectorAll(".preview-content").forEach((node) => {
    node.classList.remove(
      "is-dragging",
      "drop-target",
      "drop-before",
      "drop-after",
    );
  });
});

function renameElementId(element, nextId) {
  const previousId = element.id;
  if (previousId === nextId) return;
  const updateExtraTokens = (value) => {
    if (typeof value === "string")
      return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (token, reference) => {
        const extra = reference.match(
          /^(.+)\.extra\.([A-Za-z_][A-Za-z0-9_-]*)$/,
        );
        return extra && extra[1] === previousId
          ? token.replace(reference, `${nextId}.extra.${extra[2]}`)
          : token;
      });
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        value[index] = updateExtraTokens(item);
      });
      return value;
    }
    if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, child]) => {
        value[key] = updateExtraTokens(child);
      });
    }
    return value;
  };
  const replaceTargetIds = (value) => {
    if (Array.isArray(value)) {
      value.forEach(replaceTargetIds);
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, child]) => {
        if (
          ["elementId", "targetElementId", "sheetId", "toastId"].includes(
            key,
          ) &&
          child === previousId
        )
          value[key] = nextId;
        else replaceTargetIds(child);
      });
    }
  };
  element.id = nextId;
  state.elements.forEach((candidate) => {
    if (candidate.parentId === previousId) candidate.parentId = nextId;
    if (candidate.activeTabId === previousId) candidate.activeTabId = nextId;
    if (
      candidate.binding?.source === "extra" &&
      typeof candidate.binding.path === "string" &&
      candidate.binding.path.startsWith(`${previousId}.extra.`)
    )
      candidate.binding.path = `${nextId}${candidate.binding.path.slice(previousId.length)}`;
    candidate.extraData = updateExtraTokens(candidate.extraData);
    replaceTargetIds(candidate.action);
    updateExtraTokens(candidate.action);
  });
  replaceTargetIds(state.settings.appLoadHandlers);
  updateExtraTokens(state.settings.appLoadHandlers);
  updateExtraTokens(state.requests);
  state.variables.forEach((variable) => {
    if (variable.elementId === previousId) variable.elementId = nextId;
  });
  updateExtraTokens(state.variables);
  state.requests.forEach((request) => {
    if (request.buttonId === previousId) request.buttonId = nextId;
  });
  state.selectedIds = state.selectedIds.map((id) =>
    id === previousId ? nextId : id,
  );
  state.selectedId = nextId;
}

function syncSelectedSharedProperty(element, control) {
  const selectedElements = state.selectedIds
    .map((id) =>
      state.elements.find(
        (candidate) =>
          candidate.id === id && candidate.pageId === state.currentPageId,
      ),
    )
    .filter(Boolean);
  if (!selectedElements.includes(element)) selectedElements.push(element);
  if (selectedElements.length < 2) return;

  const stylePropertyByControl = {
    "property-color": "color",
    "property-background": "background",
    "property-font-size": "fontSize",
    "property-width": "width",
    "property-height": "height",
    "property-border-width": "borderWidth",
    "property-border-color": "borderColor",
    "property-border-radius": "borderRadius",
    "property-align": "align",
  };
  const styleProperty =
    control.dataset.elementSpacing ||
    stylePropertyByControl[control.id] ||
    (control.id === "property-background-transparent" ? "background" : "");

  selectedElements.forEach((selected) => {
    if (selected === element) return;
    if (control.id === "property-content") {
      selected.localizations = normalizeLocalizedContent(
        selected.localizations,
      );
      selected.localizations[state.settings.appLanguage] =
        element.localizations[state.settings.appLanguage];
      return;
    }
    if (control.id === "property-class-name") {
      selected.className = element.className;
      return;
    }
    if (control.id === "property-hidden") {
      selected.hidden = element.hidden;
      return;
    }
    if (control.id === "property-ripple-effect") {
      selected.rippleEffect = element.rippleEffect === true;
      return;
    }
    if (control.id === "property-variant") {
      if (getVariantOptions(selected.type).includes(element.styles.variant))
        selected.styles.variant = element.styles.variant;
      return;
    }
    if (control.id === "property-horizontal-alignment") {
      if (getAbsoluteLayoutChildAlignment(selected))
        selected.horizontalAlignment = element.horizontalAlignment;
      return;
    }
    if (control.id === "property-vertical-alignment") {
      if (getAbsoluteLayoutChildAlignment(selected))
        selected.verticalAlignment = element.verticalAlignment;
      return;
    }
    if (styleProperty) selected.styles[styleProperty] = element.styles[styleProperty];
  });
}

function updateSelectedElement(event) {
  const element = state.elements.find((item) => item.id === state.selectedId);
  if (!element) return;

  if (event.target.id === "property-element-id") {
    const nextId = event.target.value;
    const reservedIds = new Set([
      "request-status",
      "app-message-dialog",
      "app-message-title",
      "app-message-content",
      "app-message-close",
    ]);
    if (
      !/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(nextId) ||
      reservedIds.has(nextId) ||
      state.elements.some(
        (candidate) => candidate !== element && candidate.id === nextId,
      )
    ) {
      if (event.type === "change") {
        event.target.value = element.id;
        showToast(localize.EnterUniqueElementID[editorLanguage]);
      }
      return;
    }
    renameElementId(element, nextId);
    renderEventHandlers(element.action || {});
    renderPreview(false);
    scheduleSave();
    return;
  }

  const eventHandlerField = event.target.closest("[data-event-handler-field]");
  if (eventHandlerField) {
    const index = Number(eventHandlerField.dataset.eventHandlerIndex);
    const field = eventHandlerField.dataset.eventHandlerField;
    const isPrimary = eventHandlerField.dataset.eventHandlerPrimary === "true";
    const handlers = Array.isArray(element.action?.handlers)
      ? element.action.handlers.map((handler) => ({ ...handler }))
      : [];
    const handler = isPrimary
      ? { ...(element.action || {}) }
      : handlers[index - 1];
    if (!Number.isInteger(index) || !handler) return;
    handler[field] = eventHandlerField.value;
    if (field === "targetPageId") updateActionElementPage(handler);
    if (
      ["targetElementId", "targetPageId"].includes(field) &&
      handler.type === "changeProperty"
    )
      normalizeChangePropertyAction(handler);
    if (
      field === "type" ||
      (field === "functionSource" && handler.type === "function")
    )
      initializeEventHandler(handler);
    if (field === "functionSource" && handler.functionSource === "asset")
      handler.scriptAssetId ||= state.assets.find(isJavaScriptAsset)?.id || "";
    element.action = isPrimary
      ? { ...handler, handlers }
      : {
        ...(element.action || { type: "none", event: "click" }),
        handlers: handlers.map((item, handlerIndex) =>
          handlerIndex === index - 1 ? handler : item,
        ),
      };
    if (
      [
        "event",
        "type",
        "property",
        "targetElementId",
        "targetPageId",
        "functionSource",
      ].includes(field)
    )
      renderEventHandlers(element.action);
    renderPreview(false);
    scheduleSave();
    return;
  }

  const extraDataField = event.target.closest("[data-extra-data-field]");
  if (extraDataField) {
    const index = Number(extraDataField.dataset.extraDataIndex);
    const field = extraDataField.dataset.extraDataField;
    const entry = element.extraData?.[index];
    if (!entry || !["key", "value"].includes(field)) return;
    entry[field] = extraDataField.value;
    if (field === "key" && event.type === "change") {
      const duplicate = element.extraData.some(
        (item, itemIndex) => itemIndex !== index && item.key === entry.key,
      );
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(entry.key) || duplicate) {
        entry.key = `extra_${index + 1}`;
        extraDataField.value = entry.key;
        showToast(localize.UseUniqueNameWithoutDots[editorLanguage]);
      }
      renderProperties();
    }
    renderPreview(false);
    scheduleSave();
    return;
  }

  const spacingField = event.target.closest("[data-element-spacing]");
  if (spacingField) {
    const key = spacingField.dataset.elementSpacing;
    element.styles[key] = clampNumber(
      spacingField.value,
      0,
      key.startsWith("padding") ? 48 : 100,
      0,
    );
    syncSelectedSharedProperty(element, spacingField);
    renderPreview(false);
    scheduleSave();
    return;
  }

  const eventConditionField = event.target.closest(
    "[data-event-condition-field]",
  );
  if (eventConditionField) {
    const index = Number(eventConditionField.dataset.eventHandlerIndex);
    const isPrimary =
      eventConditionField.dataset.eventHandlerPrimary === "true";
    const action = isPrimary
      ? element.action
      : element.action?.handlers?.[index - 1];
    if (!action || action.type !== "condition") return;
    const conditionAction = getConditionOwnerForField(
      action,
      eventConditionField,
    );
    if (!conditionAction || conditionAction.type !== "condition") return;
    const fieldMap = {
      "property-condition-source": "source",
      "property-condition-request": "requestId",
      "property-condition-path": "path",
      "property-condition-object-path": "objectPath",
      "property-condition-static-value": "sourceValue",
      "property-condition-variable": "variableName",
      "property-condition-twk-field": "fieldKey",
      "property-condition-form-field": "fieldName",
      "property-condition-item-path": "itemPath",
      "property-condition-extra": "extraPath",
      "property-condition-element-page": "elementPageId",
      "property-condition-element": "elementId",
      "property-condition-element-property": "property",
      "property-condition-operator": "operator",
      "property-condition-value": "value",
    };
    const conditionField =
      fieldMap[eventConditionField.dataset.eventConditionField];
    if (!conditionField) return;
    conditionAction.condition = {
      ...(conditionAction.condition || {}),
      [conditionField]:
        conditionField === "fieldName"
          ? eventConditionField.value.trim()
          : eventConditionField.value,
    };
    if (
      eventConditionField.dataset.eventConditionField ===
      "property-condition-element-page"
    )
      conditionAction.condition.elementId =
        getElementsOnPage(state, eventConditionField.value)[0]?.id || "";
    if (
      [
        "property-condition-source",
        "property-condition-operator",
        "property-condition-element-page",
        "property-condition-element",
      ].includes(eventConditionField.dataset.eventConditionField)
    )
      renderEventHandlers(element.action);
    renderPreview(false);
    scheduleSave();
    return;
  }

  const conditionalActionField = event.target.closest(
    "[data-condition-action]",
  );
  if (conditionalActionField) {
    const branch = conditionalActionField.dataset.conditionBranch;
    const index = Number(conditionalActionField.dataset.actionIndex);
    if (
      !["actions", "elseActions"].includes(branch) ||
      !Number.isInteger(index)
    )
      return;
    const handlerIndex = Number(
      conditionalActionField.dataset.eventHandlerIndex,
    );
    const isEventHandlerAction =
      conditionalActionField.dataset.eventHandlerIndex !== undefined;
    const conditionOwner = isEventHandlerAction
      ? conditionalActionField.dataset.eventHandlerPrimary === "true"
        ? element.action
        : element.action?.handlers?.[handlerIndex - 1]
      : element.action;
    if (!isWorkflowBranchAction(conditionOwner)) return;
    const actionPath = parseConditionActionPath(
      conditionalActionField.dataset.conditionActionPath,
    );
    if (
      conditionalActionField.closest(".condition-action-nested-condition") &&
      !conditionalActionField.dataset.conditionActionPath
    )
      return;
    const targetAction = getConditionActionAtPath(conditionOwner, actionPath);
    if (!targetAction) return;
    targetAction[conditionalActionField.dataset.conditionAction] =
      conditionalActionField.value;
    if (
      conditionalActionField.dataset.conditionAction === "targetPageId"
    )
      updateActionElementPage(targetAction);
    if (
      ["targetElementId", "targetPageId"].includes(
        conditionalActionField.dataset.conditionAction,
      ) &&
      targetAction.type === "changeProperty"
    )
      normalizeChangePropertyAction(targetAction);
    if (
      conditionalActionField.dataset.conditionAction === "type" ||
      (conditionalActionField.dataset.conditionAction === "functionSource" &&
        targetAction.type === "function")
    ) {
      initializeEventHandler(targetAction);
    }
    delete conditionOwner.effect;
    if (
      ["type", "property", "targetElementId", "functionSource"].includes(
        conditionalActionField.dataset.conditionAction,
      ) ||
      conditionalActionField.dataset.conditionAction === "targetPageId"
    )
      renderEventHandlers(element.action);
    renderPreview(false);
    scheduleSave();
    return;
  }

  switch (event.target.id) {
    case "property-content":
      element.localizations = normalizeLocalizedContent(element.localizations);
      element.localizations[state.settings.appLanguage] = event.target.value;
      break;
    case "property-card-header":
      element.cardHeader = event.target.value;
      break;
    case "property-card-footer":
      element.cardFooter = event.target.value;
      break;
    case "property-card-slot":
      element.cardSlot = event.target.value === "footer" ? "footer" : "content";
      break;
    case "property-class-name": {
      const normalized = normalizeClassNames(event.target.value);
      if (
        event.target.value.trim() &&
        normalized !== event.target.value.trim().replace(/\s+/g, " ")
      ) {
        if (event.type === "change") {
          showToast(localize.UseValidCSSClassNamesSeparatedBySpaces[editorLanguage]);
          event.target.value = element.className || "";
        }
        return;
      }
      element.className = normalized;
      break;
    }
    case "property-icon-class":
      if (!event.target.value && element.type === "button") {
        element.iconClass = "";
        break;
      }
      if (!/^fa-[a-z0-9-]+$/.test(event.target.value)) {
        if (event.type === "change") {
          showToast(localize.EnterAFontAwesomeIconNameSuchAsFaStar[editorLanguage]);
          event.target.value =
            element.iconClass || (element.type === "button" ? "" : "fa-star");
        }
        return;
      }
      element.iconClass = event.target.value;
      break;
    case "property-image-url":
      element.imageUrl = event.target.value;
      element.assetId = "";
      document.querySelector("#property-image-asset").value = "";
      break;
    case "property-image-asset": {
      const asset = getAsset(event.target.value);
      element.assetId = asset?.type.startsWith("image/") ? asset.id : "";
      if (element.assetId) {
        element.imageUrl = "";
        document.querySelector("#property-image-url").value = "";
      }
      break;
    }
    case "property-image-fit":
      element.imageFit = event.target.value === "contain" ? "contain" : "cover";
      break;
    case "property-color":
      element.styles.color = safeColor(event.target.value, "#263b35");
      updateColorLabels();
      break;
    case "property-background":
      element.styles.background = safeColor(event.target.value, "#ffffff");
      document.querySelector("#property-background-transparent").checked =
        false;
      document.querySelector("#property-background").disabled = false;
      updateColorLabels();
      break;
    case "property-background-transparent":
      element.styles.background = event.target.checked
        ? "transparent"
        : safeColor(
          document.querySelector("#property-background").value,
          "#ffffff",
        );
      document.querySelector("#property-background").disabled =
        event.target.checked;
      updateColorLabels();
      break;
    case "property-ripple-effect":
      element.rippleEffect = event.target.checked;
      break;
    case "property-variant":
      element.styles.variant = getVariantOptions(element.type).includes(
        event.target.value,
      )
        ? event.target.value
        : getVariantOptions(element.type)[0] || "primary";
      document.querySelector("#background-color-field").hidden =
        element.styles.variant !== "custom";
      document.querySelector("#background-transparent-field").hidden =
        element.styles.variant !== "custom";
      break;
    case "property-border-width":
      element.styles.borderWidth = clampNumber(event.target.value, 0, 12, 0);
      break;
    case "property-border-color":
      element.styles.borderColor = safeColor(event.target.value, "#dbe5e1");
      break;
    case "property-border-radius":
      element.styles.borderRadius = clampNumber(event.target.value, 0, 100, 0);
      break;
    case "property-font-size":
      element.styles.fontSize = clampNumber(event.target.value, 14, 36, 14);
      break;
    case "property-width":
    case "property-height": {
      const dimension = normalizeDimension(event.target.value);
      if (event.target.value.trim() && !dimension) {
        if (event.type === "change") {
          showToast(localize.EnterAutoOrAValidValueInPxRemEmVwOrVh[editorLanguage]);
          event.target.value = normalizeDimension(
            element.styles[
            event.target.id === "property-width" ? "width" : "height"
            ],
          );
        }
        return;
      }
      element.styles[
        event.target.id === "property-width" ? "width" : "height"
      ] = dimension;
      break;
    }
    case "property-align":
      element.styles.align = ["start", "center", "end"].includes(
        event.target.value,
      )
        ? event.target.value
        : "start";
      break;
    case "property-horizontal-alignment":
      element.horizontalAlignment = ["start", "center", "end"].includes(
        event.target.value,
      )
        ? event.target.value
        : "start";
      break;
    case "property-vertical-alignment":
      element.verticalAlignment = ["top", "center", "bottom"].includes(
        event.target.value,
      )
        ? event.target.value
        : "top";
      break;
    case "property-layout-direction":
      element.layout = {
        ...element.layout,
        direction: event.target.value === "row" ? "row" : "column",
      };
      break;
    case "property-layout-align":
      element.layout = {
        ...element.layout,
        align: ["start", "center", "end", "stretch"].includes(
          event.target.value,
        )
          ? event.target.value
          : "stretch",
      };
      break;
    case "property-layout-justify":
      element.layout = {
        ...element.layout,
        justify: ["start", "center", "end", "space-between"].includes(
          event.target.value,
        )
          ? event.target.value
          : "start",
      };
      break;
    case "property-layout-gap":
      element.layout = {
        ...element.layout,
        gap: clampNumber(event.target.value, 0, 48, 8),
      };
      break;
    case "property-grid-columns":
      element.layout = {
        ...element.layout,
        columns: clampNumber(event.target.value, 1, 12, 2),
      };
      break;
    case "property-scroll-axis":
      element.scroll = {
        ...element.scroll,
        axis: ["vertical", "horizontal", "both"].includes(event.target.value)
          ? event.target.value
          : "vertical",
      };
      break;
    case "property-field-name":
      element.fieldName = event.target.value;
      break;
    case "property-input-type":
      element.inputType = inputTypes.includes(event.target.value)
        ? event.target.value
        : "text";
      break;
    case "property-input-min":
      element.min = event.target.value;
      break;
    case "property-input-max":
      element.max = event.target.value;
      break;
    case "property-disabled":
      element.disabled = event.target.checked;
      break;
    case "property-progress-mode":
      element.progressMode =
        event.target.value === "determinate" ? "determinate" : "indeterminate";
      document.querySelector("#progress-value-fields").hidden =
        element.progressMode !== "determinate";
      break;
    case "property-progress-value":
      element.progressValue = clampNumber(
        event.target.value,
        0,
        clampNumber(element.progressMax, 1, 1000000, 100),
        0,
      );
      break;
    case "property-progress-max":
      element.progressMax = clampNumber(event.target.value, 1, 1000000, 100);
      element.progressValue = clampNumber(
        element.progressValue,
        0,
        element.progressMax,
        0,
      );
      break;
    case "property-hidden":
      element.hidden = event.target.checked;
      break;
    case "property-list-source":
      element.listSource = { ...element.listSource, type: event.target.value };
      document.querySelector("#list-endpoint-fields").hidden =
        event.target.value !== "endpoint";
      document.querySelector("#list-twk-fields").hidden =
        event.target.value !== "twk";
      document.querySelector("#data-source-static-options").hidden =
        event.target.value !== "static";
      document.querySelector("#list-static-options").hidden =
        event.target.value !== "static";
      if (event.target.value === "endpoint" && !state.requests.length)
        showToast(localize.AddAnAPIRequestFirstToPopulateTheList[editorLanguage]);
      break;
    case "property-collection-source":
      element.listSource =
        event.target.value === "endpoint"
          ? normalizeCollectionDataSource({
            type: "endpoint",
            requestId: document.querySelector(
              "#property-collection-endpoint",
            ).value,
            path: "",
          })
          : event.target.value === "twk"
            ? normalizeCollectionDataSource({
              type: "twk",
              field: document.querySelector(
                "#property-collection-twk-field",
              ).value,
            })
            : normalizeCollectionDataSource({ type: "static" });
      document.querySelector("#collection-endpoint-fields").hidden =
        event.target.value !== "endpoint";
      document.querySelector("#collection-twk-fields").hidden =
        event.target.value !== "twk";
      document.querySelector("#collection-item-fields").hidden =
        event.target.value !== "static";
      if (event.target.value === "endpoint" && !state.requests.length)
        showToast(localize.apirequestpopulatecollection[editorLanguage]);
      break;
    case "property-collection-endpoint":
      element.listSource = normalizeCollectionDataSource({
        type: "endpoint",
        requestId: event.target.value,
        path:
          element.listSource?.type === "endpoint"
            ? element.listSource.path
            : "",
      });
      break;
    case "property-collection-path":
      if (element.listSource?.type === "endpoint")
        element.listSource = normalizeCollectionDataSource({
          type: "endpoint",
          requestId: element.listSource.requestId,
          path: event.target.value,
        });
      break;
    case "property-collection-twk-field":
      element.listSource = normalizeCollectionDataSource({
        type: "twk",
        field: event.target.value,
      });
      break;
    case "property-collection-items":
      if (event.type === "input") return;
      try {
        const items = JSON.parse(event.target.value);
        if (
          !Array.isArray(items) ||
          items.some(
            (item) => !item || typeof item !== "object" || Array.isArray(item),
          )
        ) {
          throw new Error("Collection items must be an array of objects.");
        }
        element.collectionItems = items;
      } catch {
        showToast(localize.EnterAValidJSONArrayOfItemObjects[editorLanguage]);
        return;
      }
      break;
    case "property-list-endpoint":
      element.listSource = {
        ...element.listSource,
        type: "endpoint",
        requestId: event.target.value,
      };
      break;
    case "property-list-path":
      element.listSource = { ...element.listSource, path: event.target.value };
      break;
    case "property-list-twk-field":
      element.listSource = {
        ...element.listSource,
        type: "twk",
        field: event.target.value,
      };
      break;
    case "property-list-label-path":
      element.listSource = {
        ...element.listSource,
        labelPath: event.target.value,
      };
      break;
    case "property-list-value-path":
      element.listSource = {
        ...element.listSource,
        valuePath: event.target.value,
      };
      break;
    case "property-options":
      if (event.type === "input") return;
      try {
        const options = JSON.parse(event.target.value);
        if (
          !Array.isArray(options) ||
          (element.type !== "collection" &&
            options.some(
              (option) =>
                !option ||
                typeof option !== "object" ||
                Array.isArray(option) ||
                !Object.hasOwn(option, "value"),
            ))
        ) {
          throw new Error(
            "Options must be a JSON array with a value for each option.",
          );
        }
        if (element.type === "collection") element.collectionItems = options;
        else
          element.options = normalizeOptions(
            options,
            element.type === "radio" || !element.multiple,
          );
      } catch (error) {
        showToast(localize.InvalidJSONOptionsEnterAnArrayOfOptions[editorLanguage]);
        return;
      }
      break;
    case "property-list-options":
      if (event.type === "input") return;
      try {
        const options = JSON.parse(event.target.value);
        if (
          !Array.isArray(options) ||
          options.some(
            (option) =>
              !option ||
              typeof option !== "object" ||
              Array.isArray(option) ||
              !Object.hasOwn(option, "value"),
          )
        ) {
          throw new Error(
            "List options must be a JSON array with a value for each option.",
          );
        }
        element.options = normalizeOptions(options, !element.multiple);
      } catch {
        showToast(localize.InvalidJSONOptionsEnterAnArrayOfOptions[editorLanguage]);
        return;
      }
      break;
    case "property-multiple":
      element.multiple = event.target.checked;
      if (!element.multiple)
        element.options = normalizeOptions(element.options, true);
      break;
    case "property-file-picker-mode":
      element.filePickerMode =
        event.target.value === "multiple" ? "multiple" : "single";
      break;
    case "property-file-picker-appearance":
      element.filePickerAppearance =
        event.target.value === "dropzone" ? "dropzone" : "button";
      break;
    case "property-checked":
      element.checked = event.target.checked;
      break;
    case "property-checkbox-value":
      if (event.type === "input") return;
      try {
        element.fieldValue = JSON.parse(event.target.value);
      } catch {
        showToast(localize.EnterValidElementJSONValue[editorLanguage]);
        return;
      }
      break;
    case "property-item-label-path":
      element.itemLabelPath = event.target.value.trim();
      break;
    case "property-item-value-path":
      element.itemValuePath = event.target.value.trim();
      break;
    case "property-binding-extra":
      if (event.target.value)
        element.binding = { source: "extra", path: event.target.value };
      break;
    case "property-binding-source":
      if (event.target.value === "static") {
        element.binding = null;
      } else if (event.target.value === "form") {
        const formFieldSelect = document.querySelector(
          "#property-binding-form-field",
        );
        const fieldName = populateFormFieldSelect(
          formFieldSelect,
          element.pageId,
          formFieldSelect.value,
        ).some((candidate) => getFormName(candidate) === formFieldSelect.value)
          ? formFieldSelect.value
          : "";
        if (fieldName) {
          element.binding = { source: "form", path: fieldName };
        } else {
          element.binding = null;
          showToast(localize.AddAPageFieldToUseAsASource[editorLanguage]);
        }
      } else if (event.target.value === "twk") {
        element.binding = {
          source: "twk",
          path: document.querySelector("#property-twk-field").value,
        };
      } else if (event.target.value === "item" && isInsideCollection(element)) {
        element.binding = {
          source: "item",
          path: document.querySelector("#property-item-binding-path").value,
        };
      } else if (event.target.value === "endpoint" && state.requests.length) {
        element.binding = {
          source: "endpoint",
          requestId: document.querySelector("#property-binding-endpoint").value,
          path: document.querySelector("#property-binding-path").value,
        };
      } else if (event.target.value === "variable" && state.variables.length) {
        element.binding = {
          source: "variable",
          path: document.querySelector("#property-binding-variable").value,
        };
      } else if (
        event.target.value === "extra" &&
        document.querySelector("#property-binding-extra").value
      ) {
        element.binding = {
          source: "extra",
          path: document.querySelector("#property-binding-extra").value,
        };
      } else if (
        event.target.value === "element" &&
        document.querySelector("#property-binding-element").value
      ) {
        element.binding = {
          source: "element",
          elementId: document.querySelector("#property-binding-element").value,
          property: document.querySelector("#property-binding-element-property")
            .value,
        };
      } else {
        element.binding = null;
        showToast(localize.ChooseValidDataBindingSource[editorLanguage]);
      }
      document.querySelector("#extra-binding-fields").hidden =
        element.binding?.source !== "extra";
      document.querySelector("#twk-binding-fields").hidden =
        element.binding?.source !== "twk";
      document.querySelector("#endpoint-binding-fields").hidden =
        element.binding?.source !== "endpoint";
      document.querySelector("#item-binding-fields").hidden =
        element.binding?.source !== "item";
      document.querySelector("#form-binding-fields").hidden =
        element.binding?.source !== "form";
      document.querySelector("#variable-binding-fields").hidden =
        element.binding?.source !== "variable";
      document.querySelector("#element-binding-fields").hidden =
        element.binding?.source !== "element";
      document.querySelector("#radio-static-options").hidden =
        element.type !== "radio" || event.target.value !== "static";
      break;
    case "property-binding-variable":
      element.binding = {
        source: "variable",
        path: event.target.value,
      };
      break;
    case "property-item-binding-path":
      if (element.binding?.source === "item")
        element.binding.path = event.target.value;
      break;
    case "property-binding-form-field":
      if (event.target.value)
        element.binding = { source: "form", path: event.target.value };
      break;
    case "property-twk-field":
      element.binding = { source: "twk", path: event.target.value };
      break;
    case "property-binding-endpoint":
      if (element.binding?.source === "endpoint")
        element.binding.requestId = event.target.value;
      break;
    case "property-binding-path":
      if (element.binding?.source === "endpoint")
        element.binding.path = event.target.value;
      break;
    case "property-binding-object-path":
      if (element.binding)
        element.binding.objectPath = event.target.value.trim();
      break;
    case "property-binding-element": {
      const sourceElement = state.elements.find(
        (candidate) => candidate.id === event.target.value,
      );
      const property = document.querySelector(
        "#property-binding-element-property",
      );
      const previousProperty = property.value;
      property.replaceChildren();
      getElementSourcePropertyOptions(sourceElement || { type: "" }).forEach(
        ([label, value]) => property.add(new Option(label, value)),
      );
      property.value = [...property.options].some(
        (option) => option.value === previousProperty,
      )
        ? previousProperty
        : property.options[0]?.value || "";
      element.binding = {
        source: "element",
        elementId: event.target.value,
        property: property.value,
      };
      break;
    }
    case "property-binding-element-property":
      if (element.binding?.source === "element")
        element.binding.property = event.target.value;
      break;
    default:
      return;
  }

  if (element.binding) {
    const objectPath = document
      .querySelector("#property-binding-object-path")
      .value.trim();
    if (objectPath) element.binding.objectPath = objectPath;
    else delete element.binding.objectPath;
  }
  syncSelectedSharedProperty(element, event.target);
  updateBindingObjectPathVisibility(element);
  renderPreview(false);
  scheduleSave();
}

function updatePluginProperty(event) {
  const field = event.target.closest("[data-plugin-property]");
  if (!field) return false;
  const element = state.elements.find((item) => item.id === state.selectedId);
  const component = element
    ? state.userComponents.find(
      (item) => item.id === element.customComponentId,
    )
    : null;
  const plugin = component ? getPluginDefinition(component) : null;
  const property = plugin?.properties.find(
    (item) => item.key === field.dataset.pluginProperty,
  );
  if (!element || !plugin || !property) return true;

  const value =
    property.type === "boolean"
      ? field.checked
      : property.type === "number"
        ? field.valueAsNumber
        : field.value;
  element.pluginProperties = normalizePluginProperties(plugin, {
    ...element.pluginProperties,
    [property.key]: value,
  });
  renderPreview(false);
  scheduleSave();
  return true;
}

propertyForm.addEventListener("input", (event) => {
  if (updatePluginProperty(event)) return;
  const target = event.target;
  if (
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLInputElement &&
      ["checkbox", "radio"].includes(target.type)) ||
    target.id === "property-element-id" ||
    target.matches('[data-extra-data-field="key"]')
  )
    return;
  updateSelectedElement(event);
});
propertyForm.addEventListener("click", (event) => {
  const button = event.target.closest(
    ".layout-alignment-buttons [data-layout-value]",
  );
  if (!button) return;
  const group = button.closest("[data-layout-control]");
  const select = document.getElementById(group?.dataset.layoutControl);
  if (!(select instanceof HTMLSelectElement)) return;
  const value = button.dataset.layoutValue;
  if (![...select.options].some((option) => option.value === value)) return;
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  syncLayoutControlButtons();
});
propertyForm.addEventListener("change", (event) => {
  if (updatePluginProperty(event)) return;
  const target = event.target;
  const needsValidation =
    target.id === "property-element-id" ||
    [
      "property-class-name",
      "property-icon-class",
      "property-width",
      "property-height",
      "property-collection-items",
      "property-options",
      "property-list-options",
    ].includes(target.id) ||
    target.matches?.('[data-extra-data-field="key"]') === true;
  if (
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLInputElement &&
      ["checkbox", "radio"].includes(target.type)) ||
    needsValidation
  )
    updateSelectedElement(event);
});
workflowDialog.addEventListener("input", (event) => {
  const field = event.target.closest(
    '[data-event-handler-app-load="false"], [data-event-condition-field][data-event-handler-app-load="false"], [data-condition-action][data-event-handler-app-load="false"]',
  );
  if (field?.dataset.globalActionId) return;
  if (!field || field.matches("select, input[type=checkbox], input[type=radio]"))
    return;
  updateSelectedElement(event);
});
workflowDialog.addEventListener("change", (event) => {
  const field = event.target.closest(
    '[data-event-handler-app-load="false"], [data-event-condition-field][data-event-handler-app-load="false"], [data-condition-action][data-event-handler-app-load="false"]',
  );
  if (field?.dataset.globalActionId) return;
  if (!field) return;
  updateSelectedElement(event);
});
propertyForm.addEventListener("submit", (event) => event.preventDefault());
document.addEventListener("click", (event) => {
  if (
    event.target.closest(
      "[data-global-action-id], [data-event-handler-app-load='true']",
    )
  )
    return;
  if (event.target.closest("#edit-saved-component")) {
    const element = state.elements.find(
      (item) => item.id === state.selectedId,
    );
    if (element?.savedComponentInstanceId)
      startSavedComponentEditing(element.savedComponentInstanceId);
    return;
  }
  const moveHandlerButton = event.target.closest("[data-move-event-handler]");
  if (moveHandlerButton) {
    moveEventHandler(
      Number(moveHandlerButton.dataset.eventHandlerIndex),
      moveHandlerButton.dataset.moveEventHandler,
      false,
    );
    renderPreview(false);
    return;
  }
  const addExtraDataButton = event.target.closest("#add-element-extra-data");
  const removeExtraDataButton = event.target.closest(
    "[data-remove-extra-data]",
  );
  if (addExtraDataButton || removeExtraDataButton) {
    const element = state.elements.find((item) => item.id === state.selectedId);
    if (!element) return;
    element.extraData ||= [];
    if (addExtraDataButton) {
      element.extraData.push({
        key: `extra_${element.extraData.length + 1}`,
        value: "",
      });
    } else {
      element.extraData.splice(
        Number(removeExtraDataButton.dataset.removeExtraData),
        1,
      );
    }
    renderExtraDataFields(element);
    renderProperties();
    renderPreview(false);
    scheduleSave();
    return;
  }
  const addButton = event.target.closest("[data-add-condition-action]");
  const removeButton = event.target.closest("[data-remove-condition-action]");
  const addHandlerButton = event.target.closest("#add-event-handler");
  const removeHandlerButton = event.target.closest(
    "[data-remove-event-handler]",
  );
  if (addHandlerButton || removeHandlerButton) {
    const element = state.elements.find((item) => item.id === state.selectedId);
    if (!element) return;
    if (!element.action)
      element.action = {
        type: "none",
        event: ["checkbox", "radio", "switch"].includes(element.type)
          ? "change"
          : "click",
      };
    const handlers = Array.isArray(element.action?.handlers)
      ? element.action.handlers.map((handler) => ({ ...handler }))
      : [];
    if (addHandlerButton) {
      handlers.push({
        event: element.action.event || "click",
        type: "none",
      });
    } else {
      handlers.splice(
        Number(removeHandlerButton.dataset.removeEventHandler) - 1,
        1,
      );
    }
    element.action = { ...(element.action || {}), handlers };
    renderEventHandlers(element.action);
    renderPreview(false);
    scheduleSave();
    return;
  }
  if (!addButton && !removeButton) return;
  const element = state.elements.find((item) => item.id === state.selectedId);
  if (!element) return;
  const eventHandlerIndex = Number(
    (addButton || removeButton).dataset.eventHandlerIndex,
  );
  const isUnifiedHandler =
    (addButton || removeButton).dataset.eventHandlerIndex !== undefined;
  const eventHandlerOwner = isUnifiedHandler
    ? (addButton || removeButton).dataset.eventHandlerPrimary === "true"
      ? element.action
      : element.action?.handlers?.[eventHandlerIndex - 1]
    : element.action;
  const conditionOwner = getConditionOwnerForField(
    eventHandlerOwner,
    addButton || removeButton,
  );
  if (!isWorkflowBranchAction(conditionOwner)) return;
  const branch = (addButton || removeButton).dataset[
    addButton ? "addConditionAction" : "removeConditionAction"
  ];
  if (!["actions", "elseActions"].includes(branch)) return;
  const lists = getConditionActionLists(conditionOwner);
  const actions = lists[branch].map((action) => ({ ...action }));
  if (addButton) {
    actions.push({
      type: "showElement",
      elementId: state.elements[0]?.id || "",
    });
  } else {
    actions.splice(Number(removeButton.dataset.actionIndex), 1);
  }
  conditionOwner.actions = branch === "actions" ? actions : lists.actions;
  conditionOwner.elseActions =
    branch === "elseActions" ? actions : lists.elseActions;
  delete conditionOwner.effect;
  renderEventHandlers(element.action);
  renderPreview(false);
  scheduleSave();
});

function getManagedWorkflowActions(globalActionId = "") {
  if (globalActionId) {
    const action = (state.settings.globalActions || []).find(
      (candidate) => candidate.id === globalActionId,
    );
    return action ? action.actions : null;
  }
  return state.settings.appLoadHandlers;
}

function renderManagedWorkflow(globalActionId = "") {
  if (globalActionId) {
    const actions = getManagedWorkflowActions(globalActionId);
    if (actions)
      renderEventHandlers(
        { handlers: actions },
        { globalActionId },
      );
    return;
  }
  renderEventHandlers(
    { handlers: state.settings.appLoadHandlers },
    { appLoad: true },
  );
}

function updateAppLoadHandlerField(field) {
  const globalActionId = field.dataset.globalActionId || "";
  const actions = getManagedWorkflowActions(globalActionId);
  const index = Number(field.dataset.eventHandlerIndex);
  const handler = actions?.[index];
  if (!Number.isInteger(index) || !handler) return;
  const fieldName = field.dataset.eventHandlerField;
  if (fieldName !== "event") handler[fieldName] = field.value;
  if (!globalActionId) handler.event = "load";
  if (fieldName === "targetPageId") updateActionElementPage(handler);
  if (
    ["targetElementId", "targetPageId"].includes(fieldName) &&
    handler.type === "changeProperty"
  )
    normalizeChangePropertyAction(handler);
  if (
    fieldName === "type" ||
    (fieldName === "functionSource" && handler.type === "function")
  )
    initializeEventHandler(handler);
  if (fieldName === "functionSource" && handler.functionSource === "asset")
    handler.scriptAssetId ||= state.assets.find(isJavaScriptAsset)?.id || "";
  if (
    ["type", "property", "targetElementId", "targetPageId", "functionSource"].includes(
      fieldName,
    )
  )
    renderManagedWorkflow(globalActionId);
  scheduleSave();
}

function updateAppLoadConditionField(field) {
  const globalActionId = field.dataset.globalActionId || "";
  const actions = getManagedWorkflowActions(globalActionId);
  const index = Number(field.dataset.eventHandlerIndex);
  const handler = actions?.[index];
  if (!Number.isInteger(index) || !handler || handler.type !== "condition")
    return;
  const conditionAction = getConditionOwnerForField(handler, field);
  if (!conditionAction || conditionAction.type !== "condition") return;
  const fieldMap = {
    "property-condition-source": "source",
    "property-condition-request": "requestId",
    "property-condition-path": "path",
    "property-condition-object-path": "objectPath",
    "property-condition-static-value": "sourceValue",
    "property-condition-variable": "variableName",
    "property-condition-twk-field": "fieldKey",
    "property-condition-form-field": "fieldName",
    "property-condition-item-path": "itemPath",
    "property-condition-extra": "extraPath",
    "property-condition-element-page": "elementPageId",
    "property-condition-element": "elementId",
    "property-condition-element-property": "property",
    "property-condition-operator": "operator",
    "property-condition-value": "value",
  };
  const fieldName = fieldMap[field.dataset.eventConditionField];
  if (!fieldName) return;
  conditionAction.condition = {
    ...(conditionAction.condition || {}),
    [fieldName]: fieldName === "fieldName" ? field.value.trim() : field.value,
  };
  if (field.dataset.eventConditionField === "property-condition-element-page")
    conditionAction.condition.elementId =
      getElementsOnPage(state, field.value)[0]?.id || "";
  if (
    [
      "property-condition-source",
      "property-condition-operator",
      "property-condition-element-page",
      "property-condition-element",
      "property-condition-element-property",
    ].includes(field.dataset.eventConditionField)
  )
    renderManagedWorkflow(globalActionId);
  scheduleSave();
}

function updateAppLoadConditionAction(field) {
  const globalActionId = field.dataset.globalActionId || "";
  const actions = getManagedWorkflowActions(globalActionId);
  const index = Number(field.dataset.eventHandlerIndex);
  const handler = actions?.[index];
  const fieldName = field.dataset.conditionAction;
  if (
    !handler ||
    !isWorkflowBranchAction(handler) ||
    !fieldName
  )
    return;
  if (
    field.closest(".condition-action-nested-condition") &&
    !field.dataset.conditionActionPath
  )
    return;
  const targetAction = getConditionActionAtPath(
    handler,
    parseConditionActionPath(field.dataset.conditionActionPath),
  );
  if (!targetAction) return;
  targetAction[fieldName] = field.value;
  if (fieldName === "targetPageId") updateActionElementPage(targetAction);
  if (
    ["targetElementId", "targetPageId"].includes(fieldName) &&
    targetAction.type === "changeProperty"
  )
    normalizeChangePropertyAction(targetAction);
  if (
    fieldName === "type" ||
    (fieldName === "functionSource" && targetAction.type === "function")
  )
    initializeEventHandler(targetAction);
  if (
    fieldName === "functionSource" &&
    targetAction.functionSource === "asset"
  )
    targetAction.scriptAssetId ||=
      state.assets.find(isJavaScriptAsset)?.id || "";
  delete handler.effect;
  if (
    ["type", "property", "targetElementId", "targetPageId", "functionSource"].includes(
      fieldName,
    )
  )
    renderManagedWorkflow(globalActionId);
  scheduleSave();
}

function updateManagedWorkflowField(event) {
  const field = event.target.closest(
    "[data-event-handler-app-load='true'], [data-global-action-id]",
  );
  if (!field) return;
  if (field.matches("[data-event-handler-field]"))
    updateAppLoadHandlerField(field);
  else if (field.matches("[data-event-condition-field]"))
    updateAppLoadConditionField(field);
  else if (field.matches("[data-condition-action]"))
    updateAppLoadConditionAction(field);
}
workflowDialog.addEventListener("input", updateManagedWorkflowField);
workflowDialog.addEventListener("change", (event) => {
  updateManagedWorkflowField(event);
});
workflowDialog.addEventListener("click", (event) => {
  const addGlobalStep = event.target.closest("#add-global-action-step");
  if (addGlobalStep) {
    const globalActionId = workflowDialog.dataset.workflowGlobalActionId || "";
    const actions = getManagedWorkflowActions(globalActionId);
    if (!actions) return;
    actions.push({ type: "none" });
    renderManagedWorkflow(globalActionId);
    scheduleSave();
    return;
  }
  if (event.target.closest("#add-app-load-handler")) {
    state.settings.appLoadHandlers.push({ event: "load", type: "none" });
    renderManagedWorkflow();
    scheduleSave();
    return;
  }
  const managedField = event.target.closest("[data-global-action-id]");
  const globalActionId = managedField?.dataset.globalActionId || "";
  const managedActions = globalActionId
    ? getManagedWorkflowActions(globalActionId)
    : null;
  if (globalActionId && !managedActions) return;
  const removeHandler = event.target.closest(
    "[data-remove-event-handler][data-event-handler-app-load='true'], [data-remove-event-handler][data-global-action-id]",
  );
  const moveHandler = event.target.closest(
    "[data-move-event-handler][data-event-handler-app-load='true'], [data-move-event-handler][data-global-action-id]",
  );
  if (moveHandler) {
    moveEventHandler(
      Number(moveHandler.dataset.eventHandlerIndex),
      moveHandler.dataset.moveEventHandler,
      moveHandler.dataset.eventHandlerAppLoad === "true",
      moveHandler.dataset.globalActionId || "",
    );
    return;
  }
  if (removeHandler) {
    const actionId = removeHandler.dataset.globalActionId || "";
    const actions = getManagedWorkflowActions(actionId);
    if (!actions) return;
    actions.splice(
      Number(removeHandler.dataset.removeEventHandler),
      1,
    );
    renderManagedWorkflow(actionId);
    scheduleSave();
    return;
  }
  const addAction = event.target.closest(
    "[data-add-condition-action][data-event-handler-app-load='true'], [data-add-condition-action][data-global-action-id]",
  );
  const removeAction = event.target.closest(
    "[data-remove-condition-action][data-event-handler-app-load='true'], [data-remove-condition-action][data-global-action-id]",
  );
  if (!addAction && !removeAction) return;
  const actionId = (addAction || removeAction).dataset.globalActionId || "";
  const actionsForContext = getManagedWorkflowActions(actionId);
  if (!actionsForContext) return;
  const index = Number((addAction || removeAction).dataset.eventHandlerIndex);
  const handler = actionsForContext[index];
  if (!handler || handler.type !== "condition") return;
  const conditionOwner = getConditionOwnerForField(
    handler,
    addAction || removeAction,
  );
  if (!isWorkflowBranchAction(conditionOwner)) return;
  const branch = (addAction || removeAction).dataset[
    addAction ? "addConditionAction" : "removeConditionAction"
  ];
  if (!["actions", "elseActions"].includes(branch)) return;
  const lists = getConditionActionLists(conditionOwner);
  const actions = lists[branch].map((action) => ({ ...action }));
  if (addAction) {
    actions.push({
      type: "showElement",
      elementId: state.elements[0]?.id || "",
    });
  } else {
    actions.splice(Number(removeAction.dataset.actionIndex), 1);
  }
  conditionOwner.actions = branch === "actions" ? actions : lists.actions;
  conditionOwner.elseActions =
    branch === "elseActions" ? actions : lists.elseActions;
  delete conditionOwner.effect;
  renderManagedWorkflow(actionId);
  scheduleSave();
});

document
  .querySelector("#application-properties")
  .addEventListener("input", (event) => {
    const spacingField = event.target.closest("[data-app-spacing]");
    if (spacingField) {
      const [, kind, side] = spacingField.dataset.appSpacing.match(
        /^(margin|padding)(Top|Right|Bottom|Left)$/,
      );
      const settingsKey = kind === "margin" ? "appMargins" : "appPaddings";
      state.settings[settingsKey][side.toLowerCase()] = clampNumber(
        spacingField.value,
        0,
        100,
        0,
      );
    } else if (event.target.id === "application-title") {
      state.settings.titleLocalizations = normalizeLocalizedContent(
        state.settings.titleLocalizations,
      );
      state.settings.titleLocalizations[state.settings.appLanguage] =
        event.target.value;
    } else if (event.target.id === "application-organization") {
      state.settings.organizationLocalizations = normalizeLocalizedContent(
        state.settings.organizationLocalizations,
      );
      state.settings.organizationLocalizations[state.settings.appLanguage] =
        event.target.value;
    } else if (event.target.id === "application-topbar-type") {
      state.settings.appTopBarType = event.target.value;
      document.querySelector("#application-topbar-type").value =
        event.target.value;
    } else if (event.target.id === "application-logo-asset") {
      const asset = getAsset(event.target.value);
      state.settings.appLogoAssetId =
        asset?.type.startsWith("image/") ? asset.id : "";
      event.target.value = state.settings.appLogoAssetId;
    } else if (event.target.id === "application-element-size") {
      state.settings.appElementSize = ["small", "normal", "large"].includes(
        event.target.value,
      )
        ? event.target.value
        : "normal";
    } else if (event.target.id === "application-api-progress-indicator") {
      state.settings.appApiProgressIndicator = event.target.checked;
    } else if (event.target.id === "application-api-progress-label") {
      state.settings.appApiProgressLabel = event.target.checked;
    } else if (event.target.id === "application-show-error-message") {
      state.settings.appShowErrorMessage = event.target.checked;
    } else return;
    renderPreview(false);
    scheduleSave();
  });

document.querySelector("#application-theme").addEventListener("click", () => {
  renderThemeFields();
  themeDialog.showModal();
});

document.addEventListener("click", (event) => {
  const openButton = event.target.closest("[data-open-workflow-manager]");
  if (openButton) {
    const appLoad = openButton.dataset.openWorkflowManager === "app-load";
    document.querySelector("#global-action-workflow-section").hidden = true;
    document.querySelector("#element-workflow-section").hidden = appLoad;
    document.querySelector("#app-load-workflow-section").hidden = !appLoad;
    workflowDialog.dataset.workflowScope = appLoad ? "app-load" : "element";
    delete workflowDialog.dataset.workflowGlobalActionId;
    workflowDialog.querySelector("#workflow-dialog-title").textContent =
      appLoad ? localize.ManageAppLoadEvents[editorLanguage] : localize.ManageEventsActions[editorLanguage];
    workflowDialog.showModal();
    requestAnimationFrame(() => {
      if (appLoad)
        renderEventHandlers(
          { handlers: state.settings.appLoadHandlers },
          { appLoad: true },
        );
      else {
        const element = state.elements.find(
          (candidate) => candidate.id === state.selectedId,
        );
        if (element) renderEventHandlers(element.action || {});
      }
      workflowDialog
        .querySelector(
          `${appLoad ? "#app-load-workflow-section" : "#element-workflow-section"} .workflow-viewport`,
        )
        ?.focus({ preventScroll: true });
    });
    return;
  }
  if (event.target.closest("#close-workflow-dialog")) {
    workflowDialog.close();
    return;
  }
  if (event.target.closest("#save-close-workflow-dialog")) {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
    saveProject();
    workflowDialog.close();
  }
});

workflowDialog.addEventListener("click", (event) => {
  if (event.target === workflowDialog) workflowDialog.close();
});

workflowDialog.addEventListener("dragover", (event) => {
  const field = event.target.closest("[data-workflow-input-id]");
  if (!field || !event.dataTransfer?.types.includes("application/x-workflow-token-value"))
    return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});

workflowDialog.addEventListener("drop", (event) => {
  const field = event.target.closest("[data-workflow-input-id]");
  if (!field) return;
  const token = event.dataTransfer?.getData("application/x-workflow-token-value");
  if (!token) return;
  event.preventDefault();
  insertWorkflowToken(field, token);
});

const tokenPickerDialog = document.querySelector("#token-picker-dialog");
document
  .querySelector("#close-token-picker")
  .addEventListener("click", () => tokenPickerDialog.close());
document
  .querySelector("#token-picker-search")
  .addEventListener("input", (event) =>
    renderTokenPickerOptions(event.target.value),
  );
document
  .querySelector("#token-picker-options")
  .addEventListener("click", (event) => {
    const option = event.target.closest("[data-token-value]");
    if (!option || !activeTokenPickerTarget?.isConnected) return;
    insertWorkflowToken(activeTokenPickerTarget, option.dataset.tokenValue);
    tokenPickerDialog.close();
  });
tokenPickerDialog.addEventListener("click", (event) => {
  if (event.target === tokenPickerDialog) tokenPickerDialog.close();
});
document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-token-picker-for]");
  if (!trigger) return;
  const target = document.getElementById(trigger.dataset.tokenPickerFor);
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
    openTokenPicker(
      target,
      state.elements.find((element) => element.id === state.selectedId) || null,
    );
});

workflowDialog.addEventListener("close", () => {
  delete workflowDialog.dataset.workflowGlobalActionId;
  workflowDialog.querySelectorAll(".workflow-editor.is-expanded").forEach((editor) => {
    editor.classList.remove("is-expanded");
    const expandButton = editor.querySelector("[data-workflow-expand]");
    if (expandButton) expandButton.textContent = localize.Expand[editorLanguage];
  });
});

workflowDialog.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    !workflowDialog.querySelector(".workflow-editor.is-expanded")
  ) {
    event.preventDefault();
    workflowDialog.close();
    return;
  }
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "s")
    return;
  event.preventDefault();
  event.stopPropagation();
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  saveProject();
});

document
  .querySelector("#delete-element")
  .addEventListener("click", deleteSelected);
document.addEventListener("keydown", (event) => {
  const target = event.target;
  const key = event.key.toLowerCase();
  const commandKey = event.ctrlKey || event.metaKey;
  const inEditorCanvas =
    target instanceof Element &&
    target.closest("#app-preview, #element-tree");
  if (
    commandKey &&
    !event.altKey &&
    inEditorCanvas &&
    !document.querySelector("dialog[open]")
  ) {
    if (key === "c" && copySelectedElements()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (key === "v" && pasteCopiedElements()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  }
  const textEntryTarget =
    target instanceof Element &&
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="dialog"]',
    );
  const inElementInspector =
    state.selectedId &&
    target instanceof Element &&
    target.closest("#properties-form");
  if (
    commandKey &&
    !event.altKey &&
    (!textEntryTarget || inElementInspector) &&
    !document.querySelector("dialog[open]")
  ) {
    if ((key === "z" || key === "y") && event.shiftKey && !textEntryTarget) {
      event.preventDefault();
      redoBuilderAction();
      return;
    }
    if (
      (key === "z" || key === "y") &&
      (!textEntryTarget || inElementInspector)
    ) {
      event.preventDefault();
      if (key === "y" || event.shiftKey) redoBuilderAction();
      else undoBuilderAction();
      return;
    }
    if (!textEntryTarget && key === "c" && copySelectedElements()) {
      event.preventDefault();
      return;
    }
    if (!textEntryTarget && key === "v" && pasteCopiedElements()) {
      event.preventDefault();
      return;
    }
    if (!textEntryTarget && key === "a") {
      event.preventDefault();
      selectAllElements();
      return;
    }
  }
  if (
    ![localize.Delete[editorLanguage], "Backspace"].includes(event.key) ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    (!state.selectedIds.length && !state.selectedId)
  )
    return;
  if (textEntryTarget || document.querySelector("dialog[open]")) return;
  event.preventDefault();
  deleteSelected();
}, true);
document
  .querySelector("#undo-action")
  .addEventListener("click", undoBuilderAction);
document
  .querySelector("#redo-action")
  .addEventListener("click", redoBuilderAction);
document.querySelector("#copy-action").addEventListener("click", () => {
  copySelectedElements();
});
document.querySelector("#paste-action").addEventListener("click", () => {
  pasteCopiedElements();
});
document
  .querySelector("#select-all-action")
  .addEventListener("click", selectAllElements);
registerEditorEvents(document, {
  undoBuilderAction,
  redoBuilderAction,
  copySelectedElements,
  pasteCopiedElements,
  selectAllElements,
});
document
  .querySelector("#duplicate-element")
  .addEventListener("click", duplicateSelected);

document.querySelector("#page-select").addEventListener("change", (event) => {
  selectPage(event.target.value);
});
document.querySelector("#page-name").addEventListener("input", (event) => {
  const page = state.pages.find((item) => item.id === state.currentPageId);
  if (!page) return;
  page.name = event.target.value.slice(0, 40);
  const selectedOption =
    document.querySelector("#page-select").selectedOptions[0];
  if (selectedOption) {
    selectedOption.textContent =
      page.kind === "error"
        ? formatEditorMessage(localize.PageStatus[editorLanguage], {
          name: page.name,
          status: localize.PageErrorIndicator[editorLanguage],
        })
        : page.kind === "splash"
          ? formatEditorMessage(localize.PageStatus[editorLanguage], {
            name: page.name,
            status: localize.SplashScreenIndicator[editorLanguage],
          })
          : page.name;
  }
  const selectedElement = state.elements.find(
    (element) => element.id === state.selectedId,
  );
  if (selectedElement) renderEventHandlers(selectedElement.action || {});
  renderPreview(false);
  scheduleSave();
});
document.querySelector("#add-page").addEventListener("click", addPage);
document
  .querySelector("#delete-page")
  .addEventListener("click", deleteCurrentPage);

document.querySelectorAll(".view-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".view-button").forEach((item) => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
    deviceFrame.style.width =
      button.dataset.width === "100%"
        ? "min(100%, 960px)"
        : `${button.dataset.width}px`;
  });
});

const previewZoomMin = 50;
const previewZoomMax = 150;
const previewZoomStep = 10;
let previewZoom = 100;
const previewZoomOut = document.querySelector("#preview-zoom-out");
const previewZoomIn = document.querySelector("#preview-zoom-in");
const previewZoomLevel = document.querySelector("#preview-zoom-level");

function updatePreviewZoom() {
  deviceFrame.style.zoom = String(previewZoom / 100);
  previewZoomLevel.textContent = `${previewZoom}%`;
  previewZoomOut.disabled = previewZoom <= previewZoomMin;
  previewZoomIn.disabled = previewZoom >= previewZoomMax;
}

previewZoomOut.addEventListener("click", () => {
  previewZoom = Math.max(previewZoomMin, previewZoom - previewZoomStep);
  updatePreviewZoom();
});
previewZoomIn.addEventListener("click", () => {
  previewZoom = Math.min(previewZoomMax, previewZoom + previewZoomStep);
  updatePreviewZoom();
});
updatePreviewZoom();

document.querySelector("#reset-button").addEventListener("click", () => {
  if (
    !window.confirm(
      localize.starterrestoredsavedchanges[editorLanguage],
    )
  )
    return;
  state.elements = structuredClone(defaultElements);
  state.pages = structuredClone(defaultPages);
  state.currentPageId = defaultPages[0].id;
  state.elements = state.elements.map((element) => ({
    ...element,
    pageId: state.currentPageId,
  }));
  state.requests = [];
  state.components = [];
  state.userComponents = [...bundledPluginComponents];
  state.variables = [];
  state.settings.appLoadHandlers = [];
  state.assets = [];
  state.customCss = "";
  state.theme = structuredClone(defaultTheme);
  state.selectedRequestId = null;
  state.responses = {};
  requestTestResults.clear();
  clearElementSelection();
  renderPreview();
  renderCustomComponents();
  renderAssets();
  scheduleSave();
  showToast(localize.TheStarterProjectHasBeenRestored[editorLanguage]);
});

document.querySelector("#api-button").addEventListener("click", () => {
  renderApiEditor();
  apiDialog.showModal();
});

document
  .querySelector("#global-actions-button")
  .addEventListener("click", () => {
    renderGlobalActionsList();
    globalActionsDialog.showModal();
  });
document
  .querySelector("#close-global-actions")
  .addEventListener("click", () => globalActionsDialog.close());
document
  .querySelector("#done-global-actions")
  .addEventListener("click", () => globalActionsDialog.close());
document
  .querySelector("#add-global-action")
  .addEventListener("click", () => {
    const names = new Set(
      (state.settings.globalActions || []).map((action) =>
        action.name.toLowerCase(),
      ),
    );
    let index = 1;
    let name = formatEditorMessage(
      localize.IndexedGlobalAction[editorLanguage],
      { index },
    );
    while (names.has(name.toLowerCase())) {
      name = formatEditorMessage(
        localize.IndexedGlobalAction[editorLanguage],
        { index: ++index },
      );
    }
    state.settings.globalActions ||= [];
    state.settings.globalActions.push({
      id: createId(),
      name,
      actions: [],
    });
    renderGlobalActionsList();
    scheduleSave();
  });
globalActionsDialog.addEventListener("click", (event) => {
  const edit = event.target.closest("[data-edit-global-action]");
  if (edit) {
    const action = (state.settings.globalActions || []).find(
      (candidate) => candidate.id === edit.dataset.editGlobalAction,
    );
    if (!action) return;
    globalActionsDialog.close();
    document.querySelector("#element-workflow-section").hidden = true;
    document.querySelector("#app-load-workflow-section").hidden = true;
    document.querySelector("#global-action-workflow-section").hidden = false;
    workflowDialog.dataset.workflowScope = "global-action";
    workflowDialog.dataset.workflowGlobalActionId = action.id;
    workflowDialog.querySelector("#workflow-dialog-title").textContent =
      `${localize.GlobalActionAlternative[editorLanguage]} ${action.name}`;
    workflowDialog.showModal();
    requestAnimationFrame(() => {
      renderEventHandlers(
        { handlers: action.actions },
        { globalActionId: action.id },
      );
      workflowDialog
        .querySelector("#global-action-workflow-section .workflow-viewport")
        ?.focus({ preventScroll: true });
    });
    return;
  }
  const remove = event.target.closest("[data-remove-global-action]");
  if (!remove) return;
  state.settings.globalActions = state.settings.globalActions.filter(
    (action) => action.id !== remove.dataset.removeGlobalAction,
  );
  renderGlobalActionsList();
  scheduleSave();
});
globalActionsDialog.addEventListener("input", (event) => {
  const field = event.target.closest("[data-global-action-field]");
  if (!field) return;
  const row = field.closest("[data-global-action-id]");
  const action = state.settings.globalActions.find(
    (item) => item.id === row?.dataset.globalActionId,
  );
  if (!action) return;
  field.removeAttribute("aria-invalid");
  if (field.dataset.globalActionField === "name") {
    const name = field.value.trim();
    const duplicate = state.settings.globalActions.some(
      (item) =>
        item.id !== action.id &&
        item.name.toLowerCase() === name.toLowerCase(),
    );
    if (!name || duplicate) {
      field.setAttribute("aria-invalid", "true");
      return;
    }
    action.name = name;
    field.value = name;
    refreshGlobalActionSelectors();
  }
  scheduleSave();
});
globalActionsDialog.addEventListener("change", (event) => {
  const field = event.target.closest(
    '[data-global-action-field="name"][aria-invalid="true"]',
  );
  if (field) showToast(localize.GlobalActionNamesMustBeUniqueAndNonEmpty[editorLanguage]);
});

document.querySelector("#variables-button").addEventListener("click", () => {
  renderVariableForm();
  variablesDialog.showModal();
});

document.querySelector("#assets-button").addEventListener("click", () => {
  renderAssets();
  assetsDialog.showModal();
});
document.querySelector("#close-assets").addEventListener("click", () => {
  assetsDialog.close();
});

document
  .querySelector("#asset-files")
  .addEventListener("change", async (event) => {
    try {
      await addAssets([...event.target.files]);
    } catch (error) {
      console.error("Unable to import selected assets.", error);
      showToast(
        localize.UnableToAddFileErrorMessage[editorLanguage].replace(
          "${error.message}",
          () => error.message,
        ),
      );
    } finally {
      event.target.value = "";
    }
  });
document.querySelector("#asset-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-asset]");
  if (!button) return;
  const assetId = button.dataset.deleteAsset;
  const asset = getAsset(assetId);
  if (isFunctionAssetInUse(assetId)) {
    showToast(localize.ChangeFunctionFilesBeforeDeletingAsset[editorLanguage]);
    return;
  }
  state.assets = state.assets.filter((item) => item.id !== assetId);
  [
    ...state.elements,
    ...state.components.flatMap((item) => item.elements),
  ].forEach((element) => {
    if (element.assetId === assetId) element.assetId = "";
  });
  renderAssets();
  renderProperties();
  renderPreview(false);
  scheduleSave();
  if (asset)
    showToast(
      localize.AssetDeleted[editorLanguage].replace(
        "{name}",
        () => asset.name,
      ),
    );
});

function renderCustomCssThemeVariables() {
  const list = document.querySelector("#custom-css-theme-variables");
  const variables = [
    ...Object.keys(defaultTheme).map((name) => ({
      variable: `--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      colorName: name,
    })),
    ...Object.entries(themeCssVariableAliases).map(([variable, colorName]) => ({
      variable,
      colorName,
    })),
  ];

  list.replaceChildren();
  variables.forEach(({ variable, colorName }) => {
    const color = getActiveThemeColor(colorName);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "custom-css-variable";
    button.dataset.cssVariable = variable;
    button.title = `${variable}: ${color}`;
    const swatch = document.createElement("span");
    swatch.className = "custom-css-variable-swatch";
    swatch.style.backgroundColor = color;
    swatch.setAttribute("aria-hidden", "true");
    const code = document.createElement("code");
    code.textContent = `var(${variable})`;
    button.append(swatch, code);
    list.append(button);
  });
}

document.querySelector("#custom-css-button").addEventListener("click", () => {
  const source = document.querySelector("#custom-css-source");
  source.value = state.customCss;
  refreshCodeEditor(source);
  renderCustomCssThemeVariables();
  customCssDialog.showModal();
});
document
  .querySelector("#custom-css-theme-variables")
  .addEventListener("click", (event) => {
    const button = event.target.closest("[data-css-variable]");
    if (!button) return;
    const source = document.querySelector("#custom-css-source");
    const value = `var(${button.dataset.cssVariable})`;
    source.setRangeText(
      value,
      source.selectionStart,
      source.selectionEnd,
      "end",
    );
    source.dispatchEvent(new Event("input", { bubbles: true }));
    source.focus();
  });
document
  .querySelector("#import-project-json")
  .addEventListener("click", () =>
    document.querySelector("#import-project-json-file").click(),
  );
document
  .querySelector("#project-gallery-button")
  .addEventListener("click", () => {
    loadProjectGallery();
    document.querySelector("#project-gallery-dialog").showModal();
  });
document
  .querySelector("#close-project-gallery")
  .addEventListener("click", () => {
    document.querySelector("#project-gallery-dialog").close();
  });
document
  .querySelector("#project-gallery-list")
  .addEventListener("click", async (event) => {
    const button = event.target.closest("[data-project-file]");
    if (!button) return;
    button.disabled = true;
    try {
      await loadGalleryProject(button.dataset.projectFile);
    } catch (error) {
      console.error("Unable to load the selected gallery project.", error);
      showToast(
        localize.UnableToLoadProjectErrorMessage[editorLanguage].replace(
          "{error}",
          () => error.message,
        ),
      );
      button.disabled = false;
    }
  });
document
  .querySelector("#import-project-json-file")
  .addEventListener("change", async (event) => {
    const input = event.target;
    const [file] = input.files;
    if (!file) return;
    try {
      await importProjectFile(file);
    } catch (error) {
      console.error("Unable to import the builder project.", error);
      showToast(
        localize.UnableToImportProjectErrorMessage[editorLanguage].replace(
          "${error.message}",
          () => error.message,
        ),
      );
    } finally {
      input.value = "";
    }
  });
document.querySelector("#close-custom-css").addEventListener("click", () => {
  customCssDialog.close();
});
document.querySelector("#cancel-custom-css").addEventListener("click", () => {
  customCssDialog.close();
});

document
  .querySelector("#custom-css-form")
  .addEventListener("submit", (event) => {
    event.preventDefault();
    const customCss = document.querySelector("#custom-css-source").value;
    try {
      new CSSStyleSheet().replaceSync(customCss);
    } catch (error) {
      showToast(
        localize.InvalidCSS[editorLanguage].replace(
          "{error}",
          () => error.message,
        ),
      );
      return;
    }
    state.customCss = customCss;
    renderPreview(false);
    scheduleSave();
    customCssDialog.close();
    showToast(localize.CustomCSSSaved[editorLanguage]);
  });
document
  .querySelector("#close-variables")
  .addEventListener("click", () => variablesDialog.close());

document.querySelector("#add-variable").addEventListener("click", addVariable);
document.querySelector("#variable-list").addEventListener("click", (event) => {
  const item = event.target.closest("[data-variable-id]");
  if (!item) return;
  state.selectedVariableId = item.dataset.variableId;
  renderVariableForm();
});
document
  .querySelector("#variable-source")
  .addEventListener("change", (event) =>
    updateVariableSourceFields(event.target.value),
  );
document
  .querySelector("#variable-form")
  .addEventListener("change", () => updateVariablePropertyPathVisibility());
document
  .querySelector("#variable-element-source")
  .addEventListener("change", () => {
    const element = state.elements.find(
      (item) =>
        item.id === document.querySelector("#variable-element-source").value,
    );
    const property = document.querySelector("#variable-element-property");
    const previous = property.value;
    property.replaceChildren(
      ...(element
        ? getElementSourcePropertyOptions(element).map(
          ([label, value]) => new Option(label, value),
        )
        : []),
    );
    property.value = [...property.options].some(
      (option) => option.value === previous,
    )
      ? previous
      : property.options[0]?.value || "";
  });
document.querySelector("#variable-form").addEventListener("submit", (event) => {
  event.preventDefault();
  saveVariable();
});
document.querySelector("#delete-variable").addEventListener("click", () => {
  const variable = selectedVariable();
  if (!variable) return;
  const token = new RegExp(`\\{\\{\\s*var\\.${variable.name}\\s*\\}\\}`);
  const isReferenced =
    state.variables.some(
      (item) =>
        item.id !== variable.id &&
        item.source === "variable" &&
        item.path === variable.id,
    ) ||
    state.elements.some(
      (element) =>
        element.binding?.source === "variable" &&
        element.binding.path === variable.id,
    ) ||
    state.elements.some(
      (element) =>
        element.action?.variableId === variable.id ||
        element.action?.handlers?.some(
          (handler) => handler.variableId === variable.id,
        ) ||
        [
          ...(element.action?.actions || []),
          ...(element.action?.elseActions || []),
        ].some((effect) => effect.variableId === variable.id),
    ) ||
    state.elements.some((element) => {
      const action = element.action || {};
      const effects = [
        ...(Array.isArray(action.handlers) ? action.handlers : []),
        ...(Array.isArray(action.actions) ? action.actions : []),
        ...(Array.isArray(action.elseActions) ? action.elseActions : []),
      ];
      return (
        token.test(element.content) ||
        token.test(action.values || "") ||
        effects.some((effect) =>
          ["value", "values", "title", "message"].some((field) =>
            token.test(String(effect[field] || "")),
          ),
        ) ||
        token.test(String(action.condition?.value || ""))
      );
    }) ||
    state.elements.some((element) => {
      const actions = [
        ...(Array.isArray(element.action?.handlers)
          ? element.action.handlers
          : []),
        ...(Array.isArray(element.action?.actions)
          ? element.action.actions
          : []),
        ...(Array.isArray(element.action?.elseActions)
          ? element.action.elseActions
          : []),
      ];
      return actions.some(
        (action) =>
          action.condition?.source === "variable" &&
          action.condition.variableName === variable.name,
      );
    }) ||
    state.requests.some(
      (request) =>
        token.test(request.url) ||
        token.test(request.headers) ||
        token.test(request.body),
    );
  if (isReferenced) {
    showToast(localize.RemoveVariableReferencesBeforeDeleting[editorLanguage]);
    return;
  }
  state.variables = state.variables.filter((item) => item.id !== variable.id);
  state.selectedVariableId = state.variables[0]?.id || null;
  renderVariableForm();
  renderProperties();
  renderPreview(false);
  scheduleSave();
});

document.querySelector("#theme-button").addEventListener("click", () => {
  document.querySelector("#theme-mode-select").value = state.settings.appTheme;
  renderThemeFields();
  themeDialog.showModal();
});

document
  .querySelector("#close-theme")
  .addEventListener("click", () => themeDialog.close());
document
  .querySelector("#close-theme-done")
  .addEventListener("click", () => themeDialog.close());

document.querySelector("#theme-form").addEventListener("submit", (event) => {
  event.preventDefault();
});
document.querySelector("#theme-form").addEventListener("input", (event) => {
  if (event.target.type !== "color") return;
  const name = event.target.id.replace("theme-", "");
  const isDark = document.querySelector("#theme-mode-select").value === "dark";
  const palette = isDark ? state.settings.appDarkTheme : state.theme;
  if (!Object.hasOwn(palette, name)) return;
  palette[name] = safeColor(event.target.value, palette[name]);
  event.target.nextElementSibling.textContent = palette[name].toUpperCase();
  applyTheme();
  renderPreview(false);
  scheduleSave();
});
document
  .querySelector("#theme-mode-select")
  .addEventListener("change", renderThemeFields);
document.querySelector("#reset-theme").addEventListener("click", () => {
  if (document.querySelector("#theme-mode-select").value === "dark") {
    state.settings.appDarkTheme = structuredClone(darkThemeColors);
  } else {
    state.theme = structuredClone(defaultTheme);
  }
  renderThemeFields();
  applyTheme();
  renderPreview(false);
  scheduleSave();
});
document
  .querySelector("#close-component")
  .addEventListener("click", () => componentDialog.close());
document
  .querySelector("#cancel-component")
  .addEventListener("click", () => componentDialog.close());

document
  .querySelector("#component-form")
  .addEventListener("submit", (event) => {
    event.preventDefault();
    saveSelectedComponent(document.querySelector("#component-name").value);
  });
document.querySelector("#close-custom-markup").addEventListener("click", () => {
  customMarkupDialog.close();
});
document
  .querySelector("#cancel-custom-markup")
  .addEventListener("click", () => {
    customMarkupDialog.close();
  });

document
  .querySelector("#custom-markup-form")
  .addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = document.querySelector("#custom-markup-name").value.trim();
    const html = document.querySelector("#custom-markup-html").value;
    const css = document.querySelector("#custom-markup-css").value;
    if (!name || !html.trim()) {
      showToast(localize.EnterAComponentNameAndValidHTML[editorLanguage]);
      return;
    }
    try {
      new CSSStyleSheet().replaceSync(css);
    } catch (error) {
      showToast(localize.ComponentCSSIsInvalid[editorLanguage]);
      return;
    }
    const editingId = form.dataset.editingId;
    const component = editingId
      ? state.userComponents.find((item) => item.id === editingId)
      : null;
    if (component) {
      component.name = name.slice(0, 60);
      component.html = html;
      component.css = css;
    } else {
      state.userComponents.push({
        id: `user-component-${globalThis.crypto.randomUUID()}`,
        name: name.slice(0, 60),
        html,
        css,
      });
    }
    customMarkupDialog.close();
    renderCustomComponents();
    renderPreview();
    scheduleSave();
    showToast(
      localize.ComponentSaved[editorLanguage].replace(
        "{name}",
        () => name.slice(0, 60),
      ),
    );
  });

document
  .querySelector("#close-api")
  .addEventListener("click", () => apiDialog.close());

document.querySelector("#add-request").addEventListener("click", () => {
  const request = newRequest();
  state.requests.push(request);
  state.elements.forEach((element) => {
    if (
      element.type === "collection" &&
      element.listSource?.type === "endpoint" &&
      !element.listSource.requestId
    ) {
      element.listSource = normalizeCollectionDataSource({
        ...element.listSource,
        requestId: request.id,
      });
    }
    if (
      element.type === "button" &&
      element.action?.type === "request" &&
      !element.action.requestId
    ) {
      element.action.requestId = request.id;
    }
  });
  state.selectedRequestId = request.id;
  renderApiEditor();
  renderProperties();
  scheduleSave();
  document.querySelector("#request-name").focus();
});

document.querySelector("#request-list").addEventListener("click", (event) => {
  const moveButton = event.target.closest("[data-move-request]");
  if (moveButton) {
    syncRequestForm();
    const index = state.requests.findIndex(
      (request) => request.id === moveButton.dataset.requestId,
    );
    const nextIndex =
      index + (moveButton.dataset.moveRequest === "up" ? -1 : 1);
    if (index < 0 || nextIndex < 0 || nextIndex >= state.requests.length)
      return;
    [state.requests[index], state.requests[nextIndex]] = [
      state.requests[nextIndex],
      state.requests[index],
    ];
    renderApiEditor();
    scheduleSave();
    return;
  }
  const item = event.target.closest("[data-request-id]");
  if (!item) return;
  if (item.matches("[data-move-request]")) return;
  syncRequestForm();
  state.selectedRequestId = item.dataset.requestId;
  renderApiEditor();
});

document.querySelector("#api-form").addEventListener("input", syncRequestForm);
document.querySelector("#api-form").addEventListener("change", syncRequestForm);
document.querySelector("#api-form").addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-request-parameter]");
  if (addButton) {
    const kind = addButton.dataset.addRequestParameter;
    if (!["headers", "body"].includes(kind)) return;
    const editor = getRequestParameterEditor(kind);
    const row = appendRequestParameterRow(editor, kind);
    row.querySelector(".api-parameter-key").focus();
    return;
  }
});
["headers", "body"].forEach((kind) => {
  const advanced = document.querySelector(
    kind === "headers" ? "#request-headers" : "#request-body",
  );
  advanced.addEventListener("change", () =>
    renderRequestParameterEditor(kind),
  );
});

document.querySelector("#delete-request").addEventListener("click", () => {
  const request = getSelectedRequest();
  if (!request) return;
  if (
    state.variables.some(
      (variable) =>
        variable.source === "endpoint" && variable.requestId === request.id,
    )
  ) {
    showToast(localize.changesourcevariableslinked[editorLanguage]);
    return;
  }
  state.requests = state.requests.filter((item) => item.id !== request.id);
  state.elements.forEach((element) => {
    if (element.action?.requestId === request.id) element.action.requestId = "";
    if (element.action?.condition?.requestId === request.id)
      element.action.condition.requestId = "";
    (Array.isArray(element.action?.handlers)
      ? element.action.handlers
      : []
    ).forEach((handler) => {
      if (handler.requestId === request.id) handler.requestId = "";
    });
    [
      ...(Array.isArray(element.action?.actions) ? element.action.actions : []),
      ...(Array.isArray(element.action?.elseActions)
        ? element.action.elseActions
        : []),
    ].forEach((effect) => {
      if (effect.requestId === request.id) effect.requestId = "";
    });
    if (
      element.binding?.source === "endpoint" &&
      element.binding.requestId === request.id
    ) {
      element.binding = null;
    }
    if (
      element.listSource?.type === "endpoint" &&
      element.listSource.requestId === request.id
    ) {
      element.listSource =
        element.type === "collection"
          ? normalizeCollectionDataSource({ type: "static" })
          : {
            ...element.listSource,
            type: "static",
            requestId: "",
          };
    }
  });
  delete state.responses[request.id];
  requestTestResults.delete(request.id);
  state.selectedRequestId = state.requests[0]?.id || null;
  renderApiEditor();
  renderProperties();
  renderPreview();
  scheduleSave();
});

document.querySelector("#test-request").addEventListener("click", async () => {
  syncRequestForm();
  const request = getSelectedRequest();
  if (!request) return;
  setRequestTestResult(
    request.id,
    localize.SendingTestRequest[editorLanguage],
    "idle",
  );
  document.querySelector("#test-request").disabled = true;
  try {
    const data = await executeRequest(request, true);
    state.responses[request.id] = data;
    updateBindingObjectPathVisibility(
      state.elements.find((element) => element.id === state.selectedId),
    );
    updateVariablePropertyPathVisibility();
    renderPreview(false);
    setRequestTestResult(request.id, responseSummary(data), "success");
  } catch (error) {
    setRequestTestResult(request.id, error.message, "error");
  } finally {
    document.querySelector("#test-request").disabled = false;
  }
});

document.querySelector("#export-button").addEventListener("click", () => {
  state.exportTab = "html";
  refreshExportCode();
  exportDialog.showModal();
});
document
  .querySelector("#export-project-json")
  .addEventListener("click", exportProjectJson);

document
  .querySelector("#close-export")
  .addEventListener("click", () => exportDialog.close());

document.querySelectorAll(".export-tab").forEach((button) => {
  button.addEventListener("click", () => {
    state.exportTab = button.dataset.tab;
    refreshExportCode();
  });
});

document.querySelector("#copy-code").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(getExportContent(state.exportTab));
    showToast(localize.CodeCopied[editorLanguage]);
  } catch (error) {
    console.error("Unable to copy exported code.", error);
    showToast(localize.unablecopyselectcode[editorLanguage]);
  }
});

document.querySelector("#download-app").addEventListener("click", async () => {
  try {
    if (typeof JSZip === "undefined") {
      showToast(localize.TheZIPLibraryJSZipIsUnavailable[editorLanguage]);
      return;
    }

    const zip = new JSZip();

    zip.file("index.html", buildHtmlFile());
    zip.file(
      "custom.css",
      [
        buildCustomComponentStyles(),
        scopeCss(state.customCss, ".embedded-app", true),
        scopeCss(state.customCss, ".app-sheet-portal", true),
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
    for (const path of [
      "lib/fontawesome/css/all.min.css",
      "lib/fontawesome/webfonts/fa-solid-900.woff2",
    ]) {
      zip.file(path, await readBundledAppFile(`assets/${path}`));
    }
    state.assets.forEach((asset) => {
      const encoded = asset.dataUrl.match(
        /^data:[^,]*;base64,([A-Za-z0-9+/=]*)$/,
      );
      if (!encoded)
        throw new Error(
          formatEditorMessage(localize.AssetNotEmbeddable[editorLanguage], {
            name: asset.name,
          }),
        );
      zip.file(assetArchivePath(asset), encoded[1], { base64: true });
    });

    try {
      const jsContent = new TextDecoder().decode(
        await readBundledAppFile("js/twkhelper.js"),
      );
      zip.file("twkhelper.js", jsContent);
    } catch (fetchError) {
      console.warn(
        "Could not fetch local helper script, adding fallback.",
        fetchError,
      );
      zip.file("twkhelper.js", "// Fallback helper content");
    }

    const content = await zip.generateAsync({ type: "blob" });

    if (await downloadExportFile("app.zip", content))
      showToast(localize.AppZIPDownloadedSuccessfully[editorLanguage]);
  } catch (error) {
    console.error("Failed to generate zip archive:", error);
    showToast(localize.AnErrorOccurredWhileCreatingTheZIPFile[editorLanguage]);
  }
});

window.addEventListener("load", function () {
  const loadingScreen = document.getElementById("loading-screen");
  loadingScreen.classList.add("hidden");

  setTimeout(function () {
    loadingScreen.style.display = "none";
  }, 500);
});

async function initializeEditor() {
  try {
    bundledPluginComponents = await bundledPluginLoadPromise;
    bundledPluginComponents.forEach((component) =>
      bundledPluginIds.add(component.id),
    );
    state.userComponents = withBundledPluginComponents(state.userComponents);
    normalizePluginContainerParents();
    synchronizeSelectedPluginIds();
  } catch (error) {
    pluginFolderLoadError = error;
    console.error("Unable to load bundled plugins.", error);
  }

  renderTwkOptions();
  renderCustomComponents();
  renderAssets();
  setupCodeEditors();
  renderPreview();
  applyEditorLanguage();
  if (pluginFolderLoadError) {
    showToast(localize.UnableToLoadBundledPlugins[editorLanguage]);
  } else if (storedPluginDefinitionsNeedMigration && saveProject()) {
    showToast(
      localize.previouslysavedpluginfiles[editorLanguage],
    );
  }
}

initializeEditor();

const disclaimerDialog = document.querySelector("#disclaimer-dialog");
const acceptDisclaimer = document.querySelector("#accept-disclaimer");

acceptDisclaimer.addEventListener("click", () => {
  localStorage.setItem(DISCLAIMER_ACKNOWLEDGED_KEY, "true");
  disclaimerDialog.close();
});

if (localStorage.getItem(DISCLAIMER_ACKNOWLEDGED_KEY) !== "true") {
  disclaimerDialog.showModal();
}
