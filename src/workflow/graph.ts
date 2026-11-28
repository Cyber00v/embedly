// @ts-nocheck

// Normalizes workflow actions and translates between the editable graph and action lists.

export function isWorkflowBranchAction(action, branchActionTypes) {
  return (
    action?.type === "condition" ||
    action?.type === "switch" ||
    branchActionTypes.includes(action?.type)
  );
}

function findSwitchCaseForBranch(action, branch) {
  if (action?.type !== "switch" || typeof branch !== "string") return null;
  if (!branch.startsWith("case:")) return null;
  return action.cases?.find((item) => `case:${item.id}` === branch) || null;
}

export function getWorkflowActionBranches(action = {}, isBranchAction = null) {
  if (action.type === "switch") {
    const branches = (Array.isArray(action.cases) ? action.cases : []).map(
      (item, index) => ({
        key: `case:${item.id}`,
        label: String(item.value ?? `Case ${index + 1}`),
        actions: Array.isArray(item.actions) ? item.actions : [],
      }),
    );
    if (action.defaultEnabled || action.defaultActions?.length) {
      branches.push({
        key: "default",
        label: "Default",
        actions: Array.isArray(action.defaultActions) ? action.defaultActions : [],
      });
    }
    return branches;
  }

  const hasBranchLists =
    action.type === "condition" ||
    (typeof isBranchAction === "function" && isBranchAction(action)) ||
    (Array.isArray(isBranchAction) && isBranchAction.includes(action.type)) ||
    Array.isArray(action.actions) ||
    Array.isArray(action.elseActions);

  if (hasBranchLists) {
    const lists = getConditionActionLists(action);
    return [
      { key: "actions", label: "True", actions: lists.actions },
      { key: "elseActions", label: "False", actions: lists.elseActions },
    ];
  }

  return [];
}

export function getNestedWorkflowBranchNodes(
  actions,
  isBranchAction,
  ownerNodeId,
  parentBranch,
  parentBranchRootId,
  visitedActions = new WeakSet(),
) {
  if (!Array.isArray(actions)) return [];
  const nestedNodes = [];

  actions.forEach((action, actionIndex) => {
    if (!isBranchAction(action) || visitedActions.has(action)) return;
    visitedActions.add(action);

    const nodeId = `nested-condition:${action.workflowId}`;
    nestedNodes.push({
      id: nodeId,
      action,
      parentConditionId: ownerNodeId,
      branch: parentBranch,
      parentBranchRootId,
      actionIndex,
    });

    getWorkflowActionBranches(action, isBranchAction).forEach(
      ({ key: branch, actions: nestedActions }) => {
        nestedNodes.push(
          ...getNestedWorkflowBranchNodes(
            nestedActions,
            isBranchAction,
            nodeId,
            branch,
            `branch:${action.workflowId}:${branch}`,
            visitedActions,
          ),
        );
      },
    );
  });

  return nestedNodes;
}

export function getWorkflowBranchActions(action, branch) {
  if (action?.type === "switch") {
    if (branch === "default") {
      return Array.isArray(action.defaultActions) ? action.defaultActions : [];
    }
    const selectedCase = findSwitchCaseForBranch(action, branch);
    return Array.isArray(selectedCase?.actions) ? selectedCase.actions : [];
  }
  if (
    branch === "actions" &&
    !Array.isArray(action?.actions) &&
    action?.effect
  ) {
    return [action.effect];
  }
  return Array.isArray(action?.[branch]) ? action[branch] : [];
}

export function setWorkflowBranchActions(action, branch, actions) {
  if (action?.type === "switch") {
    if (branch === "default") {
      action.defaultActions = actions;
      return;
    }
    const selectedCase = findSwitchCaseForBranch(action, branch);
    if (selectedCase) {
      selectedCase.actions = actions;
    }
    return;
  }
  action[branch] = actions;
  if (branch === "actions") delete action.effect;
}

export function getConditionActionLists(action = {}) {
  return {
    actions: Array.isArray(action.actions)
      ? action.actions
      : action.effect
        ? [action.effect]
        : [],
    elseActions: Array.isArray(action.elseActions) ? action.elseActions : [],
  };
}

function collectActionNodes(actions, isBranchAction) {
  const actionNodes = [];
  // A shared action object can appear in more than one branch, so collect it only once.
  const visited = new WeakSet();

  const collect = (action) => {
    if (!action || typeof action !== "object" || visited.has(action)) return;
    visited.add(action);
    actionNodes.push(action);
    if (!isBranchAction(action)) return;
    getWorkflowActionBranches(action, isBranchAction).forEach(
      ({ actions: branchActions }) => branchActions.forEach(collect),
    );
  };

  actions.forEach(collect);
  return actionNodes;
}

