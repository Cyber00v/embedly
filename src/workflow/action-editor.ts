// @ts-nocheck
import { createWorkflowActionFields } from "./action-fields.ts";
import { createWorkflowConditionBranches } from "./condition-branches.ts";
import { getRequestIdOrDefault } from "./action-selection.ts";
import { getWorkflowActionBranches } from "./graph.ts";
 
// Composes trigger, token, action, and branch nodes into the interactive workflow graph.
export function createWorkflowActionEditor(dependencies) {
  const {
    state,
    editorLanguage,
    localize,
    variantLabels,
    getPluginEvents = () => [],
    twkSystemActionOptions,
    twkPermissionActionTypes,
    toast,
    getElementName,
    getChangePropertyOptions,
    normalizeChangePropertyAction,
    getVariantOptions,
    isWorkflowBranchAction,
    normalizeAppLoadHandlers,
    createId,
    isInsideCollection,
    createElement,
    escapeHtml,
    isJavaScriptAsset,
    getElementSourcePropertyOptions,
    clampNumber,
    ensureWorkflowActionIds,
    getWorkflowGraphLayout,
    getWorkflowEditorState,
    serializeWorkflowGraph,
    createWorkflowEdge,
    saveWorkflowGraphLayout,
    renderWorkflowEdges,
    getWorkflowTokenOptions,
    attachTokenPicker,
    renderWorkflowMinimap,
    attachWorkflowCanvasInteractions,
    writeWorkflowActions,
    deleteWorkflowAction,
    renderConditionOptions,
    renderTwkOptions,
    renderEndpointOptions,
    renderVariableOptions,
    showToast,
  } = dependencies;
  const renderWorkflowActionFields = createWorkflowActionFields({
    state, editorLanguage, localize, variantLabels, getElementName,
    normalizeChangePropertyAction, getChangePropertyOptions, getVariantOptions,
    isJavaScriptAsset, getElementSourcePropertyOptions,
  });
  const renderWorkflowConditionBranches = createWorkflowConditionBranches({
    renderConditionOptions, twkPermissionActionTypes, isWorkflowBranchAction,
    editorLanguage, localize, createId,
  });

function renderEventHandlers(
  action = {},
  { appLoad = false, globalActionId = "" } = {},
) {
  const globalAction = (state.settings.globalActions || []).find(
    (candidate) => candidate.id === globalActionId,
  );
  const globalWorkflow = Boolean(globalAction);
  const managedWorkflow = appLoad || globalWorkflow;
  const container = document.querySelector(
    appLoad
      ? "#app-load-event-handlers"
      : globalWorkflow
        ? "#global-action-event-handlers"
        : "#event-handlers",
  );
  container.replaceChildren();
  const selectedElement = state.elements.find(
    (element) => element.id === state.selectedId,
  );
  const graphKey = appLoad
    ? "app-load"
    : globalWorkflow
      ? `global-action:${globalActionId}`
      : `element:${selectedElement?.id || ""}`;
  const layout = getWorkflowGraphLayout(graphKey);
  layout.workflowNodeIds ||= {};
  const editorState = getWorkflowEditorState(graphKey);
  const toolbar = document.createElement("div");
  toolbar.className = "workflow-toolbar";
  toolbar.dataset.workflowGraph = graphKey;
  toolbar.innerHTML = `
    <button class="button button-quiet" type="button" data-workflow-zoom="out" aria-label="${localize.ZoomOut[editorLanguage]}">−</button>
    <span class="workflow-zoom-label">${Math.round(layout.zoom * 100)}%</span>
    <button class="button button-quiet" type="button" data-workflow-zoom="in" aria-label="${localize.ZoomIn[editorLanguage]}">+</button>
    <button class="button button-quiet" type="button" data-workflow-fit>${localize.FitView[editorLanguage]}</button>
    <button class="button button-quiet" type="button" data-workflow-minimap>${localize.Minimap[editorLanguage]}</button>
    <button class="button button-quiet" type="button" data-workflow-expand>${localize.Expand[editorLanguage]}</button>
    <span class="workflow-toolbar-hint">${localize.WorkflowToolbarHint[editorLanguage]}</span>`;
  const viewport = document.createElement("div");
  viewport.className = "workflow-viewport";
  viewport.dataset.workflowGraph = graphKey;
  viewport.tabIndex = 0;
  const workspace = document.createElement("div");
  workspace.className = "workflow-workspace";
  const stage = document.createElement("div");
  stage.className = "workflow-stage";
  stage.dataset.workflowGraph = graphKey;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("workflow-edges");
  svg.dataset.workflowGraph = graphKey;
  const nodeLayer = document.createElement("div");
  nodeLayer.className = "workflow-node-layer";
  stage.append(svg, nodeLayer);
  viewport.append(stage);
  const minimap = document.createElement("div");
  minimap.className = "workflow-minimap";
  minimap.hidden = !layout.minimapOpen;
  const inspector = document.createElement("aside");
  inspector.className = "workflow-inspector";
  inspector.setAttribute(
    "aria-label",
    localize.Properties[editorLanguage],
  );
  const inspectorTitle = document.createElement("h3");
  inspectorTitle.className = "workflow-inspector-title";
  inspectorTitle.textContent = localize.Properties[editorLanguage];
  const inspectorSummary = document.createElement("p");
  inspectorSummary.className = "workflow-inspector-summary";
  const inspectorEmpty = document.createElement("p");
  inspectorEmpty.className = "workflow-inspector-empty";
  inspectorEmpty.textContent =
    localize.SelectWorkflowNodeToEdit[editorLanguage];
  const inspectorContent = document.createElement("div");
  inspectorContent.className = "workflow-inspector-content";
  inspector.append(
    inspectorTitle,
    inspectorSummary,
    inspectorEmpty,
    inspectorContent,
  );
  workspace.append(viewport, inspector);
  container.classList.add("workflow-editor");
  container.append(toolbar, workspace, minimap);
  const handlers = appLoad
    ? normalizeAppLoadHandlers(action.handlers).map((handler) => ({
        ...handler,
        isPrimary: false,
        appLoad: true,
      }))
    : globalWorkflow
      ? (Array.isArray(action.handlers) ? action.handlers : [])
    : [
        {
          ...action,
          event:
            action.event ||
            (["checkbox", "radio", "switch"].includes(
              state.elements.find((element) => element.id === state.selectedId)
                ?.type,
            )
              ? "change"
              : "click"),
          type: action.type || "none",
          isPrimary: true,
        },
        ...(Array.isArray(action.handlers) ? action.handlers : []).map(
          (handler) => ({
            ...handler,
            isPrimary: false,
          }),
        ),
      ];
  const sourceHandlers = appLoad
    ? state.settings.appLoadHandlers
    : globalWorkflow
      ? globalAction.actions
    : selectedElement
      ? [
          selectedElement.action || {},
          ...(selectedElement.action?.handlers || []),
        ]
      : [];
  const branchRootWorkflowNodes = [];
  const workflowPropertiesByNodeId = new Map();
  const showNodeProperties = (nodeId) => {
    const nodeProperties = workflowPropertiesByNodeId.get(nodeId);
    inspectorContent.replaceChildren();
    if (!nodeProperties) {
      inspectorSummary.textContent = "";
      inspectorEmpty.hidden = false;
      return;
    }
    inspectorSummary.textContent = `${nodeProperties.title} · ${nodeProperties.type}`;
    inspectorEmpty.hidden = true;
    inspectorContent.append(nodeProperties.content);
  };
  // Keep IDs stable across redraws so persisted positions and connections stay attached to their nodes.
  handlers.forEach((handler, index) => {
    if (handler.type === "switch") {
      handler.cases = Array.isArray(handler.cases) ? handler.cases : [];
      handler.cases.forEach((item) => {
        item.id ||= createId();
        item.value ??= "null";
        item.actions = Array.isArray(item.actions) ? item.actions : [];
      });
      handler.defaultActions = Array.isArray(handler.defaultActions)
        ? handler.defaultActions
        : [];
    }
    if (handler.type === "request") {
      handler.requestId = getRequestIdOrDefault(
        state.requests,
        handler.requestId,
      );
      if (sourceHandlers[index])
        sourceHandlers[index].requestId = handler.requestId;
    }
    if (handler.type === "setVariable" && !handler.variableId) {
      const defaultVariableId = state.variables.find(
        (variable) => variable.source === "static",
      )?.id;
      if (defaultVariableId) {
        handler.variableId = defaultVariableId;
        if (sourceHandlers[index])
          sourceHandlers[index].variableId = defaultVariableId;
      }
    }
    if (handler.type === "globalAction" && !handler.globalActionId) {
      const defaultGlobalActionId = state.settings.globalActions?.[0]?.id;
      if (defaultGlobalActionId) {
        handler.globalActionId = defaultGlobalActionId;
        if (sourceHandlers[index])
          sourceHandlers[index].globalActionId = defaultGlobalActionId;
      }
    }
    handler.workflowId ||=
      sourceHandlers[index]?.workflowId ||
      layout.workflowNodeIds[index] ||
      createId();
    layout.workflowNodeIds[index] = handler.workflowId;
    if (sourceHandlers[index]) sourceHandlers[index].workflowId ||= handler.workflowId;
  });
  ensureWorkflowActionIds(sourceHandlers);
  const eventOptions = [
    [localize.Click[editorLanguage], "click"],
    [localize.Change[editorLanguage], "change"],
    [localize.Input[editorLanguage], "input"],
    ...(!appLoad && !globalWorkflow && selectedElement
      ? getPluginEvents(selectedElement).map((eventName) => [
          eventName,
          eventName,
        ])
      : []),
    ...(selectedElement?.type === "filePicker"
      ? [[localize.OnFilesSelected[editorLanguage], "onFilesSelected"]]
      : []),
    ...(selectedElement && isInsideCollection(selectedElement)
      ? [
          [localize.OnItemRender[editorLanguage], "onItemRender"],
          [localize.OnItemDidRender[editorLanguage], "onItemDidRender"],
        ]
      : []),
  ];
  const eventGroups = new Map();
  handlers.forEach((handler, index) => {
    const eventName = appLoad
      ? "load"
      : globalWorkflow
        ? "global"
        : handler.event || "click";
    if (!eventGroups.has(eventName)) eventGroups.set(eventName, []);
    eventGroups.get(eventName).push(index);
  });
  const triggerIds = new Map();
  let laneIndex = 0;
  layout.edges = layout.edges.filter((edge) => edge.kind !== "branch");
  eventGroups.forEach((_, eventName) => {
    const triggerId = `trigger:${graphKey}:${eventName}`;
    triggerIds.set(eventName, triggerId);
    const trigger = document.createElement("section");
      trigger.tabIndex = 0;
    trigger.className = "workflow-node workflow-trigger-node";
    trigger.dataset.workflowNodeId = triggerId;
    trigger.dataset.workflowEventName = eventName;
    trigger.dataset.workflowGraph = graphKey;
    trigger.style.left = `${layout.positions[triggerId]?.x ?? 32}px`;
    trigger.style.top = `${layout.positions[triggerId]?.y ?? 220 + laneIndex * 980}px`;
    const header = document.createElement("div");
    header.className = "workflow-node-header";
    header.innerHTML = `<span class="workflow-node-icon">▶</span><strong>${localize.Trigger[editorLanguage]}</strong><span class="workflow-node-kind">${appLoad ? localize.AppLoad[editorLanguage] : globalWorkflow ? localize.GlobalAction[editorLanguage] : localize.ElementEvent[editorLanguage]}</span>`;
    header.dataset.workflowDrag = "";
    trigger.append(header);
    const output = document.createElement("button");
    output.type = "button";
    output.className = "workflow-handle workflow-handle-output";
    output.dataset.workflowHandle = "out";
    output.dataset.workflowNodeId = triggerId;
    output.dataset.workflowPortId = triggerId;
    output.setAttribute("aria-label", localize.TriggerOutput[editorLanguage]);
    trigger.append(output);
    nodeLayer.append(trigger);
    laneIndex += 1;
  });

  const tokenOptions = getWorkflowTokenOptions(
    managedWorkflow ? null : selectedElement,
    globalWorkflow,
  );
  tokenOptions
    .filter((token) => !layout.hiddenTokenIds?.includes(token.id))
    .forEach((token, index) => {
    const tokenNode = document.createElement("div");
    tokenNode.className = "workflow-token-node";
    tokenNode.tabIndex = 0;
    tokenNode.dataset.workflowDrag = "";
    tokenNode.dataset.workflowNodeId = token.id;
    const tokenPosition = layout.positions[token.id] || {
      x: 32 + index * 230,
      y: 24,
    };
    tokenNode.style.left = `${tokenPosition.x}px`;
    tokenNode.style.top = `${tokenPosition.y}px`;
    tokenNode.innerHTML = `<span class="workflow-token-icon">{ }</span><label>${escapeHtml(token.label)}<select></select></label>`;
    const tokenSelect = tokenNode.querySelector("select");
    tokenSelect.setAttribute(
      "aria-label",
      localize.TokenValueField[editorLanguage].replace(
        "{token}",
        () => token.label,
      ),
    );
    token.tokens.forEach((option) =>
      tokenSelect.add(new Option(option.label, option.token)),
    );
    tokenNode.dataset.workflowToken = token.tokens[0].token;
    tokenSelect.addEventListener("change", () => {
      tokenNode.dataset.workflowToken = tokenSelect.value;
    });
    const tokenDrag = document.createElement("button");
    tokenDrag.type = "button";
    tokenDrag.className = "workflow-token-drag-source";
    tokenDrag.draggable = true;
    tokenDrag.dataset.workflowTokenDrag = "";
    tokenDrag.textContent = "↗";
    tokenDrag.setAttribute(
      "aria-label",
      localize.DragTokenIntoField[editorLanguage].replace(
        "{token}",
        () => token.label,
      ),
    );
    tokenDrag.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData(
        "application/x-workflow-token-value",
        tokenNode.dataset.workflowToken || "",
      );
    });
    if (token.itemPathInput) {
      const pathInput = document.createElement("input");
      pathInput.type = "text";
      pathInput.className = "workflow-token-path";
      pathInput.placeholder = "item.path";
      pathInput.setAttribute(
        "aria-label",
        localize.CustomItemPropertyPath[editorLanguage],
      );
      pathInput.addEventListener("input", () => {
        const path = pathInput.value.trim();
        if (/^[A-Za-z_$][\w$-]*(?:\.[A-Za-z_$][\w$-]*|\.\d+)*$/.test(path))
          tokenNode.dataset.workflowToken = `{{item.${path}}}`;
      });
      tokenNode.querySelector("label").append(pathInput);
    }
    tokenNode.append(tokenDrag);
    nodeLayer.append(tokenNode);
  });

  handlers.forEach((handler, index) => {
    const row = document.createElement("div");
    row.tabIndex = 0;
    row.className = `workflow-node workflow-action-node${handler.type === "condition" ? " workflow-condition-node" : twkPermissionActionTypes.includes(handler.type) ? " workflow-permission-node" : ""}`;
    row.dataset.workflowNodeId = `action:${handler.workflowId}`;
    row.dataset.workflowEventName = appLoad
      ? "load"
      : globalWorkflow
        ? "global"
        : handler.event || "click";
    row.dataset.workflowGraph = graphKey;
    row.dataset.workflowHandle = "in";
    row.dataset.workflowPortId = row.dataset.workflowNodeId;
    const propertyForm = document.createElement("div");
    propertyForm.className =
      "condition-action event-action-card workflow-node-properties";
    propertyForm.dataset.workflowNodeId = row.dataset.workflowNodeId;
    propertyForm.dataset.workflowEventName = row.dataset.workflowEventName;
    propertyForm.dataset.workflowGraph = graphKey;
    const eventIndices = eventGroups.get(row.dataset.workflowEventName) || [];
    const eventIndex = eventIndices.indexOf(index);
    const actionPosition =
      layout.positions[row.dataset.workflowNodeId] || {
        x: 360 + eventIndex * 390,
        y: 220 + [...eventGroups.keys()].indexOf(row.dataset.workflowEventName) * 980,
      };
    row.style.left = `${actionPosition.x}px`;
    row.style.top = `${actionPosition.y}px`;
    const outputHandle = document.createElement("button");
    if (isWorkflowBranchAction(handler)) {
      getWorkflowActionBranches(handler, isWorkflowBranchAction).forEach(
        ({ key: branch, label }, branchIndex, branches) => {
        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = `workflow-handle workflow-handle-output ${
          branch === "actions"
            ? "workflow-handle-condition-true"
            : branch === "elseActions"
              ? "workflow-handle-condition-false"
              : "workflow-handle-switch-case"
        }`;
        handle.dataset.workflowHandle = "out";
        handle.dataset.workflowNodeId = row.dataset.workflowNodeId;
        handle.dataset.workflowPortId = `${row.dataset.workflowNodeId}:${branch}`;
        handle.dataset.workflowBranch = branch;
        if (handler.type === "switch") {
          handle.style.top = `${Math.round(
            ((branchIndex + 1) / (branches.length + 1)) * 100,
          )}%`;
          handle.style.transform = "translateY(-50%)";
        }
        const branchLabel =
          twkPermissionActionTypes.includes(handler.type)
            ? branch === "actions"
              ? localize.Granted[editorLanguage]
              : localize.Denied[editorLanguage]
            : handler.type === "switch"
              ? label === "Default"
                ? localize.DefaultBranch[editorLanguage]
                : `${localize.CaseMatchValue[editorLanguage]}: ${label}`
              : branch === "actions"
                ? localize.True[editorLanguage]
                : localize.False[editorLanguage];
        handle.setAttribute(
          "aria-label",
          localize.BranchOutput[editorLanguage].replace(
            "{branch}",
            () => branchLabel,
          ),
        );
        row.append(handle);
        const portLabel = document.createElement("span");
        portLabel.className = `workflow-branch-port-label workflow-branch-port-${branch === "actions" ? "true" : branch === "elseActions" ? "false" : "switch"}`;
        portLabel.textContent = branchLabel;
        if (handler.type === "switch") {
          portLabel.style.top = handle.style.top;
          portLabel.style.right = "-10px";
          portLabel.style.transform = "translate(100%, -50%)";
        }
        row.append(portLabel);
      });
    } else {
      outputHandle.type = "button";
      outputHandle.className = "workflow-handle workflow-handle-output";
      outputHandle.dataset.workflowHandle = "out";
      outputHandle.dataset.workflowNodeId = row.dataset.workflowNodeId;
      outputHandle.dataset.workflowPortId = row.dataset.workflowNodeId;
      outputHandle.setAttribute("aria-label", localize.ActionOutput[editorLanguage]);
      row.append(outputHandle);
    }
    const nodeHeader = document.createElement("div");
    nodeHeader.className = "workflow-node-header";
    nodeHeader.dataset.workflowDrag = "";
    const nodeIcon = document.createElement("span");
    nodeIcon.className = "workflow-node-icon";
    nodeIcon.textContent = isWorkflowBranchAction(handler) ? "?" : "↻";
    nodeHeader.append(nodeIcon);
    const title = document.createElement("span");
    title.className = "event-action-title";
    title.textContent = handler.workflowTitle || "";
    nodeHeader.append(title);
    const nodeKind = document.createElement("span");
    nodeKind.className = "workflow-node-kind";
    nodeHeader.append(nodeKind);
    row.append(nodeHeader);
    const addFieldLabel = (field, control, labelText) => {
      if (!labelText) return;
      const fieldId = `workflow-${handler.workflowId}-${field}`;
      control.id = fieldId;
      const label = document.createElement("label");
      label.className = "field-label workflow-action-field-label";
      label.htmlFor = fieldId;
      label.textContent = labelText;
      propertyForm.append(label);
    };
    const addSelect = (field, options, value, ariaLabel, labelText = "") => {
      const select = document.createElement("select");
      select.dataset.eventHandlerField = field;
      select.dataset.eventHandlerIndex = String(index);
      select.dataset.eventHandlerPrimary = String(handler.isPrimary);
      select.dataset.eventHandlerAppLoad = String(appLoad);
      if (globalWorkflow) select.dataset.globalActionId = globalActionId;
      select.setAttribute("aria-label", ariaLabel);
      options.forEach(([label, optionValue]) =>
        select.add(new Option(label, optionValue)),
      );
      select.value = value || options[0]?.[1] || "";
      addFieldLabel(field, select, labelText);
      propertyForm.append(select);
      return select;
    };
    const addInput = (field, value, ariaLabel, options = {}, labelText = "") => {
      const input = document.createElement(
        options.multiline ? "textarea" : "input",
      );
      if (!options.multiline) input.type = "text";
      if (options.multiline) input.rows = options.rows || 2;
      if (options.direction) input.dir = options.direction;
      input.value = value ?? "";
      input.placeholder = options.placeholder || "";
      input.dataset.eventHandlerField = field;
      input.dataset.eventHandlerIndex = String(index);
      input.dataset.eventHandlerPrimary = String(handler.isPrimary);
      input.dataset.eventHandlerAppLoad = String(appLoad);
      if (globalWorkflow) input.dataset.globalActionId = globalActionId;
      input.dataset.workflowInputId = `${index}-${field}`;
      input.setAttribute("aria-label", ariaLabel);
      addFieldLabel(field, input, labelText);
      attachTokenPicker(
        input,
        managedWorkflow ? null : selectedElement,
        undefined,
        globalWorkflow,
      );
      propertyForm.append(input.parentElement);
      return input;
    };
    const addParameterList = (field, serializedValue, ariaLabel) => {
      const container = document.createElement("div");
      container.className = "workflow-function-parameters";
      const serializedField = document.createElement("input");
      serializedField.type = "hidden";
      serializedField.value = serializedValue || "[]";
      serializedField.dataset.eventHandlerField = field;
      serializedField.dataset.eventHandlerIndex = String(index);
      serializedField.dataset.eventHandlerPrimary = String(handler.isPrimary);
      serializedField.dataset.eventHandlerAppLoad = String(appLoad);
      if (globalWorkflow)
        serializedField.dataset.globalActionId = globalActionId;

      const list = document.createElement("div");
      list.className = "workflow-function-parameter-list";
      const error = document.createElement("span");
      error.className = "field-help workflow-function-parameter-error";
      error.hidden = true;
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "button button-quiet workflow-function-parameter-add";
      addButton.textContent =
        localize.AddParameter[editorLanguage];

      const syncParameters = () => {
        const values = [];
        for (const parameterRow of list.querySelectorAll(
          ".workflow-function-parameter-row",
        )) {
          const input = parameterRow.querySelector(
            ".workflow-function-parameter-value",
          );
          if (parameterRow.dataset.valueType === "json") {
            try {
              values.push(JSON.parse(input.value));
            } catch {
              input.setAttribute("aria-invalid", "true");
              error.textContent = localize.InvalidJSONParameterValue[editorLanguage];
              error.hidden = false;
              return;
            }
          } else {
            values.push(input.value);
          }
          input.removeAttribute("aria-invalid");
        }
        error.hidden = true;
        serializedField.value = JSON.stringify(values);
        serializedField.dispatchEvent(new Event("input", { bubbles: true }));
      };

      const addParameter = (value = "", valueType = "text") => {
        const parameterRow = document.createElement("div");
        parameterRow.className = "workflow-function-parameter-row";
        parameterRow.dataset.valueType = valueType;
        const type = document.createElement("select");
        type.setAttribute(
          "aria-label",
          localize.IndexedFieldType[editorLanguage]
            .replace("{field}", () => ariaLabel)
            .replace("{index}", () => String(list.children.length + 1)),
        );
        type.add(new Option(localize.Text[editorLanguage], "text"));
        type.add(new Option("JSON", "json"));
        type.value = valueType;
        const valueCell = document.createElement("div");
        valueCell.className = "workflow-function-parameter-value-cell";
        const input = document.createElement("input");
        input.type = "text";
        input.className = "workflow-function-parameter-value";
        input.dir = "ltr";
        input.value = value;
        input.placeholder = localize.ParameterValue[editorLanguage];
        input.setAttribute(
          "aria-label",
          localize.IndexedField[editorLanguage]
            .replace("{field}", () => ariaLabel)
            .replace("{index}", () => String(list.children.length + 1)),
        );
        valueCell.append(input);
        attachTokenPicker(
          input,
          managedWorkflow ? null : selectedElement,
          undefined,
          globalWorkflow,
        );
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "icon-button workflow-function-parameter-remove";
        remove.textContent = "×";
        remove.setAttribute(
          "aria-label",
          localize.RemoveParameter[editorLanguage],
        );
        type.addEventListener("change", () => {
          parameterRow.dataset.valueType = type.value;
          syncParameters();
        });
        input.addEventListener("input", syncParameters);
        remove.addEventListener("click", () => {
          parameterRow.remove();
          syncParameters();
        });
        parameterRow.append(type, valueCell, remove);
        list.append(parameterRow);
        return input;
      };

      let parameters = [];
      let parseError = false;
      try {
        const parsed = JSON.parse(serializedValue || "[]");
        if (!Array.isArray(parsed)) throw new Error("Expected an array.");
        parameters = parsed;
      } catch {
        parseError = true;
      }
      parameters.forEach((value) =>
        addParameter(
          typeof value === "string" ? value : JSON.stringify(value),
          typeof value === "string" ? "text" : "json",
        ),
      );
      if (parseError) {
        error.textContent =
          localize.ParametersMustBeJSONArray[editorLanguage];
        error.hidden = false;
      }
      addButton.addEventListener("click", () => {
        addParameter().focus();
        syncParameters();
      });
      container.append(serializedField, list, error, addButton);
      propertyForm.append(container);
      return serializedField;
    };

    if (!managedWorkflow) {
      addSelect(
        "event",
        eventOptions,
        handler.event || "click",
        `${title.textContent}: ${localize.TriggerEvent[editorLanguage]}`,
        localize.TriggerEvent[editorLanguage],
      );
    }

    const type = addSelect(
      "type",
      [
        [localize.NoAction[editorLanguage], "none"],
        [localize.SendAPIRequestAction[editorLanguage], "request"],
        [localize.OpenTawakkalnaServiceAction[editorLanguage], "openService"],
        [localize.NavigateToPageAction[editorLanguage], "navigate"],
        [localize.GoBackAction[editorLanguage], "back"],
        [localize.SetVariableAction[editorLanguage], "setVariable"],
        [localize.ChangeElementPropertyAction[editorLanguage], "changeProperty"],
        [localize.RunConditionalActionsAction[editorLanguage], "condition"],
        [localize.SwitchAction[editorLanguage], "switch"],
        [localize.ShowMessageAction[editorLanguage], "message"],
        [localize.ShowSheetAction[editorLanguage], "showSheet"],
        [localize.HideSheetAction[editorLanguage], "hideSheet"],
        [localize.ShowToastAction[editorLanguage], "showToast"],
        [localize.CallJavaScriptFunctionAction[editorLanguage], "function"],
        [localize.CallGlobalAction[editorLanguage], "globalAction"],
        ...twkSystemActionOptions,
      ],
      handler.type,
      `${title.textContent}: ${localize.ActionType[editorLanguage]}`,
      localize.ActionType[editorLanguage],
    );
    const defaultTitle = localize.IndexedAction[editorLanguage].replace(
      "{index}",
      () => String(index + 1),
    );
    title.textContent = handler.workflowTitle || defaultTitle;
    nodeKind.textContent = type.selectedOptions[0]?.textContent || "";
    const workflowTitleInput = document.createElement("input");
    workflowTitleInput.type = "text";
    workflowTitleInput.value = handler.workflowTitle || "";
    workflowTitleInput.placeholder = defaultTitle;
    workflowTitleInput.dataset.eventHandlerField = "workflowTitle";
    workflowTitleInput.dataset.eventHandlerIndex = String(index);
    workflowTitleInput.dataset.eventHandlerPrimary = String(handler.isPrimary);
    workflowTitleInput.dataset.eventHandlerAppLoad = String(appLoad);
    if (globalWorkflow)
      workflowTitleInput.dataset.globalActionId = globalActionId;
    workflowTitleInput.setAttribute(
      "aria-label",
      `${title.textContent}: ${localize.Title[editorLanguage]}`,
    );
    addFieldLabel("workflowTitle", workflowTitleInput, localize.Title[editorLanguage]);
    workflowTitleInput.addEventListener("input", () => {
      title.textContent = workflowTitleInput.value.trim() || defaultTitle;
      type.setAttribute(
        "aria-label",
        `${title.textContent}: ${localize.ActionType[editorLanguage]}`,
      );
      workflowTitleInput.setAttribute(
        "aria-label",
        `${title.textContent}: ${localize.Title[editorLanguage]}`,
      );
      const nodeProperties = workflowPropertiesByNodeId.get(
        row.dataset.workflowNodeId,
      );
      if (nodeProperties) nodeProperties.title = title.textContent;
      if (editorState.selectedNodeId === row.dataset.workflowNodeId)
        inspectorSummary.textContent = `${title.textContent} · ${nodeKind.textContent}`;
    });
    propertyForm.append(workflowTitleInput);

    const conditionActionFields = isWorkflowBranchAction(handler)
      ? renderWorkflowConditionBranches({
          handler, index, appLoad, globalActionId, row: propertyForm, actionPosition, nodeLayer, graphKey,
          layout, branchRootWorkflowNodes, workflowPropertiesByNodeId,
        })
      : [];
    renderWorkflowActionFields({
      handler, type, title, row: propertyForm, addSelect, addInput, addParameterList,
    });
    if (handler.type === "switch") {
      const addCase = document.createElement("button");
      addCase.type = "button";
      addCase.className = "button button-quiet workflow-switch-case-add";
      addCase.dataset.addSwitchCase = "";
      addCase.dataset.eventHandlerIndex = String(index);
      addCase.dataset.eventHandlerPrimary = String(handler.isPrimary);
      addCase.dataset.eventHandlerAppLoad = String(appLoad);
      if (globalWorkflow) addCase.dataset.globalActionId = globalActionId;
      addCase.textContent = localize.AddCase[editorLanguage];
      propertyForm.append(addCase);

      const toggleDefault = document.createElement("button");
      toggleDefault.type = "button";
      toggleDefault.className = "button button-quiet workflow-switch-default-toggle";
      toggleDefault.dataset.toggleSwitchDefault = "";
      toggleDefault.dataset.eventHandlerIndex = String(index);
      toggleDefault.dataset.eventHandlerPrimary = String(handler.isPrimary);
      toggleDefault.dataset.eventHandlerAppLoad = String(appLoad);
      if (globalWorkflow)
        toggleDefault.dataset.globalActionId = globalActionId;
      toggleDefault.textContent = handler.defaultEnabled
        ? localize.RemoveCase[editorLanguage]
        : localize.UseDefaultBranch[editorLanguage];
      propertyForm.append(toggleDefault);
    }

    const resolveBranchAction = (pathValue = "") =>
      pathValue.split("/").filter(Boolean).reduce((action, part) => {
        const separatorIndex = part.lastIndexOf(":");
        const branch = part.slice(0, separatorIndex);
        const actionIndex = part.slice(separatorIndex + 1);
        const nestedActions = getWorkflowBranchActions(action, branch);
        const parsedIndex = Number(actionIndex);
        return Number.isInteger(parsedIndex)
          ? nestedActions[parsedIndex] || null
          : null;
      }, handler);

    const actionHelp = document.createElement("span");
    actionHelp.className = "event-action-help";
    actionHelp.textContent = localize.SelfContentTokenHelp[editorLanguage];
    propertyForm.append(actionHelp);

    propertyForm.querySelectorAll("[data-event-handler-field]").forEach((field) => {
      if (globalWorkflow) field.dataset.globalActionId = globalActionId;
      const fieldName = field.dataset.eventHandlerField;
      if (
        (field instanceof HTMLInputElement && field.type === "hidden") ||
        !field.matches("input, textarea") ||
        !["value", "values", "parameters", "message", "title"].includes(
          fieldName,
        )
      )
        return;
      const inputId = `input:${handler.workflowId}:${fieldName}`;
      field.dataset.workflowInputId = inputId;
      field.dataset.workflowPortId = inputId;
      field.dataset.workflowHandle = "in";
    });
    const addWorkflowInputPort = (field, inputId) => {
      field.dataset.workflowInputId = inputId;
    };
    propertyForm
      .querySelectorAll(
        '[data-event-condition-field="property-condition-value"]',
      )
      .forEach((field) => {
        const conditionAction = resolveBranchAction(
          field.dataset.conditionActionOwnerPath,
        );
        addWorkflowInputPort(
          field,
          `input:${conditionAction?.workflowId || handler.workflowId}:condition.value`,
        );
      });
    conditionActionFields
      .filter((field) =>
        ["value", "values"].includes(field.dataset.conditionAction),
      )
      .forEach((field) => {
        const nestedAction = resolveBranchAction(
          field.dataset.conditionActionPath,
        );
        addWorkflowInputPort(
          field,
          `input:${nestedAction?.workflowId || handler.workflowId}:${field.dataset.conditionAction}`,
        );
      });
    if (index > 0 || managedWorkflow) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button button-quiet condition-action-remove";
      remove.dataset.removeEventHandler = String(index);
      remove.dataset.eventHandlerAppLoad = String(appLoad);
      if (globalWorkflow) remove.dataset.globalActionId = globalActionId;
      remove.textContent = localize.RemoveAction[editorLanguage];
      propertyForm.append(remove);
    }
    workflowPropertiesByNodeId.set(row.dataset.workflowNodeId, {
      title: title.textContent,
      type: nodeKind.textContent,
      content: propertyForm,
    });
    nodeLayer.append(row);
  });

  const rootWorkflowNodes = handlers.map((handler) => ({
    id: `action:${handler.workflowId}`,
    kind: "action",
    event: appLoad ? "load" : globalWorkflow ? "global" : handler.event || "click",
    action: handler,
  }));
  const workflowNodes = [
    ...rootWorkflowNodes,
    ...branchRootWorkflowNodes,
  ];
  const nodeSignature = rootWorkflowNodes
    .map((node) => `${node.id}:${node.event}`)
    .join("|");
  // Reinitialize sequence order only when the set/order of handler nodes changes.
  if (layout.nodeSignature !== nodeSignature) {
    layout.edges = [];
    eventGroups.forEach((indices, eventName) => {
      const triggerId = triggerIds.get(eventName);
      const groupNodes = indices.map((index) => rootWorkflowNodes[index]);
      if (groupNodes.length) {
        layout.edges.push(
          createWorkflowEdge(triggerId, groupNodes[0].id, "sequence"),
        );
        groupNodes.slice(1).forEach((node, index) => {
          layout.edges.push(
            createWorkflowEdge(groupNodes[index].id, node.id, "sequence"),
          );
        });
      }
    });
    layout.nodeSignature = nodeSignature;
  }
  layout.edges = layout.edges.filter((edge) => edge.kind !== "branch");
  rootWorkflowNodes.forEach((node) => {
    if (!isWorkflowBranchAction(node.action)) return;
    getWorkflowActionBranches(node.action, isWorkflowBranchAction).forEach(
      ({ key: branch, label }) => {
        const branchRootId = `branch:${node.action.workflowId}:${branch}`;
        const branchLabel = twkPermissionActionTypes.includes(node.action.type)
          ? branch === "actions"
            ? "Granted"
            : "Denied"
          : node.action.type === "switch"
            ? label
            : branch === "actions"
              ? "True"
              : "False";
        const rootEdge = createWorkflowEdge(
          node.id,
          branchRootId,
          "branch",
          branchLabel,
        );
        rootEdge.branch = branch;
        rootEdge.fromPort = `${node.id}:${branch}`;
        layout.edges.push(rootEdge);
      },
    );
  });
  layout.edges = layout.edges.filter((edge) => {
    if (edge.kind === "branch")
        return (
          rootWorkflowNodes.some(
            (node) =>
              node.id === edge.from && isWorkflowBranchAction(node.action),
          )
        );
    return (
        triggerIds.has(
          [...triggerIds.keys()].find((eventName) => triggerIds.get(eventName) === edge.from),
        ) ||
        rootWorkflowNodes.some((node) => node.id === edge.from)
    ) &&
        (triggerIds.has(
          [...triggerIds.keys()].find((eventName) => triggerIds.get(eventName) === edge.to),
        ) ||
          rootWorkflowNodes.some((node) => node.id === edge.to));
  });

  const allNodes = [
    ...[...triggerIds.entries()].map(([event, id]) => ({
      id,
      kind: "trigger",
      event,
    })),
    ...workflowNodes,
  ];
  const maxNodeX = Math.max(
    1400,
    ...[...nodeLayer.children].map(
      (node) => Number.parseFloat(node.style.left) + node.offsetWidth + 160,
    ),
  );
  const maxNodeY = Math.max(
    1000,
    ...[...nodeLayer.children].map(
      (node) => Number.parseFloat(node.style.top) + node.offsetHeight + 180,
    ),
  );
  stage.style.width = `${maxNodeX}px`;
  stage.style.height = `${maxNodeY}px`;
  stage.style.transform = `translate(${layout.panX}px, ${layout.panY}px) scale(${layout.zoom})`;
  viewport.style.setProperty("--workflow-zoom", String(layout.zoom));
  renderWorkflowEdges(stage, svg, layout, layout.zoom);
  renderWorkflowMinimap(minimap, nodeLayer, layout, graphKey);
  const selectedNode = editorState.selectedNodeId
    ? nodeLayer.querySelector(
        `[data-workflow-node-id="${CSS.escape(editorState.selectedNodeId)}"]`,
      )
    : null;
  selectedNode?.classList.add("is-selected");
  showNodeProperties(editorState.selectedNodeId);
  attachWorkflowCanvasInteractions({
    container,
    toolbar,
    viewport,
    stage,
    svg,
    nodeLayer,
    minimap,
    graphKey,
    layout,
    editorState,
    handlers,
    workflowNodes,
    appLoad,
    globalActionId: globalWorkflow ? globalActionId : "",
    onSelectNode: (node) =>
      showNodeProperties(node?.dataset.workflowNodeId || ""),
  }, {
    clampNumber,
    createWorkflowEdge,
    deleteWorkflowAction,
    isWorkflowBranchAction,
    renderWorkflowEdges,
    renderWorkflowMinimap,
    saveWorkflowGraphLayout,
    serializeWorkflowGraph,
    writeWorkflowActions,
    editorLanguage,
    localize,
  });
}

