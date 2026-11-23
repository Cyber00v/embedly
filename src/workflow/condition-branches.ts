// @ts-nocheck
 
// Builds the condition controls and graph nodes for True/False or Granted/Denied outcomes.
export function createWorkflowConditionBranches({
  renderConditionOptions,
  twkPermissionActionTypes,
  isWorkflowBranchAction,
  editorLanguage,
  localize,
}) {
  return function renderWorkflowConditionBranches({
    handler,
    index,
    appLoad,
    globalActionId = "",
    row,
    actionPosition,
    nodeLayer,
    graphKey,
    layout,
    branchRootWorkflowNodes,
  }) {
  let conditionActionFields = [];
  if (isWorkflowBranchAction(handler)) {
    const conditionFields = document
      .querySelector("#action-condition-fields")
      .cloneNode(true);
    const conditionBranchContainers = [];
    conditionFields.hidden = false;
    conditionFields.removeAttribute("id");
    const branchOnly =
      twkPermissionActionTypes.includes(handler.type);
    if (branchOnly) {
      // Permission actions branch on helper results, not on a user-authored condition.
      const directChildren = [...conditionFields.children];
      const headings = directChildren.filter((field) =>
        field.classList.contains("binding-heading"),
      );
      if (headings[0])
        headings[0].textContent = localize.WhenGranted[editorLanguage];
      if (headings[1])
        headings[1].textContent = localize.WhenDenied[editorLanguage];
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
      .querySelectorAll("[data-add-condition-action]")
      .forEach((button) => {
        button.dataset.eventHandlerIndex = String(index);
        button.dataset.eventHandlerPrimary = String(handler.isPrimary);
        button.dataset.eventHandlerAppLoad = String(appLoad);
        if (globalActionId) button.dataset.globalActionId = globalActionId;
      });
    conditionFields
      .querySelectorAll("[data-remove-condition-action]")
      .forEach((button) => {
        button.dataset.eventHandlerIndex = String(index);
        button.dataset.eventHandlerPrimary = String(handler.isPrimary);
        button.dataset.eventHandlerAppLoad = String(appLoad);
        if (globalActionId) button.dataset.globalActionId = globalActionId;
      });
    row.append(conditionFields);
    if (!branchOnly)
      renderConditionOptions(handler, conditionFields, [], {
        index,
        isPrimary: handler.isPrimary,
        appLoad,
      });
    else
      renderConditionOptions(handler, conditionFields, [], {
        index,
        isPrimary: handler.isPrimary,
        appLoad,
        branchOnly: true,
      });
    ["actions", "elseActions"].forEach((branch, branchIndex) => {
      const label = branchOnly
        ? branch === "actions"
          ? localize.Granted[editorLanguage]
          : localize.Denied[editorLanguage]
        : branch === "actions"
          ? localize.True[editorLanguage]
          : localize.False[editorLanguage];
      const branchList = conditionFields.querySelector(
        `#condition-${branch}`,
      );
      const addButton = [
        ...conditionFields.querySelectorAll(
          `[data-add-condition-action="${branch}"]`,
        ),
      ].find((button) => !button.closest(".condition-action-nested-condition"));
      const branchRoot = document.createElement("section");
      // Branch action lists are moved into graph nodes while retaining their existing form controls.
      const branchRootId = `branch:${handler.workflowId}:${branch}`;
      branchRoot.className = `workflow-node workflow-condition-branch-node workflow-condition-branch-${branch}`;
      branchRoot.tabIndex = 0;
      branchRoot.dataset.workflowNodeId = branchRootId;
      branchRoot.dataset.workflowGraph = graphKey;
      branchRoot.dataset.workflowParentConditionId = row.dataset.workflowNodeId;
      branchRoot.dataset.workflowBranch = branch;
      branchRoot.dataset.workflowHandle = "in";
      branchRoot.dataset.workflowPortId = branchRootId;
      const branchPosition = layout.positions[branchRootId] || {
        x: actionPosition.x + 380,
        y: actionPosition.y + (branchIndex === 0 ? 80 : 380),
      };
      branchRoot.style.left = `${branchPosition.x}px`;
      branchRoot.style.top = `${branchPosition.y}px`;
      const branchOutput = document.createElement("button");
      branchOutput.type = "button";
      branchOutput.className = "workflow-handle workflow-handle-output";
      branchOutput.dataset.workflowHandle = "out";
      branchOutput.dataset.workflowNodeId = branchRootId;
      branchOutput.dataset.workflowPortId = `${branchRootId}:out`;
      branchOutput.dataset.workflowBranch = branch;
      branchOutput.setAttribute(
        "aria-label",
        localize.BranchOutput[editorLanguage].replace(
          "{branch}",
          () => label,
        ),
      );
      const branchHeading = document.createElement("div");
      branchHeading.className = "workflow-condition-branch-node-heading";
      branchHeading.textContent = localize.BranchHeading[editorLanguage].replace(
        "{branch}",
        () => label,
      );
      branchRoot.append(branchOutput);
      if (branchList) branchRoot.append(branchHeading, branchList);
      else branchRoot.append(branchHeading);
      if (addButton) branchRoot.append(addButton);
      nodeLayer.append(branchRoot);
      conditionBranchContainers.push(branchRoot);
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
    conditionActionFields = conditionContainers.flatMap((container) => [
      ...container.querySelectorAll("[data-condition-action]"),
    ]);
    ["actions", "elseActions"].forEach((branch) => {
      const label = branchOnly
        ? branch === "actions"
          ? localize.Granted[editorLanguage]
          : localize.Denied[editorLanguage]
        : branch === "actions"
          ? localize.True[editorLanguage]
          : localize.False[editorLanguage];
      const addButton = nodeLayer.querySelector(
        `[data-add-condition-action="${branch}"][data-event-handler-index="${index}"]`,
      );
      if (addButton)
        addButton.setAttribute(
          "aria-label",
          localize.AddActionToBranch[editorLanguage].replace(
            "{branch}",
            () => label,
          ),
        );
    });
    conditionActionFields.forEach((field) => {
      field.dataset.eventHandlerIndex = String(index);
      field.dataset.eventHandlerPrimary = String(handler.isPrimary);
      field.dataset.eventHandlerAppLoad = String(appLoad);
      if (globalActionId) field.dataset.globalActionId = globalActionId;
    });
    if (globalActionId)
      conditionFields
        .querySelectorAll(
          "[data-event-handler-index], [data-condition-action], [data-add-condition-action], [data-remove-condition-action]",
        )
        .forEach((field) => {
          field.dataset.globalActionId = globalActionId;
        });
    conditionContainers.forEach((container) => {
      // Cloned condition forms need unique IDs and matching labels across both graph branches.
      container.querySelectorAll("[id]").forEach((field) => {
        const previousId = field.id;
        field.id = `${previousId}-handler-${index}`;
        conditionContainers.forEach((labelContainer) => {
          labelContainer
            .querySelectorAll(`label[for="${previousId}"]`)
            .forEach((label) => {
              label.htmlFor = field.id;
            });
        });
      });
    });
  }
  return conditionActionFields;
  };
}