export function ensureWorkflowActionIds(
  actions,
  { isBranchAction, createId },
) {
  const actionNodes = collectActionNodes(actions, isBranchAction);
  const reservedIds = new Set(
    actionNodes
      .map((action) => action.workflowId)
      .filter((id) => typeof id === "string" && id.length > 0),
  );
  const assignedIds = new Set();

  actionNodes.forEach((action) => {
    if (
      typeof action.workflowId !== "string" ||
      !action.workflowId ||
      assignedIds.has(action.workflowId)
    ) {
      let workflowId;
      do {
        workflowId = `workflow-${createId()}`;
      } while (reservedIds.has(workflowId) || assignedIds.has(workflowId));
      action.workflowId = workflowId;
      reservedIds.add(workflowId);
    }
    assignedIds.add(action.workflowId);
  });
}

export function workflowEdgeId(from, to, kind = "sequence") {
  return `${kind}:${from}->${to}`;
}

export function createWorkflowEdge(from, to, kind = "sequence", label = "") {
  return { id: workflowEdgeId(from, to, kind), from, to, kind, label };
}

function orderRootActions(nodes, edges, byId) {
  const rootActionIds = new Set(
    nodes.filter((node) => node.kind === "action").map((node) => node.id),
  );
  const outputBySource = new Map();

  edges
    .filter(
      (edge) =>
        edge.kind === "sequence" &&
        (rootActionIds.has(edge.from) ||
          byId.get(edge.from)?.kind === "trigger") &&
        rootActionIds.has(edge.to),
    )
    .forEach((edge) => outputBySource.set(edge.from, edge.to));

  const ordered = [];
  const visited = new Set();

  nodes
    .filter((node) => node.kind === "trigger")
    .forEach((trigger) => {
      let nextId = outputBySource.get(trigger.id);
      while (nextId && !visited.has(nextId)) {
        const node = byId.get(nextId);
        if (!node || node.kind !== "action") break;
        visited.add(nextId);
        ordered.push(node.action);
        nextId = outputBySource.get(nextId);
      }
    });

  nodes
    .filter((node) => node.kind === "action")
    .forEach((node) => {
      if (!visited.has(node.id)) {
        visited.add(node.id);
        ordered.push(node.action);
      }
    });

  return ordered;
}

function orderBranchActions(condition, branch, nodes, edges, byId) {
  const branchNodes = nodes.filter(
    (node) =>
      node.kind === "branch-action" &&
      node.parentConditionId === condition.id &&
      node.branch === branch,
  );
  if (!branchNodes.length) return null;

  const branchNodeIds = new Set(branchNodes.map((node) => node.id));
  const branchEdges = edges.filter(
    (edge) => edge.kind === "branch" && edge.branch === branch,
  );
  const nextBySource = new Map(
    branchEdges
      .filter(
        (edge) => branchNodeIds.has(edge.from) && branchNodeIds.has(edge.to),
      )
      .map((edge) => [edge.from, edge.to]),
  );

  const branchRootId = `branch:${condition.action.workflowId}:${branch}`;
  const first = branchEdges.find(
    (edge) => edge.from === branchRootId && branchNodeIds.has(edge.to),
  )?.to;

  const orderedBranch = [];
  const branchVisited = new Set();
  let nextId = first;

  while (nextId && !branchVisited.has(nextId)) {
    const node = byId.get(nextId);
    if (!node || node.kind !== "branch-action") break;
    branchVisited.add(nextId);
    orderedBranch.push(node.action);
    nextId = nextBySource.get(nextId);
  }

  // Rebuild each branch list from its root edge and sequence edges, retaining unconnected actions last.
  branchNodes.forEach((node) => {
    if (!branchVisited.has(node.id)) {
      orderedBranch.push(node.action);
    }
  });

  return orderedBranch;
}

export function serializeWorkflowGraph(nodes, edges, isBranchAction) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ordered = orderRootActions(nodes, edges, byId);

  nodes
    .filter((node) => node.kind === "action" && isBranchAction(node.action))
    .forEach((condition) => {
      getWorkflowActionBranches(condition.action, isBranchAction).forEach(
        ({ key: branch }) => {
          const orderedBranch = orderBranchActions(
            condition,
            branch,
            nodes,
            edges,
            byId,
          );
          if (orderedBranch) {
            setWorkflowBranchActions(condition.action, branch, orderedBranch);
          }
        },
      );
    });

  return ordered;
}