function moveEventHandler(index, direction, appLoad, globalActionId = "") {
  const element = state.elements.find(
    (candidate) => candidate.id === state.selectedId,
  );
  const globalAction = (state.settings.globalActions || []).find(
    (candidate) => candidate.id === globalActionId,
  );
  if (!appLoad && !globalAction && !element) return;
  const handlers = appLoad
    ? state.settings.appLoadHandlers
    : globalAction
      ? globalAction.actions
    : [
        { ...(element.action || {}), isPrimary: true },
        ...(element.action?.handlers || []).map((handler) => ({
          ...handler,
          isPrimary: false,
        })),
      ];
  const targetIndex = index + (direction === "up" ? -1 : 1);
  if (
    !Number.isInteger(index) ||
    targetIndex < 0 ||
    targetIndex >= handlers.length
  )
    return;
  [handlers[index], handlers[targetIndex]] = [handlers[targetIndex], handlers[index]];
  if (appLoad) {
    state.settings.appLoadHandlers = handlers;
    renderEventHandlers(
      { handlers: state.settings.appLoadHandlers },
      { appLoad: true },
    );
  } else if (globalAction) {
    globalAction.actions = handlers;
    renderEventHandlers(
      { handlers: globalAction.actions },
      { globalActionId },
    );
  } else {
    const primary = { ...handlers[0] };
    delete primary.isPrimary;
    delete primary.handlers;
    primary.handlers = handlers.slice(1).map((handler) => {
      const action = { ...handler };
      delete action.isPrimary;
      delete action.handlers;
      return action;
    });
    element.action = primary;
    renderEventHandlers(element.action);
  }
  scheduleSave();
}

  return { renderEventHandlers, moveEventHandler };
}
