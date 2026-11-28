// @ts-nocheck

// Renders the type-specific controls for a workflow action node.
import {
  getElementsOnPage,
  getRequestIdOrDefault,
  getTargetPageId,
} from "./action-selection.ts";

const FORM_CAPABLE_ELEMENT_TYPES = new Set([
  "input",
  "textarea",
  "list",
  "checkbox",
  "radio",
  "switch",
  "filePicker",
]);

export function createWorkflowActionFields(dependencies) {
  const {
    state,
    editorLanguage,
    localize,
    variantLabels,
    getElementName,
    normalizeChangePropertyAction,
    getChangePropertyOptions,
    getVariantOptions,
    isJavaScriptAsset,
    getElementSourcePropertyOptions,
  } = dependencies;

  const t = (key) => localize[key][editorLanguage];

  return function renderWorkflowActionFields({
    handler,
    type,
    title,
    row,
    addSelect,
    addInput,
    addParameterList,
  }) {
    const fieldLabel = (key) => `${title.textContent}: ${t(key)}`;

    const getStandardPageOptions = () =>
      state.pages
        .filter((page) => page.kind === "page")
        .map((page) => [page.name, page.id]);

    const getStaticVariableOptions = () =>
      state.variables
        .filter((variable) => variable.source === "static")
        .map((variable) => [variable.name, variable.id]);

    const addElementTargetPage = (targetField) => {
      const pageId = getTargetPageId(state, handler, targetField);
      addSelect(
        "targetPageId",
        getStandardPageOptions(),
        pageId,
        fieldLabel("TargetPage"),
      );
      return getElementsOnPage(state, pageId);
    };

    const elementTargetOptions = (elements, getLabel) =>
      elements.length
        ? elements.map((element) => [getLabel(element), element.id])
        : [[t("NoMatchingElements"), ""]];

    const renderSwitchFields = () => {
      handler.switchSource ||= "element";
      addSelect(
        "switchSource",
        [
          [t("Element"), "element"],
          [t("Variable"), "variable"],
          [t("FormFieldAlternativeA"), "form"],
          [t("APIRequest"), "api"],
          [t("Value"), "static"],
        ],
        handler.switchSource,
        fieldLabel("SwitchSource"),
        t("SwitchSource"),
      );

      switch (handler.switchSource) {
        case "element": {
          const pageId = getTargetPageId(
            state,
            handler,
            "switchElementId",
            "switchElementPageId",
          );
          addSelect(
            "switchElementPageId",
            getStandardPageOptions(),
            pageId,
            fieldLabel("TargetPage"),
            t("TargetPage"),
          );

          const pageElements = getElementsOnPage(state, pageId);
          const elements = elementTargetOptions(pageElements, getElementName);
          const selectedElement = pageElements.some(
            (element) => element.id === handler.switchElementId,
          )
            ? handler.switchElementId
            : pageElements[0]?.id || "";
          handler.switchElementId = selectedElement;

          const elementSelect = addSelect(
            "switchElementId",
            elements,
            selectedElement,
            fieldLabel("Element"),
            t("Element"),
          );

          const target = state.elements.find(
            (element) => element.id === elementSelect.value,
          );
          const properties = getElementSourcePropertyOptions(
            target || { type: "" },
          );
          addSelect(
            "switchProperty",
            properties,
            handler.switchProperty || "value",
            fieldLabel("Property"),
            t("Property"),
          );
          break;
        }
        case "variable": {
          const variables = state.variables.map((variable) => [
            variable.name,
            variable.id,
          ]);
          if (!variables.length) {
            variables.push([t("AddAVariableFirst"), ""]);
          }
          addSelect(
            "switchVariableId",
            variables,
            handler.switchVariableId,
            fieldLabel("Variable"),
            t("Variable"),
          );
          break;
        }
        case "form": {
          const fields = state.elements
            .filter((element) => FORM_CAPABLE_ELEMENT_TYPES.has(element.type))
            .map((element) => [
              `${getElementName(element)} · ${element.fieldName || element.id}`,
              element.fieldName || element.id,
            ]);
          if (!fields.length) {
            fields.push([t("AddSourceElementFirst"), ""]);
          }
          addSelect(
            "switchFormField",
            fields,
            handler.switchFormField,
            fieldLabel("FormFieldAlternativeA"),
            t("FormFieldAlternativeA"),
          );
          break;
        }
        case "api": {
          addSelect(
            "switchRequestId",
            state.requests.map((request) => [request.name, request.id]),
            handler.switchRequestId,
            fieldLabel("APIRequest"),
            t("APIRequest"),
          );
          addInput(
            "switchPath",
            handler.switchPath,
            fieldLabel("DataPath"),
            { direction: "ltr", placeholder: "data.status" },
            t("DataPath"),
          );
          break;
        }
        default: {
          addInput(
            "switchStaticValue",
            handler.switchStaticValue ?? "null",
            fieldLabel("Value"),
            {
              multiline: true,
              direction: "ltr",
              placeholder: '"active", 18, true, or {{var.expected}}',
            },
            t("Value"),
          );
        }
      }
    };

    const renderChangePropertyFields = () => {
      const targetElements = addElementTargetPage("targetPageId");
      addSelect(
        "targetElementId",
        elementTargetOptions(targetElements, (element) => element.id),
        handler.targetElementId,
        fieldLabel("TargetElement"),
      );
      normalizeChangePropertyAction(handler);

      const resolvedTarget =
        targetElements.find(
          (candidate) => candidate.id === handler.targetElementId,
        ) || targetElements[0];

      const property = addSelect(
        "property",
        getChangePropertyOptions(resolvedTarget || { type: "" }),
        handler.property,
        fieldLabel("Property"),
      );

      switch (property.value) {
        case "visibility":
        case "disabled":
          addSelect(
            "value",
            property.value === "visibility"
              ? [
                [t("ShowElement"), "show"],
                [t("HideElement"), "hide"],
              ]
              : [
                [t("Enabled"), "false"],
                [t("Disabled"), "true"],
              ],
            handler.value,
            fieldLabel("State"),
          );
          break;
        case "checked":
          addSelect(
            "value",
            [
              [t("UncheckSwitch"), "false"],
              [t("CheckSwitch"), "true"],
            ],
            handler.value,
            fieldLabel("State"),
          );
          break;
        case "variant":
          addSelect(
            "value",
            getVariantOptions(resolvedTarget?.type).map((variant) => [
              variantLabels[variant],
              variant,
            ]),
            handler.value,
            fieldLabel("Variant"),
          );
          break;
        case "iconClass":
          addInput("value", handler.value, fieldLabel("FontAwesomeIconClass"), {
            direction: "ltr",
            placeholder: "fa-star",
          });
          break;
        case "assetId": {
          const imageAssets = state.assets
            .filter((asset) => asset.type.startsWith("image/"))
            .map((asset) => [asset.name, asset.id]);
          if (!imageAssets.length) {
            imageAssets.push([t("AddAnImageAssetFirst"), ""]);
          }
          addSelect(
            "value",
            imageAssets,
            handler.value,
            fieldLabel("ImageFromAssets"),
          );
          break;
        }
        default:
          addInput("value", handler.value, fieldLabel("Value"), {
            multiline: property.value === "content",
            direction: "ltr",
          });
      }
    };

    const renderFunctionFields = () => {
      const source = handler.functionSource || "global";
      addSelect(
        "functionSource",
        [
          [t("GlobalFunction"), "global"],
          [t("JavaScriptAsset"), "asset"],
          [t("PluginScriptExport"), "plugin"],
        ],
        source,
        fieldLabel("FunctionSource"),
      );

      if (source === "asset") {
        const scripts = state.assets
          .filter(isJavaScriptAsset)
          .map((asset) => [asset.name, asset.id]);
        if (!scripts.length) {
          scripts.push([t("AddJavaScriptAssetFirst"), ""]);
        }
        addSelect(
          "scriptAssetId",
          scripts,
          handler.scriptAssetId,
          fieldLabel("JavaScriptFile"),
        );
      }

      if (handler.functionSource === "plugin") {
        const pageElements = addElementTargetPage("pluginElementId");
        const pluginElements = pageElements.filter(
          (element) =>
            element.type === "custom" &&
            state.userComponents.some(
              (component) =>
                component.id === element.customComponentId && component.plugin,
            ),
        );
        addSelect(
          "pluginElementId",
          elementTargetOptions(pluginElements, getElementName),
          handler.pluginElementId,
          fieldLabel("PluginElement"),
        );
      }

      addInput(
        "functionName",
        handler.functionName,
        fieldLabel("FunctionName"),
        { direction: "ltr", placeholder: "myFunction" },
      );
      addParameterList(
        "parameters",
        handler.parameters || "[]",
        fieldLabel("Parameters"),
      );

      const variables = [
        [t("DoNotStoreResult"), ""],
        ...getStaticVariableOptions(),
      ];
      addSelect(
        "resultVariableId",
        variables,
        handler.resultVariableId,
        fieldLabel("StoreResultInVariable"),
      );

      const help = document.createElement("span");
      help.className = "field-help";
      help.textContent = t("FunctionArgumentsHelp");
      row.append(help);
    };

    const actionFieldRenderers = {
      request: () => {
        handler.requestId = getRequestIdOrDefault(
          state.requests,
          handler.requestId,
        );
        addSelect(
          "requestId",
          state.requests.map((request) => [request.name, request.id]),
          handler.requestId,
          fieldLabel("APIRequest"),
        );
      },
      switch: renderSwitchFields,
      openService: () => {
        addInput("serviceId", handler.serviceId, fieldLabel("ServiceID"));
        addInput("values", handler.values || "{}", fieldLabel("JSONValues"), {
          multiline: true,
          direction: "ltr",
        });
      },
      navigate: () => {
        addSelect(
          "pageId",
          getStandardPageOptions(),
          handler.pageId,
          fieldLabel("PageAlternativeA"),
        );
      },
      setVariable: () => {
        addSelect(
          "variableId",
          getStaticVariableOptions(),
          handler.variableId,
          fieldLabel("Variable"),
        );
        addInput("value", handler.value, fieldLabel("ValueJSONOrToken"), {
          multiline: true,
          direction: "ltr",
        });
      },
      changeProperty: renderChangePropertyFields,
      message: () => {
        addInput("title", handler.title, fieldLabel("MessageTitle"));
        addInput("message", handler.message, fieldLabel("MessageText"), {
          multiline: true,
        });
      },
      showSheet: () => {
        const pageElements = addElementTargetPage("sheetId");
        const sheets = pageElements.filter(
          (candidate) => candidate.type === "sheet",
        );
        addSelect(
          "sheetId",
          elementTargetOptions(
            sheets,
            (candidate) => candidate.content || candidate.id,
          ),
          handler.sheetId,
          fieldLabel("SheetWindow"),
        );
      },
      hideSheet: () => {
        const pageElements = addElementTargetPage("sheetId");
        const sheets = pageElements.filter(
          (candidate) => candidate.type === "sheet",
        );
        addSelect(
          "sheetId",
          elementTargetOptions(
            sheets,
            (candidate) => candidate.content || candidate.id,
          ),
          handler.sheetId,
          fieldLabel("SheetWindow"),
        );
      },
      showToast: () => {
        const pageElements = addElementTargetPage("toastId");
        const toasts = pageElements.filter(
          (candidate) => candidate.type === "toast",
        );
        addSelect(
          "toastId",
          elementTargetOptions(toasts, getElementName),
          handler.toastId,
          fieldLabel("ToastNotification"),
        );
      },
      function: renderFunctionFields,
      globalAction: () => {
        const actions = state.settings.globalActions || [];
        const options = actions.map((action) => [action.name, action.id]);
        if (!options.length) {
          options.push([t("DefineAGlobalActionFirst"), ""]);
        }
        addSelect(
          "globalActionId",
          options,
          handler.globalActionId,
          fieldLabel("GlobalAction"),
        );
      },
    };

    actionFieldRenderers[type.value]?.();
  };
}