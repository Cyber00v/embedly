// @ts-nocheck
 
// Renders condition sources, comparisons, nested conditions, and branch action forms.
import {
  getElementsOnPage,
  getTargetPageId,
} from "./action-selection.ts";

export function createWorkflowConditionEditor(dependencies) {
  const {
    state,
    editorLanguage,
    localize,
    TWK_FIELDS,
    typeNames,
    variantLabels,
    twkSystemActionOptions,
    variableSourceTypes,
    toast,
    getElementName,
    getChangePropertyOptions,
    getActionValueType,
    getVariantOptions,
    populateValueSourceOptions,
    isInsideCollection,
    normalizeExtraData,
    createElement,
    getElementSourcePropertyOptions,
    isJavaScriptAsset,
    getConditionActionLists,
    isWorkflowBranchAction,
    showToast,
  } = dependencies;

function addTargetPagePicker(row, item, branch, index, title, targetField) {
  const pageId = getTargetPageId(state, item, targetField);
  const page = document.createElement("select");
  page.dataset.conditionAction = "targetPageId";
  page.dataset.conditionBranch = branch;
  page.dataset.actionIndex = String(index);
  page.setAttribute(
    "aria-label",
    `${title.textContent}: ${localize.TargetPage[editorLanguage]}`,
  );
  state.pages
    .filter((candidate) => candidate.kind === "page")
    .forEach((candidate) => page.add(new Option(candidate.name, candidate.id)));
  page.value = pageId;
  row.append(page);
  return getElementsOnPage(state, pageId);
}

function getTargetOptions(elements, labelFor) {
  return elements.length
    ? elements.map((element) => [labelFor(element), element.id])
    : [[localize.NoMatchingElements[editorLanguage], ""]];
}

function conditionActionPathValue(path) {
  return path.map(({ branch, index }) => `${branch}:${index}`).join("/");
}

function parseConditionActionPath(value = "") {
  if (!value) return [];
  return value.split("/").map((part) => {
    const [branch, index] = part.split(":");
    return { branch, index: Number(index) };
  });
}

function getConditionActionAtPath(owner, path) {
  // Nested action fields resolve through each condition's branch/index path.
  return path.reduce((action, step) => {
    if (!isWorkflowBranchAction(action)) return null;
    const actions = getConditionActionLists(action)[step.branch];
    return Number.isInteger(step.index) ? actions[step.index] || null : null;
  }, owner);
}

function getConditionOwnerForField(owner, field) {
  const pathValue = field.dataset.conditionActionOwnerPath;
  if (field.closest(".condition-action-nested-condition") && !pathValue)
    return null;
  return getConditionActionAtPath(owner, parseConditionActionPath(pathValue));
}

function renderConditionOptions(
  action = {},
  root = document,
  actionPath = [],
  handlerContext = null,
) {
  const condition = handlerContext?.branchOnly
    ? {}
    : action.condition || (action.condition = {});
  const actionPathValue = conditionActionPathValue(actionPath);
  if (!handlerContext?.branchOnly) {
  // Branch-only permission actions intentionally skip the editable condition form.
  if (handlerContext) {
    root.querySelectorAll('[id^="property-condition-"]').forEach((field) => {
      field.dataset.eventConditionField = field.id;
      field.dataset.conditionActionOwnerPath = actionPathValue;
      field.dataset.eventHandlerIndex = String(handlerContext.index);
      field.dataset.eventHandlerPrimary = String(handlerContext.isPrimary);
      field.dataset.eventHandlerAppLoad = String(handlerContext.appLoad);
    });
  }
  const sourceSelect = root.querySelector("#property-condition-source");
  const eventIsAppLoad =
    handlerContext?.appLoad === true;
  const selectedContextElement = state.elements.find(
    (element) => element.id === state.selectedId,
  );
  populateValueSourceOptions(
    sourceSelect,
    !eventIsAppLoad &&
      Boolean(
        selectedContextElement && isInsideCollection(selectedContextElement),
      ),
  );
  const requestSelect = root.querySelector("#property-condition-request");
  requestSelect.replaceChildren(
    ...state.requests.map((request) => new Option(request.name, request.id)),
  );
  if (!state.requests.length)
    requestSelect.add(new Option(localize.AddARequestInAPISettings[editorLanguage], ""));
  requestSelect.disabled = !state.requests.length;
  requestSelect.value = state.requests.some(
    (request) => request.id === condition.requestId,
  )
    ? condition.requestId
    : state.requests[0]?.id || "";

  const variableSelect = root.querySelector("#property-condition-variable");
  variableSelect.replaceChildren(
    ...state.variables.map(
      (variable) => new Option(variable.name, variable.name),
    ),
  );
  if (!state.variables.length)
    variableSelect.add(new Option(localize.AddAStaticVariable[editorLanguage], ""));
  variableSelect.disabled = !state.variables.length;
  const variableName = state.variables.some(
    (variable) => variable.name === condition.variableName,
  )
    ? condition.variableName
    : state.variables[0]?.name || "";

  const twkSelect = root.querySelector("#property-condition-twk-field");
  twkSelect.replaceChildren(
    ...TWK_FIELDS.map((field) => new Option(field.label, field.key)),
  );
  twkSelect.value = TWK_FIELDS.some((field) => field.key === condition.fieldKey)
    ? condition.fieldKey
    : TWK_FIELDS[0].key;

  const source =
    condition.source === "api"
      ? "endpoint"
      : variableSourceTypes.includes(condition.source)
        ? condition.source
        : "endpoint";
  variableSelect.value = variableName;
  if (source === "variable" && variableName)
    condition.variableName = variableName;
  sourceSelect.value = source;
  root.querySelector("#condition-static-fields").hidden = source !== "static";
  root.querySelector("#condition-api-fields").hidden = source !== "endpoint";
  root.querySelector("#condition-variable-fields").hidden =
    source !== "variable";
  root.querySelector("#condition-twk-fields").hidden = source !== "twk";
  root.querySelector("#condition-form-fields").hidden = source !== "form";
  root.querySelector("#condition-item-fields").hidden = source !== "item";
  root.querySelector("#condition-extra-fields").hidden = source !== "extra";
  root.querySelector("#condition-element-fields").hidden = source !== "element";
  root.querySelector("#condition-object-path-fields").hidden = false;
  root.querySelector("#property-condition-object-path").value =
    condition.objectPath || "";
  root.querySelector("#property-condition-path").value = condition.path || "";
  root.querySelector("#property-condition-static-value").value =
    condition.sourceValue ?? "null";
  root.querySelector("#property-condition-item-path").value =
    condition.itemPath || "";
  root.querySelector("#property-condition-form-field").value =
    condition.fieldName || "";
  root
    .querySelector("#property-condition-extra")
    .replaceChildren(
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
  const extraSelect = root.querySelector("#property-condition-extra");
  if (!extraSelect.options.length)
    extraSelect.add(new Option(localize.AddAdditionalInfoFirst[editorLanguage], ""));
  extraSelect.value = condition.extraPath || "";
  const elementPageSelect = root.querySelector(
    "#property-condition-element-page",
  );
  const elementPageId = getTargetPageId(
    state,
    condition,
    "elementId",
    "elementPageId",
  );
  elementPageSelect.replaceChildren(
    ...state.pages
      .filter((page) => page.kind === "page")
      .map((page) => new Option(page.name, page.id)),
  );
  elementPageSelect.value = elementPageId;
  const pageElements = getElementsOnPage(state, elementPageId);
  const elementSelect = root.querySelector("#property-condition-element");
  elementSelect.replaceChildren(
    ...pageElements.map(
      (element) => new Option(getElementName(element), element.id),
    ),
  );
  if (!pageElements.length)
    elementSelect.add(new Option(localize.NoMatchingElements[editorLanguage], ""));
  elementSelect.value = pageElements.some(
    (element) => element.id === condition.elementId,
  )
    ? condition.elementId
    : pageElements[0]?.id || "";
  condition.elementId = elementSelect.value;
  const selectedElement = elementSelect.value;
  const conditionElement =
    pageElements.find((element) => element.id === selectedElement);
  const elementPropertySelect = root.querySelector(
    "#property-condition-element-property",
  );
  const currentProperty = condition.property || "";
  elementPropertySelect.replaceChildren(
    ...(conditionElement
      ? getElementSourcePropertyOptions(conditionElement).map(
          ([label, value]) => new Option(label, value),
        )
      : []),
  );
  elementPropertySelect.value = [...elementPropertySelect.options].some(
    (option) => option.value === currentProperty,
  )
    ? currentProperty
    : elementPropertySelect.options[0]?.value || "";
  condition.property = elementPropertySelect.value;
  root.querySelector("#property-condition-operator").value = [
    "equals",
    "notEquals",
    "empty",
    "notEmpty",
    "greaterThan",
    "lessThan",
    "contains",
  ].includes(condition.operator)
    ? condition.operator
    : "equals";
  root.querySelector("#condition-value-fields").hidden = [
    "empty",
    "notEmpty",
  ].includes(condition.operator);
  root.querySelector("#property-condition-value").value =
    condition.value ?? "null";
  }

  const { actions: configuredActions, elseActions: configuredElseActions } =
    getConditionActionLists(action);
  const actionLists = [
    {
      branch: "actions",
      heading: localize.ConditionIsMet[editorLanguage],
      actions: configuredActions,
    },
    {
      branch: "elseActions",
      heading: localize.ConditionIsNotMet[editorLanguage],
      actions: configuredElseActions,
    },
  ];
  actionLists.forEach(({ branch, heading, actions }) => {
    const list = root.querySelector(`#condition-${branch}`);
    list.replaceChildren();
    actions.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "condition-action";
      const title = document.createElement("span");
      title.className = "field-label";
      const actionLabel = localize.IndexedAction[editorLanguage].replace(
        "{index}",
        () => String(index + 1),
      );
      title.textContent = localize.ConditionActionTitle[editorLanguage]
        .replace("{condition}", () => heading)
        .replace("{action}", () => actionLabel);
      const type = document.createElement("select");
      type.dataset.conditionAction = "type";
      type.dataset.conditionBranch = branch;
      type.dataset.actionIndex = String(index);
      type.setAttribute("aria-label", `${title.textContent}: ${localize.ActionType[editorLanguage]}`);
      [
        ["showElement", localize.ShowElement[editorLanguage]],
        ["hideElement", localize.HideElement[editorLanguage]],
        ["navigate", localize.NavigateToPageAction[editorLanguage]],
        ["back", localize.GoBackAction[editorLanguage]],
        ["request", localize.SendAPIRequestAction[editorLanguage]],
        ["setVariable", localize.SetVariableAction[editorLanguage]],
        ["changeProperty", localize.ChangeElementPropertyAction[editorLanguage]],
        ["openService", localize.OpenTawakkalnaServiceAction[editorLanguage]],
        ["message", localize.ShowMessageAction[editorLanguage]],
        ["showSheet", localize.ShowSheetAction[editorLanguage]],
        ["hideSheet", localize.HideSheetAction[editorLanguage]],
        ["showToast", localize.ShowToastAction[editorLanguage]],
        ["function", localize.CallJavaScriptFunctionAction[editorLanguage]],
        ["globalAction", localize.CallGlobalAction[editorLanguage]],
        ["condition", localize.RunConditionalActionsAction[editorLanguage]],
        ...twkSystemActionOptions.map(([label, value]) => [value, label]),
      ].forEach(([value, label]) => type.add(new Option(label, value)));
      type.value = [
        "showElement",
        "hideElement",
        "navigate",
        "back",
        "request",
        "setVariable",
        "changeProperty",
        "openService",
        "message",
        "showSheet",
        "hideSheet",
        "showToast",
        "function",
        "globalAction",
        "condition",
        ...twkSystemActionOptions.map(([, value]) => value),
      ].includes(item.type)
        ? item.type
        : "showElement";
      row.append(title, type);

      if (["showElement", "hideElement"].includes(type.value)) {
        const pageElements = addTargetPagePicker(
          row,
          item,
          branch,
          index,
          title,
          "elementId",
        );
        const target = document.createElement("select");
        target.dataset.conditionAction = "elementId";
        target.dataset.conditionBranch = branch;
        target.dataset.actionIndex = String(index);
        target.setAttribute("aria-label", `${title.textContent}: ${localize.Element[editorLanguage]}`);
        getTargetOptions(pageElements, getElementName).forEach(
          ([label, value]) => target.add(new Option(label, value)),
        );
        target.value = pageElements.some(
          (candidate) => candidate.id === item.elementId,
        )
          ? item.elementId
          : pageElements[0]?.id || "";
        row.append(target);
      } else if (type.value === "navigate") {
        const target = document.createElement("select");
        target.dataset.conditionAction = "pageId";
        target.dataset.conditionBranch = branch;
        target.dataset.actionIndex = String(index);
        target.setAttribute("aria-label", `${title.textContent}: ${localize.PageAlternativeA[editorLanguage]}`);
        state.pages
          .filter((page) => page.kind === "page")
          .forEach((page) => target.add(new Option(page.name, page.id)));
        target.value = state.pages.some(
          (page) => page.kind === "page" && page.id === item.pageId,
        )
          ? item.pageId
          : state.pages.find((page) => page.kind === "page")?.id || "";
        row.append(target);
      } else if (type.value === "back") {
        row.append(
          Object.assign(document.createElement("span"), {
            textContent: localize.ReturnToPreviousPageOrStayOnFirstPage[editorLanguage],
          }),
        );
      } else if (["showSheet", "hideSheet"].includes(type.value)) {
        const pageElements = addTargetPagePicker(
          row,
          item,
          branch,
          index,
          title,
          "sheetId",
        );
        const sheets = pageElements.filter(
          (candidate) => candidate.type === "sheet",
        );
        const target = document.createElement("select");
        target.dataset.conditionAction = "sheetId";
        target.dataset.conditionBranch = branch;
        target.dataset.actionIndex = String(index);
        target.setAttribute("aria-label", `${title.textContent}: ${localize.SheetWindow[editorLanguage]}`);
        getTargetOptions(sheets, (candidate) =>
          candidate.content || candidate.id,
        ).forEach(
          ([label, value]) => target.add(new Option(label, value)),
        );
        target.value = sheets.some(
          (candidate) =>
            candidate.type === "sheet" && candidate.id === item.sheetId,
        )
          ? item.sheetId
          : sheets[0]?.id || "";
        row.append(target);
      } else if (type.value === "showToast") {
        const pageElements = addTargetPagePicker(
          row,
          item,
          branch,
          index,
          title,
          "toastId",
        );
        const toasts = pageElements.filter(
          (candidate) => candidate.type === "toast",
        );
        const target = document.createElement("select");
        target.dataset.conditionAction = "toastId";
        target.dataset.conditionBranch = branch;
        target.dataset.actionIndex = String(index);
        target.setAttribute("aria-label", `${title.textContent}: ${localize.ToastNotification[editorLanguage]}`);
        getTargetOptions(toasts, getElementName).forEach(
          ([label, value]) => target.add(new Option(label, value)),
        );
        target.value = toasts.some(
          (candidate) =>
            candidate.type === "toast" && candidate.id === item.toastId,
        )
          ? item.toastId
          : toasts[0]?.id || "";
        row.append(target);
      } else if (type.value === "function") {
        const source = document.createElement("select");
        source.dataset.conditionAction = "functionSource";
        source.dataset.conditionBranch = branch;
        source.dataset.actionIndex = String(index);
        source.setAttribute(
          "aria-label",
          `${title.textContent}: ${localize.FunctionSource[editorLanguage]}`,
        );
        source.add(
          new Option(localize.GlobalFunction[editorLanguage], "global"),
        );
        source.add(
          new Option(localize.JavaScriptAsset[editorLanguage], "asset"),
        );
        source.add(
          new Option(localize.PluginScriptExport[editorLanguage], "plugin"),
        );
        source.value = ["asset", "plugin"].includes(item.functionSource)
          ? item.functionSource
          : "global";
        row.append(source);

        if (source.value === "asset") {
          const script = document.createElement("select");
          script.dataset.conditionAction = "scriptAssetId";
          script.dataset.conditionBranch = branch;
          script.dataset.actionIndex = String(index);
          script.setAttribute(
            "aria-label",
            `${title.textContent}: ${localize.JavaScriptFile[editorLanguage]}`,
          );
          state.assets
            .filter(isJavaScriptAsset)
            .forEach((asset) => script.add(new Option(asset.name, asset.id)));
          if (!script.options.length)
            script.add(new Option(localize.AddJavaScriptAssetFirst[editorLanguage], ""));
          script.value = state.assets.some(
            (asset) =>
              isJavaScriptAsset(asset) && asset.id === item.scriptAssetId,
          )
            ? item.scriptAssetId
            : state.assets.find(isJavaScriptAsset)?.id || "";
          row.append(script);
        }

        if (source.value === "plugin") {
          const pageElements = addTargetPagePicker(
            row,
            item,
            branch,
            index,
            title,
            "pluginElementId",
          );
          const pluginElement = document.createElement("select");
          pluginElement.dataset.conditionAction = "pluginElementId";
          pluginElement.dataset.conditionBranch = branch;
          pluginElement.dataset.actionIndex = String(index);
          pluginElement.setAttribute(
            "aria-label",
            `${title.textContent}: ${localize.PluginElement[editorLanguage]}`,
          );
          const pluginElements = pageElements.filter(
            (element) =>
              element.type === "custom" &&
              state.userComponents.some(
                (component) =>
                  component.id === element.customComponentId &&
                  component.plugin,
              ),
          );
          getTargetOptions(pluginElements, getElementName).forEach(
            ([label, value]) =>
              pluginElement.add(new Option(label, value)),
          );
          pluginElement.value = pluginElements.some(
            (element) => element.id === item.pluginElementId,
          )
            ? item.pluginElementId
            : pluginElements[0]?.id || "";
          row.append(pluginElement);
        }

        const functionName = document.createElement("input");
        functionName.type = "text";
        functionName.dir = "ltr";
        functionName.value = item.functionName || "";
        functionName.placeholder = "myFunction";
        functionName.dataset.conditionAction = "functionName";
        functionName.dataset.conditionBranch = branch;
        functionName.dataset.actionIndex = String(index);
        functionName.setAttribute(
          "aria-label",
          `${title.textContent}: ${localize.FunctionName[editorLanguage]}`,
        );
        const parameters = document.createElement("textarea");
        parameters.rows = 2;
        parameters.dir = "ltr";
        parameters.value = item.parameters || "[]";
        parameters.placeholder = '["{{form.name}}", "{{var.user_id}}"]';
        parameters.dataset.conditionAction = "parameters";
        parameters.dataset.conditionBranch = branch;
        parameters.dataset.actionIndex = String(index);
        parameters.setAttribute(
          "aria-label",
          `${title.textContent}: ${localize.FunctionParametersJSON[editorLanguage]}`,
        );
        const resultVariable = document.createElement("select");
        resultVariable.dataset.conditionAction = "resultVariableId";
        resultVariable.dataset.conditionBranch = branch;
        resultVariable.dataset.actionIndex = String(index);
        resultVariable.setAttribute(
          "aria-label",
          `${title.textContent}: ${localize.StoreResultInVariable[editorLanguage]}`,
        );
        resultVariable.add(new Option(localize.DoNotStoreResult[editorLanguage], ""));
        state.variables
          .filter((variable) => variable.source === "static")
          .forEach((variable) =>
            resultVariable.add(new Option(variable.name, variable.id)),
          );
        resultVariable.value = state.variables.some(
          (variable) =>
            variable.source === "static" &&
            variable.id === item.resultVariableId,
        )
          ? item.resultVariableId
          : "";
        row.append(functionName, parameters, resultVariable);
        const help = document.createElement("span");
        help.className = "field-help";
        help.textContent = localize.OfflineAssetsFunctionHelp[editorLanguage];
        row.append(help);
      } else if (type.value === "request") {
        const target = document.createElement("select");
        target.dataset.conditionAction = "requestId";
        target.dataset.conditionBranch = branch;
        target.dataset.actionIndex = String(index);
        target.setAttribute("aria-label", `${title.textContent}: ${localize.APIRequest[editorLanguage]}`);
        state.requests.forEach((request) =>
          target.add(new Option(request.name, request.id)),
        );
        if (!state.requests.length)
          target.add(new Option(localize.AddARequestInAPISettings[editorLanguage], ""));
        target.value = state.requests.some(
          (request) => request.id === item.requestId,
        )
          ? item.requestId
          : state.requests[0]?.id || "";
        row.append(target);
      } else if (type.value === "setVariable") {
        const variable = document.createElement("select");
        variable.dataset.conditionAction = "variableId";
        variable.dataset.conditionBranch = branch;
        variable.dataset.actionIndex = String(index);
        variable.setAttribute("aria-label", `${title.textContent}: ${localize.Variable[editorLanguage]}`);
        state.variables
          .filter((candidate) => candidate.source === "static")
          .forEach((candidate) =>
            variable.add(new Option(candidate.name, candidate.id)),
          );
        if (!variable.options.length)
          variable.add(new Option(localize.AddAStaticVariable[editorLanguage], ""));
        if (!item.variableId)
          item.variableId =
            state.variables.find((candidate) => candidate.source === "static")
              ?.id || "";
        if (
          item.variableId &&
          ![...variable.options].some(
            (option) => option.value === item.variableId,
          )
        )
          variable.add(
            new Option(
              localize.MissingStaticVariable[editorLanguage].replace(
                "{id}",
                () => item.variableId,
              ),
              item.variableId,
            ),
          );
        variable.value = item.variableId || "";
        const value = document.createElement("textarea");
        value.rows = 2;
        value.dir = "ltr";
        value.spellcheck = false;
        value.value = item.value || "null";
        value.placeholder = localize.JSONValueOrFormToken[editorLanguage];
        value.dataset.conditionAction = "value";
        value.dataset.conditionBranch = branch;
        value.dataset.actionIndex = String(index);
        value.setAttribute("aria-label", `${title.textContent}: ${localize.Value[editorLanguage]}`);
        row.append(variable, value);
      } else if (type.value === "changeProperty") {
        const pageElements = addTargetPagePicker(
          row,
          item,
          branch,
          index,
          title,
          "targetElementId",
        );
        const target = document.createElement("select");
        target.dataset.conditionAction = "targetElementId";
        target.dataset.conditionBranch = branch;
        target.dataset.actionIndex = String(index);
        target.setAttribute("aria-label", `${title.textContent}: ${localize.Element[editorLanguage]}`);
        getTargetOptions(pageElements, (candidate) => candidate.id).forEach(
          ([label, value]) => target.add(new Option(label, value)),
        );
        target.value = pageElements.some(
          (candidate) => candidate.id === item.targetElementId,
        )
          ? item.targetElementId
          : pageElements[0]?.id || "";
        const property = document.createElement("select");
        property.dataset.conditionAction = "property";
        property.dataset.conditionBranch = branch;
        property.dataset.actionIndex = String(index);
        property.setAttribute("aria-label", `${title.textContent}: ${localize.Property[editorLanguage]}`);
        const targetElement =
          pageElements.find(
            (candidate) => candidate.id === item.targetElementId,
          ) || pageElements[0];
        getChangePropertyOptions(targetElement || { type: "" }).forEach(
          ([label, propertyValue]) =>
            property.add(new Option(label, propertyValue)),
        );
        property.value = [...property.options].some(
          (option) => option.value === item.property,
        )
          ? item.property
          : property.options[0]?.value || "";
        const valueType = getActionValueType(property.value);
        const value = document.createElement(
          valueType === "text"
            ? property.value === "content"
              ? "textarea"
              : "input"
            : "select",
        );
        value.dataset.conditionAction = "value";
        value.dataset.conditionBranch = branch;
        value.dataset.actionIndex = String(index);
        value.setAttribute("aria-label", `${title.textContent}: ${localize.Value[editorLanguage]}`);
        if (valueType === "boolean") {
          if (property.value === "visibility") {
            value.add(new Option(localize.ShowElement[editorLanguage], "show"));
            value.add(new Option(localize.HideElement[editorLanguage], "hide"));
            value.value = item.value === "hide" ? "hide" : "show";
          } else if (property.value === "checked") {
            value.add(new Option(localize.UncheckSwitch[editorLanguage], "false"));
            value.add(new Option(localize.CheckSwitch[editorLanguage], "true"));
            value.value =
              item.value === true || item.value === "true" ? "true" : "false";
          } else {
            value.add(new Option(localize.Enabled[editorLanguage], "false"));
            value.add(new Option(localize.Disabled[editorLanguage], "true"));
            value.value =
              item.value === true || item.value === "true" ? "true" : "false";
          }
        } else if (valueType === "variant") {
          getVariantOptions(targetElement?.type).forEach((variant) =>
            value.add(new Option(variantLabels[variant], variant)),
          );
          value.value = item.value || "primary";
        } else if (property.value === "assetId") {
          state.assets
            .filter((asset) => asset.type.startsWith("image/"))
            .forEach((asset) => value.add(new Option(asset.name, asset.id)));
          if (!value.options.length)
            value.add(new Option(localize.AddAnImageAssetFirst[editorLanguage], ""));
          value.value = state.assets.some(
            (asset) =>
              asset.type.startsWith("image/") && asset.id === item.value,
          )
            ? item.value
            : "";
        } else {
          if (value instanceof HTMLTextAreaElement) value.rows = 2;
          value.dir = "ltr";
          value.value = item.value ?? "";
          value.placeholder =
            property.value === "content"
              ? localize.TextOrFormToken[editorLanguage]
              : localize.ValueOrFormToken[editorLanguage];
        }
        row.append(target, property, value);
      } else if (type.value === "openService") {
        const serviceId = document.createElement("input");
        serviceId.type = "text";
        serviceId.dir = "ltr";
        serviceId.value = item.serviceId || "";
        serviceId.placeholder = "service_id";
        serviceId.dataset.conditionAction = "serviceId";
        serviceId.dataset.conditionBranch = branch;
        serviceId.dataset.actionIndex = String(index);
        serviceId.setAttribute(
          "aria-label",
          `${title.textContent}: ${localize.ServiceID[editorLanguage]}`,
        );
        const values = document.createElement("textarea");
        values.rows = 2;
        values.dir = "ltr";
        values.value = item.values || "{}";
        values.placeholder = localize.ValuesJSON[editorLanguage];
        values.dataset.conditionAction = "values";
        values.dataset.conditionBranch = branch;
        values.dataset.actionIndex = String(index);
        values.setAttribute("aria-label", `${title.textContent}: ${localize.Values[editorLanguage]}`);
        row.append(serviceId, values);
      } else if (type.value === "message") {
        const messageTitle = document.createElement("input");
        messageTitle.type = "text";
        messageTitle.maxLength = 80;
        messageTitle.value = item.title || "";
        messageTitle.placeholder = localize.Message[editorLanguage];
        messageTitle.dataset.conditionAction = "title";
        messageTitle.dataset.conditionBranch = branch;
        messageTitle.dataset.actionIndex = String(index);
        messageTitle.setAttribute(
          "aria-label",
          `${title.textContent}: ${localize.MessageDialogTitle[editorLanguage]}`,
        );
        const message = document.createElement("textarea");
        message.rows = 2;
        message.value = item.message || "";
        message.dataset.conditionAction = "message";
        message.dataset.conditionBranch = branch;
        message.dataset.actionIndex = String(index);
        message.setAttribute("aria-label", `${title.textContent}: ${localize.MessageText[editorLanguage]}`);
        row.append(messageTitle, message);
      } else if (type.value === "globalAction") {
        const globalAction = document.createElement("select");
        globalAction.dataset.conditionAction = "globalActionId";
        globalAction.dataset.conditionBranch = branch;
        globalAction.dataset.actionIndex = String(index);
        globalAction.setAttribute(
          "aria-label",
          `${title.textContent}: ${localize.GlobalActionNameLabel[editorLanguage]}`,
        );
        (state.settings.globalActions || []).forEach((action) =>
          globalAction.add(new Option(action.name, action.id)),
        );
        if (!globalAction.options.length)
          globalAction.add(
            new Option(localize.DefineAGlobalActionFirst[editorLanguage], ""),
          );
        if (!item.globalActionId)
          item.globalActionId = globalAction.options[0]?.value || "";
        if (
          item.globalActionId &&
          ![...globalAction.options].some(
            (option) => option.value === item.globalActionId,
          )
        )
          globalAction.add(
            new Option(
              localize.MissingGlobalAction[editorLanguage].replace(
                "{id}",
                () => item.globalActionId,
              ),
              item.globalActionId,
            ),
          );
        globalAction.value = item.globalActionId || "";
        row.append(globalAction);
      } else if (type.value === "condition") {
        const nestedCondition = document
          .querySelector("#action-condition-fields")
          .cloneNode(true);
        nestedCondition.hidden = false;
        nestedCondition.removeAttribute("id");
        nestedCondition.classList.add("condition-action-nested-condition");
        const nestedPath = [...actionPath, { branch, index }];
        // Include the full branch path in cloned IDs so recursively nested forms remain label-safe.
        row.append(nestedCondition);
        renderConditionOptions(item, nestedCondition, nestedPath, handlerContext);
        nestedCondition.querySelectorAll("[id]").forEach((field) => {
          const previousId = field.id;
          field.id = `${previousId}-${nestedPath.map(({ branch: pathBranch, index: pathIndex }) => `${pathBranch}-${pathIndex}`).join("-")}`;
          nestedCondition
            .querySelectorAll(`label[for="${previousId}"]`)
            .forEach((label) => {
              label.htmlFor = field.id;
            });
        });
      }

      const itemPath = [...actionPath, { branch, index }];
      row.querySelectorAll("[data-condition-action]").forEach((field) => {
        if (
          field.closest(".condition-action-nested-condition") !==
          (root.classList.contains("condition-action-nested-condition")
            ? root
            : null)
        )
          return;
        field.dataset.conditionActionPath = conditionActionPathValue(itemPath);
        if (handlerContext) {
          field.dataset.eventHandlerIndex = String(handlerContext.index);
          field.dataset.eventHandlerPrimary = String(handlerContext.isPrimary);
          field.dataset.eventHandlerAppLoad = String(handlerContext.appLoad);
        }
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button button-quiet condition-action-remove";
      remove.dataset.removeConditionAction = branch;
      remove.dataset.actionIndex = String(index);
      remove.dataset.conditionActionOwnerPath = actionPathValue;
      if (handlerContext) {
        remove.dataset.eventHandlerIndex = String(handlerContext.index);
        remove.dataset.eventHandlerPrimary = String(handlerContext.isPrimary);
        remove.dataset.eventHandlerAppLoad = String(handlerContext.appLoad);
      }
      remove.textContent = localize.RemoveAction[editorLanguage];
      row.append(remove);
      list.append(row);
    });
    const addButton = [...root.querySelectorAll(
      `[data-add-condition-action="${branch}"]`,
    )].find(
      (button) =>
        button.closest(".condition-action-nested-condition") ===
        (root.classList.contains("condition-action-nested-condition")
          ? root
          : null),
    );
    if (addButton) {
      addButton.dataset.conditionActionOwnerPath = actionPathValue;
      if (handlerContext) {
        addButton.dataset.eventHandlerIndex = String(handlerContext.index);
        addButton.dataset.eventHandlerPrimary = String(handlerContext.isPrimary);
        addButton.dataset.eventHandlerAppLoad = String(handlerContext.appLoad);
      }
    }
  });
}

  return { conditionActionPathValue, parseConditionActionPath, getConditionActionAtPath, getConditionOwnerForField, renderConditionOptions };
}
