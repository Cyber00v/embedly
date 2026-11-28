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


  const TRIGGER_DEFAULT_X = 32;
  const TRIGGER_DEFAULT_Y_START = 220;
  const TRIGGER_LANE_STEP_Y = 980;
  const TOKEN_DEFAULT_X_START = 32;
  const TOKEN_DEFAULT_X_STEP = 230;
  const TOKEN_DEFAULT_Y = 24;
  const TOKEN_DRAG_MIME_TYPE = "application/x-workflow-token-value";
  const ITEM_PATH_PATTERN = /^[A-Za-z_$][\w$-]*(?:\.[A-Za-z_$][\w$-]*|\.\d+)*$/;
  const MIN_STAGE_WIDTH = 1400;
  const MIN_STAGE_HEIGHT = 1000;
  const STAGE_PADDING_X = 160;
  const STAGE_PADDING_Y = 180;
  const SELECTION_CHANGE_ELEMENT_TYPES = new Set(["checkbox", "radio", "switch"]);

  function renderWorkflowTriggerNodes(context) {
    const {
      eventGroups,
      triggerIds,
      layout,
      graphKey,
      nodeLayer,
      appLoad,
      globalWorkflow,
    } = context;

    const t = (key) => localize[key]?.[editorLanguage] ?? key;
    const triggerKindLabel = appLoad
      ? t("AppLoad")
      : globalWorkflow
        ? t("GlobalAction")
        : t("ElementEvent");

    let laneIndex = 0;
    eventGroups.forEach((_, eventName) => {
      const triggerId = `trigger:${graphKey}:${eventName}`;
      triggerIds.set(eventName, triggerId);

      const trigger = document.createElement("section");
      trigger.tabIndex = 0;
      trigger.className = "workflow-node workflow-trigger-node";
      trigger.dataset.workflowNodeId = triggerId;
      trigger.dataset.workflowEventName = eventName;
      trigger.dataset.workflowGraph = graphKey;
      trigger.style.left = `${layout.positions[triggerId]?.x ?? TRIGGER_DEFAULT_X}px`;
      trigger.style.top = `${layout.positions[triggerId]?.y ??
        TRIGGER_DEFAULT_Y_START + laneIndex * TRIGGER_LANE_STEP_Y
        }px`;

      const header = document.createElement("div");
      header.className = "workflow-node-header";
      header.dataset.workflowDrag = "";
      header.innerHTML = `<span class="workflow-node-icon">▶</span><strong>${escapeHtml(t("Trigger"))}</strong><span class="workflow-node-kind">${escapeHtml(triggerKindLabel)}</span>`;

      const output = document.createElement("button");
      output.type = "button";
      output.className = "workflow-handle workflow-handle-output";
      output.dataset.workflowHandle = "out";
      output.dataset.workflowNodeId = triggerId;
      output.dataset.workflowPortId = triggerId;
      output.setAttribute("aria-label", t("TriggerOutput"));

      trigger.append(header, output);
      nodeLayer.append(trigger);
      laneIndex += 1;
    });
  }

  function createTokenDragButton(token, tokenNode, t) {
    const tokenDrag = document.createElement("button");
    tokenDrag.type = "button";
    tokenDrag.className = "workflow-token-drag-source";
    tokenDrag.draggable = true;
    tokenDrag.dataset.workflowTokenDrag = "";
    tokenDrag.textContent = "↗";
    tokenDrag.setAttribute(
      "aria-label",
      t("DragTokenIntoField").replace("{token}", () => token.label),
    );
    tokenDrag.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData(
        TOKEN_DRAG_MIME_TYPE,
        tokenNode.dataset.workflowToken || "",
      );
    });
    return tokenDrag;
  }

  function createTokenItemPathInput(tokenNode, t) {
    const pathInput = document.createElement("input");
    pathInput.type = "text";
    pathInput.className = "workflow-token-path";
    pathInput.placeholder = "item.path";
    pathInput.setAttribute("aria-label", t("CustomItemPropertyPath"));
    pathInput.addEventListener("input", () => {
      const path = pathInput.value.trim();
      if (ITEM_PATH_PATTERN.test(path)) {
        tokenNode.dataset.workflowToken = `{{item.${path}}}`;
      }
    });
    return pathInput;
  }

  function buildWorkflowTokenNode(token, index, layout, t) {
    const tokenNode = document.createElement("div");
    tokenNode.className = "workflow-token-node";
    tokenNode.tabIndex = 0;
    tokenNode.dataset.workflowDrag = "";
    tokenNode.dataset.workflowNodeId = token.id;

    const tokenPosition = layout.positions[token.id] || {
      x: TOKEN_DEFAULT_X_START + index * TOKEN_DEFAULT_X_STEP,
      y: TOKEN_DEFAULT_Y,
    };
    tokenNode.style.left = `${tokenPosition.x}px`;
    tokenNode.style.top = `${tokenPosition.y}px`;
    tokenNode.innerHTML = `<span class="workflow-token-icon">{ }</span><label>${escapeHtml(token.label)}<select></select></label>`;

    const tokenSelect = tokenNode.querySelector("select");
    tokenSelect.setAttribute(
      "aria-label",
      t("TokenValueField").replace("{token}", () => token.label),
    );
    token.tokens.forEach((option) =>
      tokenSelect.add(new Option(option.label, option.token)),
    );
    tokenNode.dataset.workflowToken = token.tokens[0].token;
    tokenSelect.addEventListener("change", () => {
      tokenNode.dataset.workflowToken = tokenSelect.value;
    });

    if (token.itemPathInput) {
      tokenNode.querySelector("label").append(createTokenItemPathInput(tokenNode, t));
    }

    tokenNode.append(createTokenDragButton(token, tokenNode, t));
    return tokenNode;
  }

  function renderWorkflowTokenNodes(context) {
    const {
      selectedElement,
      managedWorkflow,
      globalWorkflow,
      layout,
      nodeLayer,
    } = context;

    const t = (key) => localize[key]?.[editorLanguage] ?? key;
    const hiddenIds = new Set(layout.hiddenTokenIds || []);
    const tokenOptions = getWorkflowTokenOptions(
      managedWorkflow ? null : selectedElement,
      globalWorkflow,
    );

    tokenOptions
      .filter((token) => !hiddenIds.has(token.id))
      .forEach((token, index) => {
        nodeLayer.append(buildWorkflowTokenNode(token, index, layout, t));
      });
  }

  const ACTION_DEFAULT_X_START = 360;
  const ACTION_DEFAULT_X_STEP = 390;
  const ACTION_DEFAULT_Y_START = 220;
  const ACTION_LANE_STEP_Y = 980;
  const TOKEN_BINDABLE_HANDLER_FIELDS = new Set([
    "value",
    "values",
    "parameters",
    "message",
    "title",
  ]);
  const CONDITION_BINDABLE_ACTION_FIELDS = new Set(["value", "values"]);

  function resolveActionEventName(handler, { appLoad, globalWorkflow }) {
    if (appLoad) return "load";
    if (globalWorkflow) return "global";
    return handler.event || "click";
  }

  function createActionNodeHandles(row, handler, isBranchAction, t) {
    if (isBranchAction) {
      const branches = getWorkflowActionBranches(handler, isWorkflowBranchAction);
      branches.forEach(({ key: branch, label }, branchIndex) => {
        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = `workflow-handle workflow-handle-output ${branch === "actions"
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

        const branchLabel = twkPermissionActionTypes.includes(handler.type)
          ? branch === "actions"
            ? t("Granted")
            : t("Denied")
          : handler.type === "switch"
            ? label === "Default"
              ? t("DefaultBranch")
              : `${t("CaseMatchValue")}: ${label}`
            : branch === "actions"
              ? t("True")
              : t("False");

        handle.setAttribute(
          "aria-label",
          t("BranchOutput").replace("{branch}", () => branchLabel),
        );

        const portLabel = document.createElement("span");
        portLabel.className = `workflow-branch-port-label workflow-branch-port-${branch === "actions"
          ? "true"
          : branch === "elseActions"
            ? "false"
            : "switch"
          }`;
        portLabel.textContent = branchLabel;

        if (handler.type === "switch") {
          portLabel.style.top = handle.style.top;
          portLabel.style.right = "-10px";
          portLabel.style.transform = "translate(100%, -50%)";
        }

        row.append(handle, portLabel);
      });
      return;
    }

    const outputHandle = document.createElement("button");
    outputHandle.type = "button";
    outputHandle.className = "workflow-handle workflow-handle-output";
    outputHandle.dataset.workflowHandle = "out";
    outputHandle.dataset.workflowNodeId = row.dataset.workflowNodeId;
    outputHandle.dataset.workflowPortId = row.dataset.workflowNodeId;
    outputHandle.setAttribute("aria-label", t("ActionOutput"));
    row.append(outputHandle);
  }

  function createActionFieldBuilders({
    handler,
    index,
    appLoad,
    globalWorkflow,
    globalActionId,
    managedWorkflow,
    selectedElement,
    propertyForm,
    t,
  }) {
    const applyHandlerDataset = (element) => {
      element.dataset.eventHandlerIndex = String(index);
      element.dataset.eventHandlerPrimary = String(handler.isPrimary);
      element.dataset.eventHandlerAppLoad = String(appLoad);
      if (globalWorkflow) {
        element.dataset.globalActionId = globalActionId;
      }
    };

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
      applyHandlerDataset(select);
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
      applyHandlerDataset(input);
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
      applyHandlerDataset(serializedField);

      const list = document.createElement("div");
      list.className = "workflow-function-parameter-list";

      const error = document.createElement("span");
      error.className = "field-help workflow-function-parameter-error";
      error.hidden = true;

      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "button button-quiet workflow-function-parameter-add";
      addButton.textContent = t("AddParameter");

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
              error.textContent = t("InvalidJSONParameterValue");
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

        const paramType = document.createElement("select");
        paramType.setAttribute(
          "aria-label",
          t("IndexedFieldType")
            .replace("{field}", () => ariaLabel)
            .replace("{index}", () => String(list.children.length + 1)),
        );
        paramType.add(new Option(t("Text"), "text"));
        paramType.add(new Option("JSON", "json"));
        paramType.value = valueType;

        const valueCell = document.createElement("div");
        valueCell.className = "workflow-function-parameter-value-cell";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "workflow-function-parameter-value";
        input.dir = "ltr";
        input.value = value;
        input.placeholder = t("ParameterValue");
        input.setAttribute(
          "aria-label",
          t("IndexedField")
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
        remove.setAttribute("aria-label", t("RemoveParameter"));

        paramType.addEventListener("change", () => {
          parameterRow.dataset.valueType = paramType.value;
          syncParameters();
        });
        input.addEventListener("input", syncParameters);
        remove.addEventListener("click", () => {
          parameterRow.remove();
          syncParameters();
        });

        parameterRow.append(paramType, valueCell, remove);
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
        error.textContent = t("ParametersMustBeJSONArray");
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

    return {
      applyHandlerDataset,
      addFieldLabel,
      addSelect,
      addInput,
      addParameterList,
    };
  }

  function appendSwitchControls(
    propertyForm,
    handler,
    index,
    appLoad,
    globalWorkflow,
    globalActionId,
    applyHandlerDataset,
    t,
  ) {
    const addCase = document.createElement("button");
    addCase.type = "button";
    addCase.className = "button button-quiet workflow-switch-case-add";
    addCase.dataset.addSwitchCase = "";
    applyHandlerDataset(addCase);
    addCase.textContent = t("AddCase");

    const toggleDefault = document.createElement("button");
    toggleDefault.type = "button";
    toggleDefault.className = "button button-quiet workflow-switch-default-toggle";
    toggleDefault.dataset.toggleSwitchDefault = "";
    applyHandlerDataset(toggleDefault);
    toggleDefault.textContent = handler.defaultEnabled
      ? t("RemoveCase")
      : t("UseDefaultBranch");

    if (globalWorkflow) {
      addCase.dataset.globalActionId = globalActionId;
      toggleDefault.dataset.globalActionId = globalActionId;
    }

    propertyForm.append(addCase, toggleDefault);
  }

  function resolveNestedBranchAction(rootHandler, pathValue = "") {
    return pathValue
      .split("/")
      .filter(Boolean)
      .reduce((action, part) => {
        const separatorIndex = part.lastIndexOf(":");
        const branch = part.slice(0, separatorIndex);
        const actionIndex = part.slice(separatorIndex + 1);
        const nestedActions = getWorkflowBranchActions(action, branch);
        const parsedIndex = Number(actionIndex);
        return Number.isInteger(parsedIndex)
          ? nestedActions[parsedIndex] || null
          : null;
      }, rootHandler);
  }

  function bindWorkflowInputPorts(
    propertyForm,
    conditionActionFields,
    handler,
    globalWorkflow,
    globalActionId,
  ) {
    propertyForm
      .querySelectorAll("[data-event-handler-field]")
      .forEach((field) => {
        if (globalWorkflow) field.dataset.globalActionId = globalActionId;
        const fieldName = field.dataset.eventHandlerField;
        if (
          (field instanceof HTMLInputElement && field.type === "hidden") ||
          !field.matches("input, textarea") ||
          !TOKEN_BINDABLE_HANDLER_FIELDS.has(fieldName)
        ) {
          return;
        }
        const inputId = `input:${handler.workflowId}:${fieldName}`;
        field.dataset.workflowInputId = inputId;
        field.dataset.workflowPortId = inputId;
        field.dataset.workflowHandle = "in";
      });

    propertyForm
      .querySelectorAll('[data-event-condition-field="property-condition-value"]')
      .forEach((field) => {
        const conditionAction = resolveNestedBranchAction(
          handler,
          field.dataset.conditionActionOwnerPath,
        );
        field.dataset.workflowInputId = `input:${conditionAction?.workflowId || handler.workflowId
          }:condition.value`;
      });

    conditionActionFields
      .filter((field) =>
        CONDITION_BINDABLE_ACTION_FIELDS.has(field.dataset.conditionAction),
      )
      .forEach((field) => {
        const nestedAction = resolveNestedBranchAction(
          handler,
          field.dataset.conditionActionPath,
        );
        field.dataset.workflowInputId = `input:${nestedAction?.workflowId || handler.workflowId
          }:${field.dataset.conditionAction}`;
      });
  }

  function renderWorkflowActionNodes(context) {
    const {
      appLoad,
      globalActionId,
      globalWorkflow,
      managedWorkflow,
      selectedElement,
      graphKey,
      layout,
      editorState,
      nodeLayer,
      inspectorSummary,
      handlers,
      branchRootWorkflowNodes,
      nestedConditionWorkflowNodes,
      workflowPropertiesByNodeId,
      eventOptions,
      eventGroups,
    } = context;

    const t = (key) => localize[key]?.[editorLanguage] ?? key;
    const eventOrder = [...eventGroups.keys()];

    handlers.forEach((handler, index) => {
      const eventName = resolveActionEventName(handler, {
        appLoad,
        globalWorkflow,
      });
      const nodeId = `action:${handler.workflowId}`;
      const isBranch = isWorkflowBranchAction(handler);

      const row = document.createElement("div");
      row.tabIndex = 0;
      row.className = `workflow-node workflow-action-node${handler.type === "condition"
        ? " workflow-condition-node"
        : twkPermissionActionTypes.includes(handler.type)
          ? " workflow-permission-node"
          : ""
        }`;
      row.dataset.workflowNodeId = nodeId;
      row.dataset.workflowEventName = eventName;
      row.dataset.workflowGraph = graphKey;
      row.dataset.workflowHandle = "in";
      row.dataset.workflowPortId = nodeId;

      const propertyForm = document.createElement("div");
      propertyForm.className =
        "condition-action event-action-card workflow-node-properties";
      propertyForm.dataset.workflowNodeId = nodeId;
      propertyForm.dataset.workflowEventName = eventName;
      propertyForm.dataset.workflowGraph = graphKey;

      const eventIndices = eventGroups.get(eventName) || [];
      const eventIndex = eventIndices.indexOf(index);
      const laneIndex = eventOrder.indexOf(eventName);
      const actionPosition = layout.positions[nodeId] || {
        x: ACTION_DEFAULT_X_START + eventIndex * ACTION_DEFAULT_X_STEP,
        y: ACTION_DEFAULT_Y_START + laneIndex * ACTION_LANE_STEP_Y,
      };
      row.style.left = `${actionPosition.x}px`;
      row.style.top = `${actionPosition.y}px`;

      createActionNodeHandles(row, handler, isBranch, t);

      const nodeHeader = document.createElement("div");
      nodeHeader.className = "workflow-node-header";
      nodeHeader.dataset.workflowDrag = "";

      const nodeIcon = document.createElement("span");
      nodeIcon.className = "workflow-node-icon";
      nodeIcon.textContent = isBranch ? "?" : "↻";

      const title = document.createElement("span");
      title.className = "event-action-title";
      title.textContent = handler.workflowTitle || "";

      const nodeKind = document.createElement("span");
      nodeKind.className = "workflow-node-kind";

      nodeHeader.append(nodeIcon, title, nodeKind);
      row.append(nodeHeader);

      const {
        applyHandlerDataset,
        addFieldLabel,
        addSelect,
        addInput,
        addParameterList,
      } = createActionFieldBuilders({
        handler,
        index,
        appLoad,
        globalWorkflow,
        globalActionId,
        managedWorkflow,
        selectedElement,
        propertyForm,
        t,
      });

      if (!managedWorkflow) {
        addSelect(
          "event",
          eventOptions,
          handler.event || "click",
          `${title.textContent}: ${t("TriggerEvent")}`,
          t("TriggerEvent"),
        );
      }

      const type = addSelect(
        "type",
        [
          [t("NoAction"), "none"],
          [t("SendAPIRequestAction"), "request"],
          [t("OpenTawakkalnaServiceAction"), "openService"],
          [t("NavigateToPageAction"), "navigate"],
          [t("GoBackAction"), "back"],
          [t("SetVariableAction"), "setVariable"],
          [t("ChangeElementPropertyAction"), "changeProperty"],
          [t("RunConditionalActionsAction"), "condition"],
          [t("SwitchAction"), "switch"],
          [t("ShowMessageAction"), "message"],
          [t("ShowSheetAction"), "showSheet"],
          [t("HideSheetAction"), "hideSheet"],
          [t("ShowToastAction"), "showToast"],
          [t("CallJavaScriptFunctionAction"), "function"],
          [t("CallGlobalAction"), "globalAction"],
          ...twkSystemActionOptions,
        ],
        handler.type,
        `${title.textContent}: ${t("ActionType")}`,
        t("ActionType"),
      );

      const defaultTitle = t("IndexedAction").replace("{index}", () =>
        String(index + 1),
      );
      title.textContent = handler.workflowTitle || defaultTitle;
      nodeKind.textContent = type.selectedOptions[0]?.textContent || "";

      const workflowTitleInput = document.createElement("input");
      workflowTitleInput.type = "text";
      workflowTitleInput.value = handler.workflowTitle || "";
      workflowTitleInput.placeholder = defaultTitle;
      workflowTitleInput.dataset.eventHandlerField = "workflowTitle";
      applyHandlerDataset(workflowTitleInput);
      workflowTitleInput.setAttribute(
        "aria-label",
        `${title.textContent}: ${t("Title")}`,
      );
      addFieldLabel("workflowTitle", workflowTitleInput, t("Title"));

      workflowTitleInput.addEventListener("input", () => {
        title.textContent = workflowTitleInput.value.trim() || defaultTitle;
        type.setAttribute(
          "aria-label",
          `${title.textContent}: ${t("ActionType")}`,
        );
        workflowTitleInput.setAttribute(
          "aria-label",
          `${title.textContent}: ${t("Title")}`,
        );
        const nodeProperties = workflowPropertiesByNodeId.get(nodeId);
        if (nodeProperties) {
          nodeProperties.title = title.textContent;
        }
        if (editorState.selectedNodeId === nodeId) {
          inspectorSummary.textContent = `${title.textContent} · ${nodeKind.textContent}`;
        }
      });
      propertyForm.append(workflowTitleInput);

      const conditionActionFields = isBranch
        ? renderWorkflowConditionBranches({
          handler,
          index,
          appLoad,
          globalActionId,
          row: propertyForm,
          actionPosition,
          nodeLayer,
          graphKey,
          layout,
          branchRootWorkflowNodes,
          nestedConditionWorkflowNodes,
          workflowPropertiesByNodeId,
        })
        : [];

      renderWorkflowActionFields({
        handler,
        type,
        title,
        row: propertyForm,
        addSelect,
        addInput,
        addParameterList,
      });

      if (handler.type === "switch") {
        appendSwitchControls(
          propertyForm,
          handler,
          index,
          appLoad,
          globalWorkflow,
          globalActionId,
          applyHandlerDataset,
          t,
        );
      }

      const actionHelp = document.createElement("span");
      actionHelp.className = "event-action-help";
      actionHelp.textContent = t("SelfContentTokenHelp");
      propertyForm.append(actionHelp);

      bindWorkflowInputPorts(
        propertyForm,
        conditionActionFields,
        handler,
        globalWorkflow,
        globalActionId,
      );

      if (index > 0 || managedWorkflow) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "button button-quiet condition-action-remove";
        remove.dataset.removeEventHandler = String(index);
        remove.dataset.eventHandlerAppLoad = String(appLoad);
        if (globalWorkflow) {
          remove.dataset.globalActionId = globalActionId;
        }
        remove.textContent = t("RemoveAction");
        propertyForm.append(remove);
      }

      workflowPropertiesByNodeId.set(nodeId, {
        title: title.textContent,
        type: nodeKind.textContent,
        content: propertyForm,
      });
      nodeLayer.append(row);
    });
  }

  function resolveBranchEdgeLabel(action, branch, label) {
    if (twkPermissionActionTypes.includes(action.type)) {
      return branch === "actions" ? "Granted" : "Denied";
    }
    if (action.type === "switch") {
      return label;
    }
    return branch === "actions" ? "True" : "False";
  }

  function syncSequenceEdges(layout, rootWorkflowNodes, eventGroups, triggerIds) {
    const nodeSignature = rootWorkflowNodes
      .map((node) => `${node.id}:${node.event}`)
      .join("|");

    // Reinitialize sequence order only when the set/order of handler nodes changes.
    if (layout.nodeSignature === nodeSignature) return;

    layout.edges = [];
    eventGroups.forEach((indices, eventName) => {
      const triggerId = triggerIds.get(eventName);
      const groupNodes = indices.map((index) => rootWorkflowNodes[index]);
      if (!groupNodes.length) return;

      layout.edges.push(
        createWorkflowEdge(triggerId, groupNodes[0].id, "sequence"),
      );
      groupNodes.slice(1).forEach((node, index) => {
        layout.edges.push(
          createWorkflowEdge(groupNodes[index].id, node.id, "sequence"),
        );
      });
    });
    layout.nodeSignature = nodeSignature;
  }

  function rebuildBranchEdges(
    layout,
    rootWorkflowNodes,
    nestedConditionWorkflowNodes,
    branchRootWorkflowNodes,
  ) {
    layout.edges = layout.edges.filter((edge) => edge.kind !== "branch");

    [...rootWorkflowNodes, ...nestedConditionWorkflowNodes].forEach((node) => {
      if (!isWorkflowBranchAction(node.action)) return;
      getWorkflowActionBranches(node.action, isWorkflowBranchAction).forEach(
        ({ key: branch, label }) => {
          const branchRootId = `branch:${node.action.workflowId}:${branch}`;
          const branchLabel = resolveBranchEdgeLabel(node.action, branch, label);
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

    const branchRootIds = new Set(
      branchRootWorkflowNodes.map((node) => node.id),
    );
    nestedConditionWorkflowNodes.forEach((node) => {
      if (!branchRootIds.has(node.parentBranchRootId)) return;
      const branchEdge = createWorkflowEdge(
        node.parentBranchRootId,
        node.id,
        "branch",
      );
      branchEdge.branch = node.branch;
      branchEdge.fromPort = `${node.parentBranchRootId}:out`;
      layout.edges.push(branchEdge);
    });
  }

  function pruneOrphanEdges(
    layout,
    rootWorkflowNodes,
    nestedConditionWorkflowNodes,
    branchRootWorkflowNodes,
    triggerIds,
  ) {
    const validEndpointIds = new Set([
      ...triggerIds.values(),
      ...rootWorkflowNodes.map((node) => node.id),
      ...nestedConditionWorkflowNodes.map((node) => node.id),
      ...branchRootWorkflowNodes.map((node) => node.id),
    ]);

    layout.edges = layout.edges.filter(
      (edge) =>
        validEndpointIds.has(edge.from) && validEndpointIds.has(edge.to),
    );
  }

  function updateStageDimensionsAndTransform(stage, viewport, nodeLayer, layout) {
    const nodes = [...nodeLayer.children];
    const maxNodeX = Math.max(
      MIN_STAGE_WIDTH,
      ...nodes.map((node) => {
        const x = Number.parseFloat(node.style.left);
        return (Number.isFinite(x) ? x : node.offsetLeft) + node.offsetWidth + STAGE_PADDING_X;
      }),
    );
    const maxNodeY = Math.max(
      MIN_STAGE_HEIGHT,
      ...nodes.map((node) => {
        const y = Number.parseFloat(node.style.top);
        return (Number.isFinite(y) ? y : node.offsetTop) + node.offsetHeight + STAGE_PADDING_Y;
      }),
    );

    stage.style.width = `${maxNodeX}px`;
    stage.style.height = `${maxNodeY}px`;
    stage.style.transform = `translate(${layout.panX}px, ${layout.panY}px) scale(${layout.zoom})`;
    viewport.style.setProperty("--workflow-zoom", String(layout.zoom));
  }

  function finalizeWorkflowGraph(context) {
    const {
      handlers,
      appLoad,
      globalActionId,
      globalWorkflow,
      container,
      graphKey,
      layout,
      editorState,
      toolbar,
      viewport,
      stage,
      svg,
      nodeLayer,
      minimap,
      branchRootWorkflowNodes,
      nestedConditionWorkflowNodes,
      showNodeProperties,
      eventGroups,
      triggerIds,
    } = context;

    const rootWorkflowNodes = handlers.map((handler) => ({
      id: `action:${handler.workflowId}`,
      kind: "action",
      event: appLoad
        ? "load"
        : globalWorkflow
          ? "global"
          : handler.event || "click",
      action: handler,
    }));
    const workflowNodes = [
      ...rootWorkflowNodes,
      ...nestedConditionWorkflowNodes,
      ...branchRootWorkflowNodes,
    ];

    syncSequenceEdges(layout, rootWorkflowNodes, eventGroups, triggerIds);
    rebuildBranchEdges(
      layout,
      rootWorkflowNodes,
      nestedConditionWorkflowNodes,
      branchRootWorkflowNodes,
    );
    pruneOrphanEdges(
      layout,
      rootWorkflowNodes,
      nestedConditionWorkflowNodes,
      branchRootWorkflowNodes,
      triggerIds,
    );

    updateStageDimensionsAndTransform(stage, viewport, nodeLayer, layout);
    renderWorkflowEdges(stage, svg, layout, layout.zoom);
    renderWorkflowMinimap(minimap, nodeLayer, layout, graphKey);

    const selectedNode = editorState.selectedNodeId
      ? nodeLayer.querySelector(
        `[data-workflow-node-id="${CSS.escape(editorState.selectedNodeId)}"]`,
      )
      : null;
    selectedNode?.classList.add("is-selected");
    showNodeProperties(editorState.selectedNodeId);

    attachWorkflowCanvasInteractions(
      {
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
      },
      {
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
      },
    );
  }


  function resolveWorkflowScope(appLoad, globalActionId) {
    const globalAction = (state.settings.globalActions || []).find(
      (candidate) => candidate.id === globalActionId,
    );
    const globalWorkflow = Boolean(globalAction);
    const managedWorkflow = appLoad || globalWorkflow;
    const selectedElement = state.elements.find(
      (element) => element.id === state.selectedId,
    );
    const containerSelector = appLoad
      ? "#app-load-event-handlers"
      : globalWorkflow
        ? "#global-action-event-handlers"
        : "#event-handlers";
    const graphKey = appLoad
      ? "app-load"
      : globalWorkflow
        ? `global-action:${globalActionId}`
        : `element:${selectedElement?.id || ""}`;

    return {
      globalAction,
      globalWorkflow,
      managedWorkflow,
      selectedElement,
      containerSelector,
      graphKey,
    };
  }

  function createWorkflowEditorShell(graphKey, layout, t) {
    const toolbar = document.createElement("div");
    toolbar.className = "workflow-toolbar";
    toolbar.dataset.workflowGraph = graphKey;
    toolbar.innerHTML = `
    <button class="button button-quiet" type="button" data-workflow-zoom="out" aria-label="${escapeHtml(t("ZoomOut"))}">−</button>
    <span class="workflow-zoom-label">${Math.round(layout.zoom * 100)}%</span>
    <button class="button button-quiet" type="button" data-workflow-zoom="in" aria-label="${escapeHtml(t("ZoomIn"))}">+</button>
    <button class="button button-quiet" type="button" data-workflow-fit>${escapeHtml(t("FitView"))}</button>
    <button class="button button-quiet" type="button" data-workflow-minimap>${escapeHtml(t("Minimap"))}</button>
    <button class="button button-quiet" type="button" data-workflow-expand>${escapeHtml(t("Expand"))}</button>
    <span class="workflow-toolbar-hint">${escapeHtml(t("WorkflowToolbarHint"))}</span>`;

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
    inspector.setAttribute("aria-label", t("Properties"));

    const inspectorTitle = document.createElement("h3");
    inspectorTitle.className = "workflow-inspector-title";
    inspectorTitle.textContent = t("Properties");

    const inspectorSummary = document.createElement("p");
    inspectorSummary.className = "workflow-inspector-summary";

    const inspectorEmpty = document.createElement("p");
    inspectorEmpty.className = "workflow-inspector-empty";
    inspectorEmpty.textContent = t("SelectWorkflowNodeToEdit");

    const inspectorContent = document.createElement("div");
    inspectorContent.className = "workflow-inspector-content";
    inspector.append(
      inspectorTitle,
      inspectorSummary,
      inspectorEmpty,
      inspectorContent,
    );

    workspace.append(viewport, inspector);

    return {
      toolbar,
      viewport,
      stage,
      svg,
      nodeLayer,
      minimap,
      inspectorSummary,
      inspectorEmpty,
      inspectorContent,
      appendTo(container) {
        container.classList.add("workflow-editor");
        container.append(toolbar, workspace, minimap);
      },
    };
  }

  function resolveWorkflowHandlersAndSource(
    action,
    { appLoad, globalWorkflow, globalAction, selectedElement },
  ) {
    if (appLoad) {
      return {
        handlers: normalizeAppLoadHandlers(action.handlers).map((handler) => ({
          ...handler,
          isPrimary: false,
          appLoad: true,
        })),
        sourceHandlers: state.settings.appLoadHandlers,
      };
    }

    if (globalWorkflow) {
      return {
        handlers: Array.isArray(action.handlers) ? action.handlers : [],
        sourceHandlers: globalAction.actions,
      };
    }

    const defaultEvent = SELECTION_CHANGE_ELEMENT_TYPES.has(
      selectedElement?.type,
    )
      ? "change"
      : "click";

    return {
      handlers: [
        {
          ...action,
          event: action.event || defaultEvent,
          type: action.type || "none",
          isPrimary: true,
        },
        ...(Array.isArray(action.handlers) ? action.handlers : []).map(
          (handler) => ({
            ...handler,
            isPrimary: false,
          }),
        ),
      ],
      sourceHandlers: selectedElement
        ? [
          selectedElement.action || {},
          ...(selectedElement.action?.handlers || []),
        ]
        : [],
    };
  }

  function normalizeWorkflowHandlers(handlers, sourceHandlers, layout) {
    // Keep IDs stable across redraws so persisted positions and connections stay attached to their nodes.
    handlers.forEach((handler, index) => {
      const sourceHandler = sourceHandlers?.[index];

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
        if (sourceHandler) sourceHandler.requestId = handler.requestId;
      }

      if (handler.type === "setVariable" && !handler.variableId) {
        const defaultVariableId = state.variables.find(
          (variable) => variable.source === "static",
        )?.id;
        if (defaultVariableId) {
          handler.variableId = defaultVariableId;
          if (sourceHandler) sourceHandler.variableId = defaultVariableId;
        }
      }

      if (handler.type === "globalAction" && !handler.globalActionId) {
        const defaultGlobalActionId = state.settings.globalActions?.[0]?.id;
        if (defaultGlobalActionId) {
          handler.globalActionId = defaultGlobalActionId;
          if (sourceHandler) sourceHandler.globalActionId = defaultGlobalActionId;
        }
      }

      handler.workflowId ||=
        sourceHandler?.workflowId || layout.workflowNodeIds[index] || createId();
      layout.workflowNodeIds[index] = handler.workflowId;
      if (sourceHandler) sourceHandler.workflowId ||= handler.workflowId;
    });

    ensureWorkflowActionIds(sourceHandlers);
  }

  function buildWorkflowEventOptions(
    { appLoad, globalWorkflow, selectedElement },
    t,
  ) {
    return [
      [t("Click"), "click"],
      [t("Change"), "change"],
      [t("Input"), "input"],
      ...(!appLoad && !globalWorkflow && selectedElement
        ? getPluginEvents(selectedElement).map((eventName) => [
          eventName,
          eventName,
        ])
        : []),
      ...(selectedElement?.type === "filePicker"
        ? [[t("OnFilesSelected"), "onFilesSelected"]]
        : []),
      ...(selectedElement && isInsideCollection(selectedElement)
        ? [
          [t("OnItemRender"), "onItemRender"],
          [t("OnItemDidRender"), "onItemDidRender"],
        ]
        : []),
    ];
  }

  function groupHandlersByEvent(handlers, { appLoad, globalWorkflow }) {
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
    return eventGroups;
  }

  function renderEventHandlers(
    action = {},
    { appLoad = false, globalActionId = "" } = {},
  ) {
    const t = (key) => localize[key]?.[editorLanguage] ?? key;
    const scope = resolveWorkflowScope(appLoad, globalActionId);
    const container = document.querySelector(scope.containerSelector);
    container.replaceChildren();

    const layout = getWorkflowGraphLayout(scope.graphKey);
    layout.workflowNodeIds ||= {};
    const editorState = getWorkflowEditorState(scope.graphKey);

    const shell = createWorkflowEditorShell(scope.graphKey, layout, t);
    shell.appendTo(container);

    const { handlers, sourceHandlers } = resolveWorkflowHandlersAndSource(
      action,
      { appLoad, ...scope },
    );

    const branchRootWorkflowNodes = [];
    const nestedConditionWorkflowNodes = [];
    const workflowPropertiesByNodeId = new Map();
    const showNodeProperties = (nodeId) => {
      const nodeProperties = workflowPropertiesByNodeId.get(nodeId);
      shell.inspectorContent.replaceChildren();
      if (!nodeProperties) {
        shell.inspectorSummary.textContent = "";
        shell.inspectorEmpty.hidden = false;
        return;
      }
      shell.inspectorSummary.textContent = `${nodeProperties.title} · ${nodeProperties.type}`;
      shell.inspectorEmpty.hidden = true;
      shell.inspectorContent.append(nodeProperties.content);
    };

    normalizeWorkflowHandlers(handlers, sourceHandlers, layout);
    const eventOptions = buildWorkflowEventOptions(
      { appLoad, ...scope },
      t,
    );
    const eventGroups = groupHandlersByEvent(handlers, {
      appLoad,
      globalWorkflow: scope.globalWorkflow,
    });
    const triggerIds = new Map();

    layout.edges = layout.edges.filter((edge) => edge.kind !== "branch");

    const workflowRenderContext = {
      appLoad,
      globalActionId,
      globalWorkflow: scope.globalWorkflow,
      managedWorkflow: scope.managedWorkflow,
      container,
      selectedElement: scope.selectedElement,
      graphKey: scope.graphKey,
      layout,
      editorState,
      toolbar: shell.toolbar,
      viewport: shell.viewport,
      stage: shell.stage,
      svg: shell.svg,
      nodeLayer: shell.nodeLayer,
      minimap: shell.minimap,
      inspectorSummary: shell.inspectorSummary,
      inspectorEmpty: shell.inspectorEmpty,
      inspectorContent: shell.inspectorContent,
      handlers,
      branchRootWorkflowNodes,
      nestedConditionWorkflowNodes,
      workflowPropertiesByNodeId,
      showNodeProperties,
      eventOptions,
      eventGroups,
      triggerIds,
    };

    renderWorkflowTriggerNodes(workflowRenderContext);
    renderWorkflowTokenNodes(workflowRenderContext);
    renderWorkflowActionNodes(workflowRenderContext);
    finalizeWorkflowGraph(workflowRenderContext);
  }

  function findSelectedElement() {
    return state.elements.find((candidate) => candidate.id === state.selectedId);
  }

  function findGlobalAction(globalActionId) {
    return (state.settings.globalActions || []).find(
      (candidate) => candidate.id === globalActionId,
    );
  }

  function getScopedHandlers(element, globalAction, appLoad) {
    if (appLoad) {
      return state.settings.appLoadHandlers || [];
    }
    if (globalAction) {
      return globalAction.actions || [];
    }
    return [
      { ...(element.action || {}), isPrimary: true },
      ...(element.action?.handlers || []).map((handler) => ({
        ...handler,
        isPrimary: false,
      })),
    ];
  }

  function stripHandlerTransientFields(handler) {
    const clean = { ...handler };
    delete clean.isPrimary;
    delete clean.handlers;
    return clean;
  }

  function commitScopedHandlers(
    handlers,
    { element, globalAction, appLoad, globalActionId },
  ) {
    if (appLoad) {
      state.settings.appLoadHandlers = handlers;
      renderEventHandlers(
        { handlers: state.settings.appLoadHandlers },
        { appLoad: true },
      );
      return;
    }

    if (globalAction) {
      globalAction.actions = handlers;
      renderEventHandlers(
        { handlers: globalAction.actions },
        { globalActionId },
      );
      return;
    }

    const primary = stripHandlerTransientFields(handlers[0]);
    primary.handlers = handlers.slice(1).map(stripHandlerTransientFields);
    element.action = primary;
    renderEventHandlers(element.action);
  }

  function moveEventHandler(index, direction, appLoad, globalActionId = "") {
    const element = findSelectedElement();
    const globalAction = findGlobalAction(globalActionId);
    if (!appLoad && !globalAction && !element) return;

    const handlers = getScopedHandlers(element, globalAction, appLoad);
    const step = direction === "up" ? -1 : 1;
    const targetIndex = index + step;

    if (
      !Number.isInteger(index) ||
      targetIndex < 0 ||
      targetIndex >= handlers.length
    ) {
      return;
    }

    [handlers[index], handlers[targetIndex]] = [
      handlers[targetIndex],
      handlers[index],
    ];

    commitScopedHandlers(handlers, {
      element,
      globalAction,
      appLoad,
      globalActionId,
    });
    scheduleSave();
  }

  return { renderEventHandlers, moveEventHandler };
}
