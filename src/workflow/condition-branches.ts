// @ts-nocheck
import {
  getNestedWorkflowBranchNodes,
  getWorkflowActionBranches,
} from "./graph.ts";

// Builds the condition controls and graph nodes for True/False or Granted/Denied outcomes.
export function createWorkflowConditionBranches({
  renderConditionOptions,
  twkPermissionActionTypes,
  isWorkflowBranchAction,
  editorLanguage,
  localize,
  createId,
}) {
  const t = (key) => localize[key]?.[editorLanguage] ?? key;

  function applyHandlerMetadata(
    element,
    { index, isPrimary, appLoad, globalActionId },
  ) {
    element.dataset.eventHandlerIndex = String(index);
    element.dataset.eventHandlerPrimary = String(isPrimary);
    element.dataset.eventHandlerAppLoad = String(appLoad);
    if (globalActionId) {
      element.dataset.globalActionId = globalActionId;
    }
  }

  function createBranchNodeElement({
    branchRootId,
    className,
    graphKey,
    parentConditionId,
    branch,
    position,
    branchLabel,
    branchTitle,
    propertiesContent,
    workflowPropertiesByNodeId,
    nodeLayer,
  }) {
    const branchRoot = document.createElement("section");
    branchRoot.className = className;
    branchRoot.tabIndex = 0;
    branchRoot.dataset.workflowNodeId = branchRootId;
    branchRoot.dataset.workflowGraph = graphKey;
    branchRoot.dataset.workflowParentConditionId = parentConditionId;
    branchRoot.dataset.workflowBranch = branch;
    branchRoot.dataset.workflowHandle = "in";
    branchRoot.dataset.workflowPortId = branchRootId;
    branchRoot.style.left = `${position.x}px`;
    branchRoot.style.top = `${position.y}px`;

    const output = document.createElement("button");
    output.type = "button";
    output.className = "workflow-handle workflow-handle-output";
    output.dataset.workflowHandle = "out";
    output.dataset.workflowNodeId = branchRootId;
    output.dataset.workflowPortId = `${branchRootId}:out`;
    output.dataset.workflowBranch = branch;
    output.setAttribute(
      "aria-label",
      t("BranchOutput").replace("{branch}", () => branchLabel),
    );

    const branchHeader = document.createElement("div");
    branchHeader.className = "workflow-node-header";
    branchHeader.dataset.workflowDrag = "";

    const branchIcon = document.createElement("span");
    branchIcon.className = "workflow-node-icon";
    branchIcon.textContent = "↪";

    const branchTitleElement = document.createElement("span");
    branchTitleElement.className = "event-action-title";
    branchTitleElement.textContent = branchTitle;

    const branchType = document.createElement("span");
    branchType.className = "workflow-node-kind";
    branchType.textContent = t("WorkflowBranch");

    branchHeader.append(branchIcon, branchTitleElement, branchType);

    workflowPropertiesByNodeId.set(branchRootId, {
      title: branchTitle,
      type: branchType.textContent,
      content: propertiesContent,
    });

    branchRoot.append(output, branchHeader);
    nodeLayer.append(branchRoot);
    return branchRoot;
  }

  function createNestedConditionNodeElement({
    action,
    nodeId,
    position,
    event,
    graphKey,
    nodeLayer,
    propertiesContent,
    workflowPropertiesByNodeId,
  }) {
    const node = document.createElement("section");
    node.className =
      "workflow-node workflow-action-node workflow-condition-node workflow-nested-condition-node";
    node.tabIndex = 0;
    node.dataset.workflowNodeId = nodeId;
    node.dataset.workflowEventName = event;
    node.dataset.workflowGraph = graphKey;
    node.dataset.workflowHandle = "in";
    node.dataset.workflowPortId = nodeId;
    node.style.left = `${position.x}px`;
    node.style.top = `${position.y}px`;

    const header = document.createElement("div");
    header.className = "workflow-node-header";
    header.dataset.workflowDrag = "";

    const icon = document.createElement("span");
    icon.className = "workflow-node-icon";
    icon.textContent = action.type === "switch" ? "↻" : "?";

    const title = document.createElement("span");
    title.className = "event-action-title";
    title.textContent =
      action.workflowTitle ||
      t(
        action.type === "switch"
          ? "SwitchAction"
          : "RunConditionalActionsAction",
      );

    const kind = document.createElement("span");
    kind.className = "workflow-node-kind";
    kind.textContent = t(
      action.type === "switch" ? "SwitchAction" : "RunConditionalActionsAction",
    );
    header.append(icon, title, kind);
    node.append(header);

    getWorkflowActionBranches(action, isWorkflowBranchAction).forEach(
      ({ key: branch, label }, index, branches) => {
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
        handle.dataset.workflowNodeId = nodeId;
        handle.dataset.workflowPortId = `${nodeId}:${branch}`;
        handle.dataset.workflowBranch = branch;
        if (action.type === "switch") {
          handle.style.top = `${Math.round(
            ((index + 1) / (branches.length + 1)) * 100,
          )}%`;
          handle.style.transform = "translateY(-50%)";
        }

        const branchLabel = twkPermissionActionTypes.includes(action.type)
          ? branch === "actions"
            ? t("Granted")
            : t("Denied")
          : action.type === "switch"
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
        portLabel.className = `workflow-branch-port-label workflow-branch-port-${
          branch === "actions"
            ? "true"
            : branch === "elseActions"
              ? "false"
              : "switch"
        }`;
        portLabel.textContent = branchLabel;
        if (action.type === "switch") {
          portLabel.style.top = handle.style.top;
          portLabel.style.right = "-10px";
          portLabel.style.transform = "translate(100%, -50%)";
        }
        node.append(handle, portLabel);
      },
    );

    workflowPropertiesByNodeId.set(nodeId, {
      title: title.textContent,
      type: kind.textContent,
      content: propertiesContent,
    });
    nodeLayer.append(node);
    return node;
  }

  function renderNestedBranchNodes({
    actions,
    ownerNodeId,
    parentBranch,
    parentBranchRootId,
    parentPosition,
    event,
    graphKey,
    layout,
    nodeLayer,
    branchRootWorkflowNodes,
    nestedConditionWorkflowNodes,
    workflowPropertiesByNodeId,
    propertiesContent,
    visitedActions,
  }) {
    const positionsByBranchRootId = new Map([
      [parentBranchRootId, parentPosition],
    ]);
    const nestedNodes = getNestedWorkflowBranchNodes(
      actions,
      isWorkflowBranchAction,
      ownerNodeId,
      parentBranch,
      parentBranchRootId,
      visitedActions,
    );

    nestedNodes.forEach((nestedNode) => {
      const {
        id: nodeId,
        action,
        parentConditionId,
        branch: parentBranchKey,
        parentBranchRootId: containingBranchRootId,
        actionIndex,
      } = nestedNode;
      const containingBranchPosition =
        positionsByBranchRootId.get(containingBranchRootId) || parentPosition;
      const position = layout.positions[nodeId] || {
        x: containingBranchPosition.x + 380,
        y: containingBranchPosition.y + 80 + actionIndex * 240,
      };
      createNestedConditionNodeElement({
        action,
        nodeId,
        position,
        event,
        graphKey,
        nodeLayer,
        propertiesContent,
        workflowPropertiesByNodeId,
      });

      nestedConditionWorkflowNodes.push({
        id: nodeId,
        kind: "nested-condition",
        event,
        action,
        parentConditionId,
        branch: parentBranchKey,
        parentBranchRootId: containingBranchRootId,
      });

      getWorkflowActionBranches(action, isWorkflowBranchAction).forEach(
        ({ key: branch, label }, branchIndex) => {
          const branchRootId = `branch:${action.workflowId}:${branch}`;
          const branchLabel = twkPermissionActionTypes.includes(action.type)
            ? branch === "actions"
              ? t("Granted")
              : t("Denied")
            : action.type === "switch"
              ? label
              : branch === "actions"
                ? t("True")
                : t("False");
          const branchTitle = action.type === "switch"
            ? label === "Default"
              ? t("DefaultBranch")
              : t("CaseBranch").replace("{value}", () => label)
            : t("BranchHeading").replace("{branch}", () => branchLabel);
          const branchPosition = layout.positions[branchRootId] || {
            x: position.x + 380,
            y: position.y + 80 + branchIndex * 300,
          };

          createBranchNodeElement({
            branchRootId,
            className: `workflow-node workflow-condition-branch-node workflow-condition-branch-${branch}`,
            graphKey,
            parentConditionId: nodeId,
            branch,
            position: branchPosition,
            branchLabel,
            branchTitle,
            propertiesContent,
            workflowPropertiesByNodeId,
            nodeLayer,
          });
          branchRootWorkflowNodes.push({
            id: branchRootId,
            kind: "branch-root",
            event,
            action,
            parentConditionId: nodeId,
            branch,
          });
          positionsByBranchRootId.set(branchRootId, branchPosition);
        },
      );
    });
  }

  function buildSwitchCaseHeading(selectedCase, branchLabel, meta) {
    const heading = document.createElement("div");
    heading.className =
      "workflow-condition-branch-node-heading workflow-switch-branch-node-heading";

    const value = document.createElement("input");
    value.type = "text";
    value.className = "workflow-switch-case-value";
    value.value = selectedCase?.value ?? "";
    value.setAttribute("aria-label", t("CaseMatchValue"));
    value.dataset.eventHandlerField = "switchCaseValue";
    value.dataset.switchCaseId = selectedCase?.id || "";
    applyHandlerMetadata(value, meta);

    const caseMatchLabel = document.createElement("label");
    caseMatchLabel.className = "workflow-switch-case-label";
    caseMatchLabel.textContent = t("CaseMatchValue");
    caseMatchLabel.append(value);

    const removeCase = document.createElement("button");
    removeCase.type = "button";
    removeCase.className = "button button-quiet workflow-switch-case-remove";
    removeCase.dataset.removeSwitchCase = selectedCase?.id || "";
    applyHandlerMetadata(removeCase, meta);
    removeCase.textContent = t("RemoveCase");

    heading.append(caseMatchLabel, removeCase);
    return {
      heading,
      branchTitle: t("CaseBranch").replace("{value}", () => branchLabel),
    };
  }

  function renderSwitchBranches({
    handler,
    index,
    appLoad,
    globalActionId,
    row,
    actionPosition,
    nodeLayer,
    graphKey,
    layout,
    branchRootWorkflowNodes,
    nestedConditionWorkflowNodes,
    workflowPropertiesByNodeId,
  }) {
    const meta = { index, isPrimary: handler.isPrimary, appLoad, globalActionId };
    handler.cases = Array.isArray(handler.cases) ? handler.cases : [];
    handler.cases.forEach((item) => {
      item.id ||= createId();
      item.value ??= "null";
      item.actions = Array.isArray(item.actions) ? item.actions : [];
    });
    handler.defaultActions = Array.isArray(handler.defaultActions)
      ? handler.defaultActions
      : [];

    const branchContainers = [];
    const visitedActions = new WeakSet();
    const branchDescriptors = getWorkflowActionBranches(handler);

    branchDescriptors.forEach(({ key: branch, label, actions }, branchIndex) => {
      const branchRootId = `branch:${handler.workflowId}:${branch}`;
      const branchPosition = layout.positions[branchRootId] || {
        x: actionPosition.x + 380,
        y: actionPosition.y + 80 + branchIndex * 300,
      };

      let branchTitle;
      let heading;
      if (branch.startsWith("case:")) {
        const selectedCase = handler.cases.find(
          (item) => `case:${item.id}` === branch,
        );
        const built = buildSwitchCaseHeading(selectedCase, label, meta);
        heading = built.heading;
        branchTitle = built.branchTitle;
      } else {
        branchTitle = t("DefaultBranch");
        heading = document.createElement("div");
        heading.className =
          "workflow-condition-branch-node-heading workflow-switch-branch-node-heading";
        heading.textContent = t("DefaultBranch");
      }

      const branchForm = document
        .querySelector("#action-condition-fields")
        .cloneNode(true);
      branchForm.hidden = false;
      branchForm.removeAttribute("id");

      const actionList = branchForm.querySelector("#condition-actions");
      const elseList = branchForm.querySelector("#condition-elseActions");
      const addButtons = [
        ...branchForm.querySelectorAll("[data-add-condition-action]"),
      ];
      const addButton = addButtons.find(
        (button) => button.dataset.addConditionAction === "actions",
      );
      if (addButton) {
        addButton.dataset.addConditionAction = branch;
        applyHandlerMetadata(addButton, meta);
      }
      if (elseList) elseList.hidden = true;
      addButtons
        .filter((button) => button !== addButton)
        .forEach((button) => {
          button.hidden = true;
        });
      [...branchForm.children].forEach((field) => {
        if (
          field !== actionList &&
          field !== elseList &&
          !field.hasAttribute("data-add-condition-action")
        ) {
          field.hidden = true;
        }
      });

      const branchProperties = document.createElement("div");
      branchProperties.className =
        "condition-action event-action-card workflow-node-properties";
      branchProperties.append(heading, branchForm);

      const branchRoot = createBranchNodeElement({
        branchRootId,
        className:
          "workflow-node workflow-condition-branch-node workflow-switch-branch-node",
        graphKey,
        parentConditionId: row.dataset.workflowNodeId,
        branch,
        position: branchPosition,
        branchLabel: label,
        branchTitle,
        propertiesContent: branchProperties,
        workflowPropertiesByNodeId,
        nodeLayer,
      });
      branchContainers.push(branchRoot);

      renderConditionOptions(
        handler,
        branchForm,
        [],
        {
          index,
          isPrimary: handler.isPrimary,
          appLoad,
          globalActionId,
          branchOnly: true,
        },
        [
          {
            branch,
            heading: label,
            actions,
            listSelector: "#condition-actions",
          },
        ],
      );

      branchForm.querySelectorAll("[id]").forEach((field) => {
        const previousId = field.id;
        field.id = `${previousId}-switch-${handler.workflowId}-${branchIndex}`;
        branchForm
          .querySelectorAll(`label[for="${previousId}"]`)
          .forEach((labelNode) => {
            labelNode.htmlFor = field.id;
          });
      });

      renderNestedBranchNodes({
        actions,
        ownerNodeId: row.dataset.workflowNodeId,
        parentBranch: branch,
        parentBranchRootId: branchRootId,
        parentPosition: branchPosition,
        event: row.dataset.workflowEventName,
        graphKey,
        layout,
        nodeLayer,
        branchRootWorkflowNodes,
        nestedConditionWorkflowNodes,
        workflowPropertiesByNodeId,
        propertiesContent: branchProperties,
        visitedActions,
      });

      branchRootWorkflowNodes.push({
        id: branchRootId,
        kind: "branch-root",
        event: row.dataset.workflowEventName,
        action: handler,
        parentConditionId: row.dataset.workflowNodeId,
        branch,
      });
    });

    const fields = branchContainers.flatMap((container) => [
      ...container.querySelectorAll("[data-condition-action]"),
    ]);
    fields.forEach((field) => applyHandlerMetadata(field, meta));
    return fields;
  }

  function renderConditionOrPermissionBranches({
    handler,
    index,
    appLoad,
    globalActionId,
    row,
    actionPosition,
    nodeLayer,
    graphKey,
    layout,
    branchRootWorkflowNodes,
    nestedConditionWorkflowNodes,
    workflowPropertiesByNodeId,
  }) {
    const meta = { index, isPrimary: handler.isPrimary, appLoad, globalActionId };
    const conditionFields = document
      .querySelector("#action-condition-fields")
      .cloneNode(true);
    const conditionBranchContainers = [];
    const visitedActions = new WeakSet();
    conditionFields.hidden = false;
    conditionFields.removeAttribute("id");

    const branchOnly = twkPermissionActionTypes.includes(handler.type);
    if (branchOnly) {
      // Permission actions branch on helper results, not on a user-authored condition.
      const directChildren = [...conditionFields.children];
      const headings = directChildren.filter((field) =>
        field.classList.contains("binding-heading"),
      );
      if (headings[0]) headings[0].textContent = t("WhenGranted");
      if (headings[1]) headings[1].textContent = t("WhenDenied");

      const branchControls = new Set([
        conditionFields.querySelector("#condition-actions"),
        conditionFields.querySelector("#condition-elseActions"),
        ...directChildren.filter((field) =>
          field.hasAttribute("data-add-condition-action"),
        ),
      ]);
      directChildren.forEach((field) => {
        if (!branchControls.has(field)) field.hidden = true;
      });
      delete handler.condition;
      handler.actions ||= [];
      handler.elseActions ||= [];
    } else {
      conditionFields
        .querySelectorAll('[id^="property-condition-"]')
        .forEach((field) => {
          field.dataset.eventConditionField = field.id;
          field.dataset.eventHandlerIndex = String(index);
          field.dataset.eventHandlerPrimary = String(handler.isPrimary);
          field.dataset.eventHandlerAppLoad = String(appLoad);
        });
    }

    conditionFields
      .querySelectorAll(
        "[data-add-condition-action], [data-remove-condition-action]",
      )
      .forEach((button) => applyHandlerMetadata(button, meta));

    row.append(conditionFields);

    renderConditionOptions(handler, conditionFields, [], {
      index,
      isPrimary: handler.isPrimary,
      appLoad,
      globalActionId,
      ...(branchOnly ? { branchOnly: true } : {}),
    });

    ["actions", "elseActions"].forEach((branch, branchIndex) => {
      const label = branchOnly
        ? branch === "actions"
          ? t("Granted")
          : t("Denied")
        : branch === "actions"
          ? t("True")
          : t("False");

      const branchList = conditionFields.querySelector(`#condition-${branch}`);
      const addButton = [
        ...conditionFields.querySelectorAll(
          `[data-add-condition-action="${branch}"]`,
        ),
      ].find((button) => !button.closest(".condition-action-nested-condition"));

      // Branch action lists are moved into graph nodes while retaining their existing form controls.
      const branchRootId = `branch:${handler.workflowId}:${branch}`;
      const branchPosition = layout.positions[branchRootId] || {
        x: actionPosition.x + 380,
        y: actionPosition.y + (branchIndex === 0 ? 80 : 380),
      };

      const branchHeading = document.createElement("div");
      branchHeading.className = "workflow-condition-branch-node-heading";
      const branchTitle = t("BranchHeading").replace("{branch}", () => label);
      branchHeading.textContent = branchTitle;

      const branchProperties = document.createElement("div");
      branchProperties.className =
        "condition-action event-action-card workflow-node-properties";
      branchProperties.append(branchHeading);
      if (branchList) branchProperties.append(branchList);
      if (addButton) branchProperties.append(addButton);

      const branchRoot = createBranchNodeElement({
        branchRootId,
        className: `workflow-node workflow-condition-branch-node workflow-condition-branch-${branch}`,
        graphKey,
        parentConditionId: row.dataset.workflowNodeId,
        branch,
        position: branchPosition,
        branchLabel: label,
        branchTitle,
        propertiesContent: branchProperties,
        workflowPropertiesByNodeId,
        nodeLayer,
      });
      conditionBranchContainers.push(branchRoot);

      const branchActions = getWorkflowActionBranches(
        handler,
        isWorkflowBranchAction,
      ).find((descriptor) => descriptor.key === branch)?.actions || [];
      renderNestedBranchNodes({
        actions: branchActions,
        ownerNodeId: row.dataset.workflowNodeId,
        parentBranch: branch,
        parentBranchRootId: branchRootId,
        parentPosition: branchPosition,
        event: row.dataset.workflowEventName,
        graphKey,
        layout,
        nodeLayer,
        branchRootWorkflowNodes,
        nestedConditionWorkflowNodes,
        workflowPropertiesByNodeId,
        propertiesContent: branchProperties,
        visitedActions,
      });

      branchRootWorkflowNodes.push({
        id: branchRootId,
        kind: "branch-root",
        event: row.dataset.workflowEventName,
        action: handler,
        parentConditionId: row.dataset.workflowNodeId,
        branch,
      });
    });

    const conditionContainers = [row, ...conditionBranchContainers];
    const fields = conditionContainers.flatMap((container) => [
      ...container.querySelectorAll("[data-condition-action]"),
    ]);

    ["actions", "elseActions"].forEach((branch) => {
      const label = branchOnly
        ? branch === "actions"
          ? t("Granted")
          : t("Denied")
        : branch === "actions"
          ? t("True")
          : t("False");
      const addButton = nodeLayer.querySelector(
        `[data-add-condition-action="${branch}"][data-event-handler-index="${index}"]`,
      );
      if (addButton) {
        addButton.setAttribute(
          "aria-label",
          t("AddActionToBranch").replace("{branch}", () => label),
        );
      }
    });

    fields.forEach((field) => applyHandlerMetadata(field, meta));

    if (globalActionId) {
      conditionFields
        .querySelectorAll(
          "[data-event-handler-index], [data-condition-action], [data-add-condition-action], [data-remove-condition-action]",
        )
        .forEach((field) => {
          field.dataset.globalActionId = globalActionId;
        });
    }

    conditionContainers.forEach((container) => {
      // Cloned condition forms need unique IDs and matching labels across both graph branches.
      container.querySelectorAll("[id]").forEach((field) => {
        const previousId = field.id;
        field.id = `${previousId}-handler-${index}`;
        conditionContainers.forEach((labelContainer) => {
          labelContainer
            .querySelectorAll(`label[for="${previousId}"]`)
            .forEach((labelNode) => {
              labelNode.htmlFor = field.id;
            });
        });
      });
    });

    return fields;
  }

  return function renderWorkflowConditionBranches(params) {
    const { handler } = params;
    if (handler.type === "switch") {
      return renderSwitchBranches(params);
    }
    if (isWorkflowBranchAction(handler)) {
      return renderConditionOrPermissionBranches(params);
    }
    return [];
  };
}