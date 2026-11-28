// @ts-nocheck

// Renders condition sources, comparisons, nested conditions, and branch action forms.
import {
  getElementsOnPage,
  getTargetPageId,
} from "./action-selection.ts";
import { getWorkflowBranchActions } from "./graph.ts";

const CONDITION_OPERATORS = [
  "equals",
  "notEquals",
  "empty",
  "notEmpty",
  "greaterThan",
  "lessThan",
  "contains",
];

const VALUE_LESS_OPERATORS = new Set(["empty", "notEmpty"]);

const CONDITION_SOURCE_SECTIONS = [
  ["static", "#condition-static-fields"],
  ["endpoint", "#condition-api-fields"],
  ["variable", "#condition-variable-fields"],
  ["twk", "#condition-twk-fields"],
  ["form", "#condition-form-fields"],
  ["item", "#condition-item-fields"],
  ["extra", "#condition-extra-fields"],
  ["element", "#condition-element-fields"],
];

export function createWorkflowConditionEditor(dependencies) {
  const {
    state,
    editorLanguage,
    localize,
    TWK_FIELDS,
    variantLabels,
    twkSystemActionOptions,
    variableSourceTypes,
    getElementName,
    getChangePropertyOptions,
    getActionValueType,
    getVariantOptions,
    populateValueSourceOptions,
    isInsideCollection,
    normalizeExtraData,
    getElementSourcePropertyOptions,
    isJavaScriptAsset,
    getConditionActionLists,
    isWorkflowBranchAction,
  } = dependencies;

  const t = (key) => localize[key]?.[editorLanguage] ?? key;
  const conditionActionForField = new WeakMap();
  const conditionOwnerForField = new WeakMap();

  function populateSelectOptions(select, options, selectedValue, fallbackValue = "") {
    select.replaceChildren(
      ...options.map(([label, value]) => new Option(label, value)),
    );
    const hasSelected = options.some(([, value]) => value === selectedValue);
    select.value = hasSelected ? selectedValue : fallbackValue;
    return select.value;
  }

  function createBranchControl(tagName, { actionKey, branch, index, ariaLabel }) {
    const element = document.createElement(tagName);
    element.dataset.conditionAction = actionKey;
    element.dataset.conditionBranch = branch;
    element.dataset.actionIndex = String(index);
    element.setAttribute("aria-label", ariaLabel);
    return element;
  }

  function addTargetPagePicker(row, item, branch, index, title, targetField) {
    const pageId = getTargetPageId(state, item, targetField);
    const page = createBranchControl("select", {
      actionKey: "targetPageId",
      branch,
      index,
      ariaLabel: `${title.textContent}: ${t("TargetPage")}`,
    });
    const pageOptions = state.pages
      .filter((candidate) => candidate.kind === "page")
      .map((candidate) => [candidate.name, candidate.id]);
    populateSelectOptions(page, pageOptions, pageId, pageId);
    row.append(page);
    return getElementsOnPage(state, pageId);
  }

  function getTargetOptions(elements, labelFor) {
    return elements.length
      ? elements.map((element) => [labelFor(element), element.id])
      : [[t("NoMatchingElements"), ""]];
  }

  function conditionActionPathValue(path) {
    return path.map(({ branch, index }) => `${branch}:${index}`).join("/");
  }

  function parseConditionActionPath(value = "") {
    if (!value) return [];
    return value.split("/").map((part) => {
      const separatorIndex = part.lastIndexOf(":");
      return {
        branch: part.slice(0, separatorIndex),
        index: Number(part.slice(separatorIndex + 1)),
      };
    });
  }

  function getConditionActionAtPath(owner, path) {
    return path.reduce((action, step) => {
      if (!isWorkflowBranchAction(action)) return null;
      const actions = getWorkflowBranchActions(action, step.branch);
      return Number.isInteger(step.index) ? actions[step.index] || null : null;
    }, owner);
  }

  function getConditionOwnerForField(owner, field) {
    const directOwner = conditionOwnerForField.get(field);
    if (directOwner) return directOwner;
    const pathValue = field.dataset.conditionActionOwnerPath;
    if (
      field.closest(".condition-action-nested-condition") &&
      pathValue === undefined
    ) {
      return null;
    }
    return getConditionActionAtPath(owner, parseConditionActionPath(pathValue));
  }

  function getConditionActionForField(field) {
    return conditionActionForField.get(field) || null;
  }

  function syncConditionHeaderFields(
    condition,
    root,
    actionPathValue,
    handlerContext,
    ownerAction,
    actionPath,
  ) {
    if (handlerContext) {
      root.querySelectorAll('[id^="property-condition-"]').forEach((field) => {
        field.dataset.eventConditionField = field.id;
        field.dataset.conditionActionOwnerPath = actionPathValue;
        if (actionPath.length) conditionOwnerForField.set(field, ownerAction);
        field.dataset.eventHandlerIndex = String(handlerContext.index);
        field.dataset.eventHandlerPrimary = String(handlerContext.isPrimary);
        field.dataset.eventHandlerAppLoad = String(handlerContext.appLoad);
        if (handlerContext.globalActionId) {
          field.dataset.globalActionId = handlerContext.globalActionId;
        }
      });
    }

    const sourceSelect = root.querySelector("#property-condition-source");
    const eventIsAppLoad = handlerContext?.appLoad === true;
    const selectedContextElement = state.elements.find(
      (element) => element.id === state.selectedId,
    );
    populateValueSourceOptions(
      sourceSelect,
      !eventIsAppLoad &&
      Boolean(selectedContextElement && isInsideCollection(selectedContextElement)),
    );

    const requestSelect = root.querySelector("#property-condition-request");
    const requestOptions = state.requests.length
      ? state.requests.map((request) => [request.name, request.id])
      : [[t("AddARequestInAPISettings"), ""]];
    requestSelect.disabled = !state.requests.length;
    populateSelectOptions(
      requestSelect,
      requestOptions,
      condition.requestId,
      state.requests[0]?.id || "",
    );

    const variableSelect = root.querySelector("#property-condition-variable");
    const variableOptions = state.variables.length
      ? state.variables.map((variable) => [variable.name, variable.name])
      : [[t("AddAStaticVariable"), ""]];
    variableSelect.disabled = !state.variables.length;
    const variableName = populateSelectOptions(
      variableSelect,
      variableOptions,
      condition.variableName,
      state.variables[0]?.name || "",
    );

    const twkSelect = root.querySelector("#property-condition-twk-field");
    populateSelectOptions(
      twkSelect,
      TWK_FIELDS.map((field) => [field.label, field.key]),
      condition.fieldKey,
      TWK_FIELDS[0]?.key || "",
    );

    const source =
      condition.source === "api"
        ? "endpoint"
        : variableSourceTypes.includes(condition.source)
          ? condition.source
          : "endpoint";

    if (source === "variable" && variableName) {
      condition.variableName = variableName;
    }
    sourceSelect.value = source;

    CONDITION_SOURCE_SECTIONS.forEach(([sectionSource, selector]) => {
      root.querySelector(selector).hidden = source !== sectionSource;
    });

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

    const extraSelect = root.querySelector("#property-condition-extra");
    const extraOptions = state.elements.flatMap((element) =>
      normalizeExtraData(element.extraData).map((extra) => [
        `${getElementName(element)} · ${extra.key}`,
        `${element.id}.extra.${extra.key}`,
      ]),
    );
    if (!extraOptions.length) {
      extraOptions.push([t("AddAdditionalInfoFirst"), ""]);
    }
    populateSelectOptions(extraSelect, extraOptions, condition.extraPath || "", "");

    const elementPageSelect = root.querySelector("#property-condition-element-page");
    const elementPageId = getTargetPageId(
      state,
      condition,
      "elementId",
      "elementPageId",
    );
    populateSelectOptions(
      elementPageSelect,
      state.pages
        .filter((page) => page.kind === "page")
        .map((page) => [page.name, page.id]),
      elementPageId,
      elementPageId,
    );

    const pageElements = getElementsOnPage(state, elementPageId);
    const elementSelect = root.querySelector("#property-condition-element");
    const elementOptions = pageElements.length
      ? pageElements.map((element) => [getElementName(element), element.id])
      : [[t("NoMatchingElements"), ""]];
    const selectedElementId = populateSelectOptions(
      elementSelect,
      elementOptions,
      condition.elementId,
      pageElements[0]?.id || "",
    );
    condition.elementId = selectedElementId;

    const conditionElement = pageElements.find(
      (element) => element.id === selectedElementId,
    );
    const elementPropertySelect = root.querySelector(
      "#property-condition-element-property",
    );
    const propertyOptions = conditionElement
      ? getElementSourcePropertyOptions(conditionElement)
      : [];
    condition.property = populateSelectOptions(
      elementPropertySelect,
      propertyOptions,
      condition.property || "",
      propertyOptions[0]?.[1] || "",
    );

    root.querySelector("#property-condition-operator").value =
      CONDITION_OPERATORS.includes(condition.operator)
        ? condition.operator
        : "equals";
    root.querySelector("#condition-value-fields").hidden =
      VALUE_LESS_OPERATORS.has(condition.operator);
    root.querySelector("#property-condition-value").value =
      condition.value ?? "null";
  }

  function renderBranchActionRow(
    item,
    index,
    branch,
    heading,
    actionPath,
    handlerContext,
  ) {
    const row = document.createElement("div");
    row.className = "condition-action";

    const title = document.createElement("span");
    title.className = "field-label";
    const actionLabel = t("IndexedAction").replace("{index}", () =>
      String(index + 1),
    );
    title.textContent = t("ConditionActionTitle")
      .replace("{condition}", () => heading)
      .replace("{action}", () => actionLabel);

    const fieldLabel = (key) => `${title.textContent}: ${t(key)}`;

    const renderNestedCondition = () => {
      const nestedContainer = document.createElement("div");
      nestedContainer.className = "condition-action-nested-condition";

      const nestedFields = document
        .querySelector("#action-condition-fields")
        .cloneNode(true);
      nestedFields.hidden = false;
      nestedFields.removeAttribute("id");

      renderConditionOptions(item, nestedFields, actionPath, {
        ...handlerContext,
        branchOnly: false,
      });

      const suffix = `nested-${handlerContext?.index || 0}-${conditionActionPathValue(
        actionPath,
      ).replace(/[^A-Za-z0-9_-]/g, "-")}`;
      nestedFields.querySelectorAll("[id]").forEach((field) => {
        if (
          field.closest(".condition-action-nested-condition") !==
          nestedFields.closest(".condition-action-nested-condition")
        )
          return;
        const previousId = field.id;
        field.id = `${previousId}-${suffix}`;
        nestedFields
          .querySelectorAll(`label[for="${previousId}"]`)
          .forEach((label) => {
            label.htmlFor = field.id;
          });
      });

      nestedContainer.append(nestedFields);
      row.append(nestedContainer);
    };

    const actionTypeOptions = [
      ["showElement", t("ShowElement")],
      ["hideElement", t("HideElement")],
      ["navigate", t("NavigateToPageAction")],
      ["back", t("GoBackAction")],
      ["request", t("SendAPIRequestAction")],
      ["setVariable", t("SetVariableAction")],
      ["changeProperty", t("ChangeElementPropertyAction")],
      ["openService", t("OpenTawakkalnaServiceAction")],
      ["message", t("ShowMessageAction")],
      ["showSheet", t("ShowSheetAction")],
      ["hideSheet", t("HideSheetAction")],
      ["showToast", t("ShowToastAction")],
      ["function", t("CallJavaScriptFunctionAction")],
      ["globalAction", t("CallGlobalAction")],
      ...twkSystemActionOptions.map(([label, value]) => [value, label]),
    ];
    const availableActionTypeOptions =
      item.type === "condition"
        ? [
            ...actionTypeOptions,
            ["condition", t("RunConditionalActionsAction")],
          ]
        : actionTypeOptions;

    const type = createBranchControl("select", {
      actionKey: "type",
      branch,
      index,
      ariaLabel: fieldLabel("ActionType"),
    });
    populateSelectOptions(
      type,
      availableActionTypeOptions.map(([value, label]) => [label, value]),
      item.type,
      "showElement",
    );
    if (item.type === "condition") {
      const legacyConditionOption = Array.from(type.options).find(
        (option) => option.value === "condition",
      );
      if (legacyConditionOption) legacyConditionOption.disabled = true;
    }
    row.append(title, type);

    const renderElementVisibilityFields = () => {
      const pageElements = addTargetPagePicker(
        row,
        item,
        branch,
        index,
        title,
        "elementId",
      );
      const target = createBranchControl("select", {
        actionKey: "elementId",
        branch,
        index,
        ariaLabel: fieldLabel("Element"),
      });
      populateSelectOptions(
        target,
        getTargetOptions(pageElements, getElementName),
        item.elementId,
        pageElements[0]?.id || "",
      );
      row.append(target);
    };

    const renderSheetFields = () => {
      const pageElements = addTargetPagePicker(
        row,
        item,
        branch,
        index,
        title,
        "sheetId",
      );
      const sheets = pageElements.filter((candidate) => candidate.type === "sheet");
      const target = createBranchControl("select", {
        actionKey: "sheetId",
        branch,
        index,
        ariaLabel: fieldLabel("SheetWindow"),
      });
      populateSelectOptions(
        target,
        getTargetOptions(sheets, (candidate) => candidate.content || candidate.id),
        item.sheetId,
        sheets[0]?.id || "",
      );
      row.append(target);
    };

    const renderFunctionFields = () => {
      const source = createBranchControl("select", {
        actionKey: "functionSource",
        branch,
        index,
        ariaLabel: fieldLabel("FunctionSource"),
      });
      populateSelectOptions(
        source,
        [
          [t("GlobalFunction"), "global"],
          [t("JavaScriptAsset"), "asset"],
          [t("PluginScriptExport"), "plugin"],
        ],
        item.functionSource,
        "global",
      );
      row.append(source);

      if (source.value === "asset") {
        const script = createBranchControl("select", {
          actionKey: "scriptAssetId",
          branch,
          index,
          ariaLabel: fieldLabel("JavaScriptFile"),
        });
        const jsAssets = state.assets.filter(isJavaScriptAsset);
        const scriptOptions = jsAssets.length
          ? jsAssets.map((asset) => [asset.name, asset.id])
          : [[t("AddJavaScriptAssetFirst"), ""]];
        populateSelectOptions(
          script,
          scriptOptions,
          item.scriptAssetId,
          jsAssets[0]?.id || "",
        );
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
        const pluginElements = pageElements.filter(
          (element) =>
            element.type === "custom" &&
            state.userComponents.some(
              (component) =>
                component.id === element.customComponentId && component.plugin,
            ),
        );
        const pluginElement = createBranchControl("select", {
          actionKey: "pluginElementId",
          branch,
          index,
          ariaLabel: fieldLabel("PluginElement"),
        });
        populateSelectOptions(
          pluginElement,
          getTargetOptions(pluginElements, getElementName),
          item.pluginElementId,
          pluginElements[0]?.id || "",
        );
        row.append(pluginElement);
      }

      const functionName = createBranchControl("input", {
        actionKey: "functionName",
        branch,
        index,
        ariaLabel: fieldLabel("FunctionName"),
      });
      functionName.type = "text";
      functionName.dir = "ltr";
      functionName.value = item.functionName || "";
      functionName.placeholder = "myFunction";

      const parameters = createBranchControl("textarea", {
        actionKey: "parameters",
        branch,
        index,
        ariaLabel: fieldLabel("FunctionParametersJSON"),
      });
      parameters.rows = 2;
      parameters.dir = "ltr";
      parameters.value = item.parameters || "[]";
      parameters.placeholder = '["{{form.name}}", "{{var.user_id}}"]';

      const resultVariable = createBranchControl("select", {
        actionKey: "resultVariableId",
        branch,
        index,
        ariaLabel: fieldLabel("StoreResultInVariable"),
      });
      const staticVarOptions = [
        [t("DoNotStoreResult"), ""],
        ...state.variables
          .filter((variable) => variable.source === "static")
          .map((variable) => [variable.name, variable.id]),
      ];
      populateSelectOptions(
        resultVariable,
        staticVarOptions,
        item.resultVariableId,
        "",
      );

      const help = document.createElement("span");
      help.className = "field-help";
      help.textContent = t("OfflineAssetsFunctionHelp");

      row.append(functionName, parameters, resultVariable, help);
    };

    const renderChangePropertyFields = () => {
      const pageElements = addTargetPagePicker(
        row,
        item,
        branch,
        index,
        title,
        "targetElementId",
      );
      const target = createBranchControl("select", {
        actionKey: "targetElementId",
        branch,
        index,
        ariaLabel: fieldLabel("Element"),
      });
      populateSelectOptions(
        target,
        getTargetOptions(pageElements, (candidate) => candidate.id),
        item.targetElementId,
        pageElements[0]?.id || "",
      );

      const targetElement =
        pageElements.find((candidate) => candidate.id === item.targetElementId) ||
        pageElements[0];

      const property = createBranchControl("select", {
        actionKey: "property",
        branch,
        index,
        ariaLabel: fieldLabel("Property"),
      });
      const propOptions = getChangePropertyOptions(targetElement || { type: "" });
      populateSelectOptions(
        property,
        propOptions,
        item.property,
        propOptions[0]?.[1] || "",
      );

      const valueType = getActionValueType(property.value);
      const tagName =
        valueType === "text"
          ? property.value === "content"
            ? "textarea"
            : "input"
          : "select";
      const value = createBranchControl(tagName, {
        actionKey: "value",
        branch,
        index,
        ariaLabel: fieldLabel("Value"),
      });

      if (valueType === "boolean") {
        if (property.value === "visibility") {
          populateSelectOptions(
            value,
            [
              [t("ShowElement"), "show"],
              [t("HideElement"), "hide"],
            ],
            item.value === "hide" ? "hide" : "show",
            "show",
          );
        } else if (property.value === "checked") {
          populateSelectOptions(
            value,
            [
              [t("UncheckSwitch"), "false"],
              [t("CheckSwitch"), "true"],
            ],
            item.value === true || item.value === "true" ? "true" : "false",
            "false",
          );
        } else {
          populateSelectOptions(
            value,
            [
              [t("Enabled"), "false"],
              [t("Disabled"), "true"],
            ],
            item.value === true || item.value === "true" ? "true" : "false",
            "false",
          );
        }
      } else if (valueType === "variant") {
        populateSelectOptions(
          value,
          getVariantOptions(targetElement?.type).map((variant) => [
            variantLabels[variant],
            variant,
          ]),
          item.value || "primary",
          "primary",
        );
      } else if (property.value === "assetId") {
        const imageAssets = state.assets
          .filter((asset) => asset.type.startsWith("image/"))
          .map((asset) => [asset.name, asset.id]);
        if (!imageAssets.length) {
          imageAssets.push([t("AddAnImageAssetFirst"), ""]);
        }
        populateSelectOptions(value, imageAssets, item.value, "");
      } else {
        if (value instanceof HTMLTextAreaElement) value.rows = 2;
        value.dir = "ltr";
        value.value = item.value ?? "";
        value.placeholder =
          property.value === "content"
            ? t("TextOrFormToken")
            : t("ValueOrFormToken");
      }

      row.append(target, property, value);
    };

    const branchActionRenderers = {
      showElement: renderElementVisibilityFields,
      hideElement: renderElementVisibilityFields,
      navigate: () => {
        const target = createBranchControl("select", {
          actionKey: "pageId",
          branch,
          index,
          ariaLabel: fieldLabel("PageAlternativeA"),
        });
        const pageOptions = state.pages
          .filter((page) => page.kind === "page")
          .map((page) => [page.name, page.id]);
        populateSelectOptions(
          target,
          pageOptions,
          item.pageId,
          pageOptions[0]?.[1] || "",
        );
        row.append(target);
      },
      back: () => {
        row.append(
          Object.assign(document.createElement("span"), {
            textContent: t("ReturnToPreviousPageOrStayOnFirstPage"),
          }),
        );
      },
      showSheet: renderSheetFields,
      hideSheet: renderSheetFields,
      showToast: () => {
        const pageElements = addTargetPagePicker(
          row,
          item,
          branch,
          index,
          title,
          "toastId",
        );
        const toasts = pageElements.filter((candidate) => candidate.type === "toast");
        const target = createBranchControl("select", {
          actionKey: "toastId",
          branch,
          index,
          ariaLabel: fieldLabel("ToastNotification"),
        });
        populateSelectOptions(
          target,
          getTargetOptions(toasts, getElementName),
          item.toastId,
          toasts[0]?.id || "",
        );
        row.append(target);
      },
      function: renderFunctionFields,
      request: () => {
        const target = createBranchControl("select", {
          actionKey: "requestId",
          branch,
          index,
          ariaLabel: fieldLabel("APIRequest"),
        });
        const requestOptions = state.requests.length
          ? state.requests.map((request) => [request.name, request.id])
          : [[t("AddARequestInAPISettings"), ""]];
        populateSelectOptions(
          target,
          requestOptions,
          item.requestId,
          state.requests[0]?.id || "",
        );
        row.append(target);
      },
      setVariable: () => {
        const variable = createBranchControl("select", {
          actionKey: "variableId",
          branch,
          index,
          ariaLabel: fieldLabel("Variable"),
        });
        const staticVars = state.variables
          .filter((candidate) => candidate.source === "static")
          .map((candidate) => [candidate.name, candidate.id]);
        if (!staticVars.length) {
          staticVars.push([t("AddAStaticVariable"), ""]);
        }
        if (!item.variableId) {
          item.variableId =
            state.variables.find((candidate) => candidate.source === "static")
              ?.id || "";
        }
        if (
          item.variableId &&
          !staticVars.some(([, id]) => id === item.variableId)
        ) {
          staticVars.push([
            t("MissingStaticVariable").replace("{id}", () => item.variableId),
            item.variableId,
          ]);
        }
        populateSelectOptions(variable, staticVars, item.variableId || "", "");

        const value = createBranchControl("textarea", {
          actionKey: "value",
          branch,
          index,
          ariaLabel: fieldLabel("Value"),
        });
        value.rows = 2;
        value.dir = "ltr";
        value.spellcheck = false;
        value.value = item.value || "null";
        value.placeholder = t("JSONValueOrFormToken");
        row.append(variable, value);
      },
      changeProperty: renderChangePropertyFields,
      openService: () => {
        const serviceId = createBranchControl("input", {
          actionKey: "serviceId",
          branch,
          index,
          ariaLabel: fieldLabel("ServiceID"),
        });
        serviceId.type = "text";
        serviceId.dir = "ltr";
        serviceId.value = item.serviceId || "";
        serviceId.placeholder = "service_id";

        const values = createBranchControl("textarea", {
          actionKey: "values",
          branch,
          index,
          ariaLabel: fieldLabel("Values"),
        });
        values.rows = 2;
        values.dir = "ltr";
        values.value = item.values || "{}";
        values.placeholder = t("ValuesJSON");
        row.append(serviceId, values);
      },
      message: () => {
        const messageTitle = createBranchControl("input", {
          actionKey: "title",
          branch,
          index,
          ariaLabel: fieldLabel("MessageDialogTitle"),
        });
        messageTitle.type = "text";
        messageTitle.maxLength = 80;
        messageTitle.value = item.title || "";
        messageTitle.placeholder = t("Message");

        const message = createBranchControl("textarea", {
          actionKey: "message",
          branch,
          index,
          ariaLabel: fieldLabel("MessageText"),
        });
        message.rows = 2;
        message.value = item.message || "";
        row.append(messageTitle, message);
      },
      globalAction: () => {
        const globalAction = createBranchControl("select", {
          actionKey: "globalActionId",
          branch,
          index,
          ariaLabel: fieldLabel("GlobalAction"),
        });
        const actions = state.settings.globalActions || [];
        const options = actions.length
          ? actions.map((action) => [action.name, action.id])
          : [[t("DefineAGlobalActionFirst"), ""]];
        populateSelectOptions(
          globalAction,
          options,
          item.globalActionId,
          actions[0]?.id || "",
        );
        row.append(globalAction);
      },
      condition: renderNestedCondition,
    };

    branchActionRenderers[type.value]?.();
    const actionPathValue = conditionActionPathValue(actionPath);
    const ownerPathValue = conditionActionPathValue(actionPath.slice(0, -1));
    const enclosingCondition = row.closest(".condition-action-nested-condition");
    row.querySelectorAll("[data-condition-action]").forEach((field) => {
      if (
        field.closest(".condition-action-nested-condition") !==
        enclosingCondition
      )
        return;
      field.dataset.conditionActionPath = actionPathValue;
      field.dataset.conditionActionOwnerPath = ownerPathValue;
      conditionActionForField.set(field, item);
    });
    return row;
  }

  function renderConditionOptions(
    action = {},
    root = document,
    actionPath = [],
    handlerContext = null,
    configuredActionLists = null,
  ) {
    const condition = handlerContext?.branchOnly
      ? {}
      : action.condition || (action.condition = {});
    const actionPathValue = conditionActionPathValue(actionPath);

    if (!handlerContext?.branchOnly) {
      syncConditionHeaderFields(
        condition,
        root,
        actionPathValue,
        handlerContext,
        action,
        actionPath,
      );
    }

    const { actions: configuredActions, elseActions: configuredElseActions } =
      getConditionActionLists(action);
    const actionLists = configuredActionLists || [
      {
        branch: "actions",
        heading: t("ConditionIsMet"),
        actions: configuredActions,
      },
      {
        branch: "elseActions",
        heading: t("ConditionIsNotMet"),
        actions: configuredElseActions,
      },
    ];

    actionLists.forEach(({ branch, heading, actions, listSelector }) => {
      const list = root.querySelector(listSelector || `#condition-${branch}`);
      if (!list) return;
      list.replaceChildren();
      actions.forEach((item, index) => {
        const row = renderBranchActionRow(
          item,
          index,
          branch,
          heading,
          [...actionPath, { branch, index }],
          handlerContext,
        );
        list.append(row);
      });
    });

    const enclosingCondition = root.closest(".condition-action-nested-condition");
    if (handlerContext) {
      root.querySelectorAll("[data-condition-action]").forEach((field) => {
        if (
          field.closest(".condition-action-nested-condition") !==
          enclosingCondition
        )
          return;
        field.dataset.eventHandlerIndex = String(handlerContext.index);
        field.dataset.eventHandlerPrimary = String(handlerContext.isPrimary);
        field.dataset.eventHandlerAppLoad = String(handlerContext.appLoad);
        if (handlerContext.globalActionId) {
          field.dataset.globalActionId = handlerContext.globalActionId;
        }
      });
    }

    root
      .querySelectorAll(
        "[data-add-condition-action], [data-remove-condition-action]",
      )
      .forEach((button) => {
        if (
          button.closest(".condition-action-nested-condition") !==
          enclosingCondition
        )
          return;
        button.dataset.conditionActionOwnerPath = actionPathValue;
        if (actionPath.length) conditionOwnerForField.set(button, action);
        if (!handlerContext) return;
        button.dataset.eventHandlerIndex = String(handlerContext.index);
        button.dataset.eventHandlerPrimary = String(handlerContext.isPrimary);
        button.dataset.eventHandlerAppLoad = String(handlerContext.appLoad);
        if (handlerContext.globalActionId) {
          button.dataset.globalActionId = handlerContext.globalActionId;
        }
      });
  }

  return {
    renderConditionOptions,
    getConditionOwnerForField,
    getConditionActionForField,
    conditionActionPathValue,
    parseConditionActionPath,
    getConditionActionAtPath,
  };
}