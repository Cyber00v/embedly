// @ts-nocheck
import { getWorkflowActionBranches } from "./graph.ts";
 
// Builds the condition controls and graph nodes for True/False or Granted/Denied outcomes.
export function createWorkflowConditionBranches({
  renderConditionOptions,
  twkPermissionActionTypes,
  isWorkflowBranchAction,
  editorLanguage,
  localize,
  createId,
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
    workflowPropertiesByNodeId,
  }) {
  let conditionActionFields = [];
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
    const branchContainers = [];
    const branchDescriptors = getWorkflowActionBranches(handler);
    branchDescriptors.forEach(({ key: branch, label, actions }, branchIndex) => {
      const branchRootId = `branch:${handler.workflowId}:${branch}`;
      const branchRoot = document.createElement("section");
      branchRoot.className = "workflow-node workflow-condition-branch-node workflow-switch-branch-node";
      branchRoot.tabIndex = 0;
      branchRoot.dataset.workflowNodeId = branchRootId;
      branchRoot.dataset.workflowGraph = graphKey;
      branchRoot.dataset.workflowParentConditionId = row.dataset.workflowNodeId;
      branchRoot.dataset.workflowBranch = branch;
      branchRoot.dataset.workflowHandle = "in";
      branchRoot.dataset.workflowPortId = branchRootId;
      const branchPosition = layout.positions[branchRootId] || {
        x: actionPosition.x + 380,
        y: actionPosition.y + 80 + branchIndex * 300,
      };
      branchRoot.style.left = `${branchPosition.x}px`;
      branchRoot.style.top = `${branchPosition.y}px`;
      const output = document.createElement("button");
      output.type = "button";
      output.className = "workflow-handle workflow-handle-output";
      output.dataset.workflowHandle = "out";
      output.dataset.workflowNodeId = branchRootId;
      output.dataset.workflowPortId = `${branchRootId}:out`;
      output.dataset.workflowBranch = branch;
      output.setAttribute(
        "aria-label",
        localize.BranchOutput[editorLanguage].replace(
          "{branch}",
          () => label,
        ),
      );
      const heading = document.createElement("div");
      heading.className =
        "workflow-condition-branch-node-heading workflow-switch-branch-node-heading";
      let branchTitle;
      if (branch.startsWith("case:")) {
        const selectedCase = handler.cases.find(
          (item) => `case:${item.id}` === branch,
        );
        branchTitle = localize.CaseBranch[editorLanguage].replace(
          "{value}",
          () => label,
        );
        const value = document.createElement("input");
        value.type = "text";
        value.className = "workflow-switch-case-value";
        value.value = selectedCase?.value ?? "";
        value.setAttribute(
          "aria-label",
          localize.CaseMatchValue[editorLanguage],
        );
        value.dataset.eventHandlerField = "switchCaseValue";
        value.dataset.switchCaseId = selectedCase?.id || "";
        value.dataset.eventHandlerIndex = String(index);
        value.dataset.eventHandlerPrimary = String(handler.isPrimary);
        value.dataset.eventHandlerAppLoad = String(appLoad);
        if (globalActionId) value.dataset.globalActionId = globalActionId;
        const caseMatchLabel = document.createElement("label");
        caseMatchLabel.className = "workflow-switch-case-label";
        caseMatchLabel.textContent =
          localize.CaseMatchValue[editorLanguage];
        caseMatchLabel.append(value);
        const removeCase = document.createElement("button");
        removeCase.type = "button";
        removeCase.className = "button button-quiet workflow-switch-case-remove";
        removeCase.dataset.removeSwitchCase = selectedCase?.id || "";
        removeCase.dataset.eventHandlerIndex = String(index);
        removeCase.dataset.eventHandlerPrimary = String(handler.isPrimary);
        removeCase.dataset.eventHandlerAppLoad = String(appLoad);
        if (globalActionId)
          removeCase.dataset.globalActionId = globalActionId;
        removeCase.textContent = localize.RemoveCase[editorLanguage];
        heading.append(caseMatchLabel, removeCase);
      } else {
        branchTitle = localize.DefaultBranch[editorLanguage];
        heading.textContent = localize.DefaultBranch[editorLanguage];
      }

      const branchForm = document
        .querySelector("#action-condition-fields")
        .cloneNode(true);
      branchForm.hidden = false;
      branchForm.removeAttribute("id");
      const actionList = branchForm.querySelector("#condition-actions");
      const elseList = branchForm.querySelector("#condition-elseActions");
      const addButtons = [...branchForm.querySelectorAll("[data-add-condition-action]")];
      const addButton = addButtons.find(
        (button) => button.dataset.addConditionAction === "actions",
      );
      if (addButton) addButton.dataset.addConditionAction = branch;
      if (elseList) elseList.hidden = true;
      addButtons
        .filter((button) => button !== addButton)
        .forEach((button) => (button.hidden = true));
      [...branchForm.children].forEach((field) => {
        if (
          field !== actionList &&
          field !== elseList &&
          !field.hasAttribute("data-add-condition-action")
        )
          field.hidden = true;
      });
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
      branchType.textContent = localize.WorkflowBranch[editorLanguage];
      branchHeader.append(branchIcon, branchTitleElement, branchType);
      const branchProperties = document.createElement("div");
      branchProperties.className =
        "condition-action event-action-card workflow-node-properties";
      branchProperties.append(heading, branchForm);
      workflowPropertiesByNodeId.set(branchRootId, {
        title: branchTitle,
        type: branchType.textContent,
        content: branchProperties,
      });
      branchRoot.append(output, branchHeader);
      nodeLayer.append(branchRoot);
      branchContainers.push(branchRoot);
      renderConditionOptions(
        handler,
        branchForm,
        [],
        {
          index,
          isPrimary: handler.isPrimary,
          appLoad,
          branchOnly: true,
        },
        [{
          branch,
          heading: label,
          actions,
          listSelector: "#condition-actions",
        }],
      );
      branchForm.querySelectorAll("[id]").forEach((field) => {
        const previousId = field.id;
        field.id = `${previousId}-switch-${handler.workflowId}-${branchIndex}`;
        branchForm
          .querySelectorAll(`label[for="${previousId}"]`)
          .forEach((label) => {
            label.htmlFor = field.id;
          });
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
    conditionActionFields = branchContainers.flatMap((container) => [
      ...container.querySelectorAll("[data-condition-action]"),
    ]);
    conditionActionFields.forEach((field) => {
      field.dataset.eventHandlerIndex = String(index);
      field.dataset.eventHandlerPrimary = String(handler.isPrimary);
      field.dataset.eventHandlerAppLoad = String(appLoad);
      if (globalActionId) field.dataset.globalActionId = globalActionId;
    });
    return conditionActionFields;
  }
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
      const branchTitle = localize.BranchHeading[editorLanguage].replace(
        "{branch}",
        () => label,
      );
      branchHeading.textContent = branchTitle;
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
      branchType.textContent = localize.WorkflowBranch[editorLanguage];
      branchHeader.append(branchIcon, branchTitleElement, branchType);
      const branchProperties = document.createElement("div");
      branchProperties.className =
        "condition-action event-action-card workflow-node-properties";
      branchProperties.append(branchHeading);
      if (branchList) branchProperties.append(branchList);
      if (addButton) branchProperties.append(addButton);
      workflowPropertiesByNodeId.set(branchRootId, {
        title: branchTitle,
        type: branchType.textContent,
        content: branchProperties,
      });
      branchRoot.append(branchOutput);
      branchRoot.append(branchHeader);
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
