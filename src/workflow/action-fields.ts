// @ts-nocheck
 
// Renders the type-specific controls for a workflow action node.
import {
  getElementsOnPage,
  getRequestIdOrDefault,
  getTargetPageId,
} from "./action-selection.ts";

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

  return function renderWorkflowActionFields({
    handler,
    type,
    title,
    row,
    addSelect,
    addInput,
    addParameterList,
  }) {
    const addElementTargetPage = (targetField) => {
      const pageId = getTargetPageId(state, handler, targetField);
      addSelect(
        "targetPageId",
        state.pages
          .filter((page) => page.kind === "page")
          .map((page) => [page.name, page.id]),
        pageId,
        `${title.textContent}: ${localize.TargetPage[editorLanguage]}`,
      );
      return getElementsOnPage(state, pageId);
    };
    const elementTargetOptions = (elements, getLabel) =>
      elements.length
        ? elements.map((element) => [getLabel(element), element.id])
        : [[localize.NoMatchingElements[editorLanguage], ""]];

    if (type.value === "request") {
      handler.requestId = getRequestIdOrDefault(
        state.requests,
        handler.requestId,
      );
      addSelect(
        "requestId",
        state.requests.map((request) => [request.name, request.id]),
        handler.requestId,
        `${title.textContent}: ${localize.APIRequest[editorLanguage]}`,
      );
    } else if (type.value === "switch") {
      handler.switchSource ||= "element";
      addSelect(
        "switchSource",
        [
          [localize.Element[editorLanguage], "element"],
          [localize.Variable[editorLanguage], "variable"],
          [localize.FormFieldAlternativeA[editorLanguage], "form"],
          [localize.APIRequest[editorLanguage], "api"],
          [localize.Value[editorLanguage], "static"],
        ],
        handler.switchSource,
        `${title.textContent}: ${localize.SwitchSource[editorLanguage]}`,
        localize.SwitchSource[editorLanguage],
      );
      if (handler.switchSource === "element") {
        const pageId = getTargetPageId(
          state,
          handler,
          "switchElementId",
          "switchElementPageId",
        );
        addSelect(
          "switchElementPageId",
          state.pages
            .filter((page) => page.kind === "page")
            .map((page) => [page.name, page.id]),
          pageId,
          `${title.textContent}: ${localize.TargetPage[editorLanguage]}`,
          localize.TargetPage[editorLanguage],
        );
        const pageElements = getElementsOnPage(state, pageId);
        const elements = elementTargetOptions(pageElements, getElementName);
        if (!pageElements.length)
          elements[0] = [
            localize.NoMatchingElements[editorLanguage],
            "",
          ];
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
          `${title.textContent}: ${localize.Element[editorLanguage]}`,
          localize.Element[editorLanguage],
        );
        const target = state.elements.find(
          (element) => element.id === elementSelect.value,
        );
        const properties = getElementSourcePropertyOptions(target || { type: "" });
        addSelect(
          "switchProperty",
          properties,
          handler.switchProperty || "value",
          `${title.textContent}: ${localize.Property[editorLanguage]}`,
          localize.Property[editorLanguage],
        );
      } else if (handler.switchSource === "variable") {
        const variables = state.variables.map((variable) => [
          variable.name,
          variable.id,
        ]);
        if (!variables.length)
          variables.push([localize.AddAVariableFirst[editorLanguage], ""]);
        addSelect(
          "switchVariableId",
          variables,
          handler.switchVariableId,
          `${title.textContent}: ${localize.Variable[editorLanguage]}`,
          localize.Variable[editorLanguage],
        );
      } else if (handler.switchSource === "form") {
        const fields = state.elements
          .filter((element) =>
            ["input", "textarea", "list", "checkbox", "radio", "switch", "filePicker"].includes(element.type),
          )
          .map((element) => [
            `${getElementName(element)} · ${element.fieldName || element.id}`,
            element.fieldName || element.id,
          ]);
        if (!fields.length)
          fields.push([localize.AddSourceElementFirst[editorLanguage], ""]);
        addSelect(
          "switchFormField",
          fields,
          handler.switchFormField,
          `${title.textContent}: ${localize.FormFieldAlternativeA[editorLanguage]}`,
          localize.FormFieldAlternativeA[editorLanguage],
        );
      } else if (handler.switchSource === "api") {
        addSelect(
          "switchRequestId",
          state.requests.map((request) => [request.name, request.id]),
          handler.switchRequestId,
          `${title.textContent}: ${localize.APIRequest[editorLanguage]}`,
          localize.APIRequest[editorLanguage],
        );
        addInput(
          "switchPath",
          handler.switchPath,
          `${title.textContent}: ${localize.DataPath[editorLanguage]}`,
          { direction: "ltr", placeholder: "data.status" },
          localize.DataPath[editorLanguage],
        );
      } else {
        addInput(
          "switchStaticValue",
          handler.switchStaticValue ?? "null",
          `${title.textContent}: ${localize.Value[editorLanguage]}`,
          {
            multiline: true,
            direction: "ltr",
            placeholder: '"active", 18, true, or {{var.expected}}',
          },
          localize.Value[editorLanguage],
        );
      }
    } else if (type.value === "openService") {
      addInput(
        "serviceId",
        handler.serviceId,
        `${title.textContent}: ${localize.ServiceID[editorLanguage]}`,
      );
      addInput(
        "values",
        handler.values || "{}",
        `${title.textContent}: ${localize.JSONValues[editorLanguage]}`,
        {
          multiline: true,
          direction: "ltr",
        },
      );
    } else if (type.value === "navigate") {
      addSelect(
        "pageId",
        state.pages
          .filter((page) => page.kind === "page")
          .map((page) => [page.name, page.id]),
        handler.pageId,
        `${title.textContent}: ${localize.PageAlternativeA[editorLanguage]}`,
      );
    } else if (type.value === "setVariable") {
      addSelect(
        "variableId",
        state.variables
          .filter((variable) => variable.source === "static")
          .map((variable) => [variable.name, variable.id]),
        handler.variableId,
        `${title.textContent}: ${localize.Variable[editorLanguage]}`,
      );
      addInput(
        "value", 
        handler.value,
        `${title.textContent}: ${localize.ValueJSONOrToken[editorLanguage]}`,
        {
          multiline: true,
          direction: "ltr",
        },
      );
    } else if (type.value === "changeProperty") {
      const targetElements = addElementTargetPage(
        "targetElementId",
        localize.TargetElement[editorLanguage],
      );
      addSelect(
        "targetElementId",
        elementTargetOptions(targetElements, (element) => element.id),
        handler.targetElementId,
        `${title.textContent}: ${localize.TargetElement[editorLanguage]}`,
      );
      normalizeChangePropertyAction(handler);
      const property = addSelect(
        "property",
        getChangePropertyOptions(
          targetElements.find(
            (candidate) => candidate.id === handler.targetElementId,
          ) ||
          targetElements[0] || { type: "" },
        ),
        handler.property,
        `${title.textContent}: ${localize.Property[editorLanguage]}`,
      );
      const propertyTarget =
        targetElements.find(
          (candidate) => candidate.id === handler.targetElementId,
        ) || targetElements[0];
      // The value control depends on the selected property, so use a type-appropriate editor.
      if (property.value === "visibility" || property.value === "disabled") {
        addSelect(
          "value",
          property.value === "visibility"
            ? [
              [localize.ShowElement[editorLanguage], "show"],
              [localize.HideElement[editorLanguage], "hide"],
            ]
            : [
              [localize.Enabled[editorLanguage], "false"],
              [localize.Disabled[editorLanguage], "true"],
            ],
          handler.value,
          `${title.textContent}: ${localize.State[editorLanguage]}`,
        );
      } else if (property.value === "checked") {
        addSelect(
          "value",
          [
            [localize.UncheckSwitch[editorLanguage], "false"],
            [localize.CheckSwitch[editorLanguage], "true"],
          ],
          handler.value,
          `${title.textContent}: ${localize.State[editorLanguage]}`,
        );
      } else if (property.value === "variant") {
        addSelect(
          "value",
          getVariantOptions(propertyTarget?.type).map((variant) => [
            variantLabels[variant],
            variant,
          ]),
          handler.value,
          `${title.textContent}: ${localize.Variant[editorLanguage]}`,
        );
      } else if (property.value === "iconClass") {
        addInput(
          "value",
          handler.value,
          `${title.textContent}: ${localize.FontAwesomeIconClass[editorLanguage]}`,
          {
            direction: "ltr",
            placeholder: "fa-star",
          },
        );
      } else if (property.value === "assetId") {
        const imageAssets = state.assets
          .filter((asset) => asset.type.startsWith("image/"))
          .map((asset) => [asset.name, asset.id]);
        if (!imageAssets.length)
          imageAssets.push([localize.AddAnImageAssetFirst[editorLanguage], ""]);
        addSelect(
          "value",
          imageAssets,
          handler.value,
          `${title.textContent}: ${localize.ImageFromAssets[editorLanguage]}`,
        );
      } else {
        addInput("value", handler.value, `${title.textContent}: ${localize.Value[editorLanguage]}`, {
          multiline: property.value === "content",
          direction: "ltr",
        });
      }
    } else if (type.value === "message") {
      addInput("title", handler.title, `${title.textContent}: ${localize.MessageTitle[editorLanguage]}`);
      addInput("message", handler.message, `${title.textContent}: ${localize.MessageText[editorLanguage]}`, {
        multiline: true,
      });
    } else if (["showSheet", "hideSheet"].includes(type.value)) {
      const pageElements = addElementTargetPage(
        "sheetId",
        localize.SheetWindow[editorLanguage],
      );
      const sheets = pageElements.filter(
        (candidate) => candidate.type === "sheet",
      );
      addSelect(
        "sheetId",
        elementTargetOptions(sheets, (candidate) =>
          candidate.content || candidate.id,
        ),
        handler.sheetId,
        `${title.textContent}: ${localize.SheetWindow[editorLanguage]}`,
      );
    } else if (type.value === "showToast") {
      const pageElements = addElementTargetPage(
        "toastId",
        localize.ToastNotification[editorLanguage],
      );
      const toasts = pageElements
        .filter((candidate) => candidate.type === "toast");
      addSelect(
        "toastId",
        elementTargetOptions(toasts, getElementName),
        handler.toastId,
        `${title.textContent}: ${localize.ToastNotification[editorLanguage]}`,
      );
    } else if (type.value === "function") {
      addSelect(
        "functionSource",
        [
          [localize.GlobalFunction[editorLanguage], "global"],
          [localize.JavaScriptAsset[editorLanguage], "asset"],
          [localize.PluginScriptExport[editorLanguage], "plugin"],
        ],
        handler.functionSource || "global",
        `${title.textContent}: ${localize.FunctionSource[editorLanguage]}`,
      );
      if ((handler.functionSource || "global") === "asset") {
        const scripts = state.assets
          .filter(isJavaScriptAsset)
          .map((asset) => [asset.name, asset.id]);
        if (!scripts.length)
          scripts.push([localize.AddJavaScriptAssetFirst[editorLanguage], ""]);
        addSelect(
          "scriptAssetId",
          scripts,
          handler.scriptAssetId,
          `${title.textContent}: ${localize.JavaScriptFile[editorLanguage]}`,
        );
      }
      if (handler.functionSource === "plugin") {
        const pageElements = addElementTargetPage(
          "pluginElementId",
          localize.PluginElement[editorLanguage],
        );
        const pluginElements = pageElements
          .filter(
            (element) =>
              element.type === "custom" &&
              state.userComponents.some(
                (component) =>
                  component.id === element.customComponentId &&
                  component.plugin,
              ),
          );
        addSelect(
          "pluginElementId",
          elementTargetOptions(pluginElements, getElementName),
          handler.pluginElementId,
          `${title.textContent}: ${localize.PluginElement[editorLanguage]}`,
        );
      }
      addInput(
        "functionName",
        handler.functionName,
        `${title.textContent}: ${localize.FunctionName[editorLanguage]}`,
        { direction: "ltr", placeholder: "myFunction" },
      );
      addParameterList(
        "parameters",
        handler.parameters || "[]",
        `${title.textContent}: ${localize.Parameters[editorLanguage]}`,
      );
      const variables = state.variables
        .filter((variable) => variable.source === "static")
        .map((variable) => [variable.name, variable.id]);
      variables.unshift([localize.DoNotStoreResult[editorLanguage], ""]);
      addSelect(
        "resultVariableId",
        variables,
        handler.resultVariableId,
        `${title.textContent}: ${localize.StoreResultInVariable[editorLanguage]}`,
      );
      const help = document.createElement("span");
      help.className = "field-help";
      help.textContent = localize.FunctionArgumentsHelp[editorLanguage];
      row.append(help);
    } else if (type.value === "globalAction") {
      const actions = state.settings.globalActions || [];
      const options = actions.map((action) => [action.name, action.id]);
      if (!options.length)
        options.push([localize.DefineAGlobalActionFirst[editorLanguage], ""]);
      addSelect(
        "globalActionId",
        options,
        handler.globalActionId,
        `${title.textContent}: ${localize.GlobalAction[editorLanguage]}`,
      );
    }

  };
}
