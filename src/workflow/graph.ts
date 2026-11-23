// @ts-nocheck
 
// Normalizes workflow actions and translates between the editable graph and action lists.

export function isWorkflowBranchAction(action, branchActionTypes) {
  return (
    action?.type === "condition" ||
    branchActionTypes.includes(action?.type)
  );
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

export function ensureWorkflowActionIds(
  actions,
  { isBranchAction, createId },
) {
  const actionNodes = [];
  // A shared action object can appear in more than one branch, so collect it only once.
  const visited = new WeakSet();
  const collect = (action) => {
    if (!action || typeof action !== "object" || visited.has(action)) return;
    visited.add(action);
    actionNodes.push(action);
    if (!isBranchAction(action)) return;
    const lists = getConditionActionLists(action);
    lists.actions.forEach(collect);
    lists.elseActions.forEach(collect);
  };
  actions.forEach(collect);

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

export function serializeWorkflowGraph(nodes, edges, isBranchAction) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const rootActionIds = new Set(
    nodes
      .filter((node) => node.kind === "action")
      .map((node) => node.id),
  );
  const outputBySource = new Map();
  edges
    .filter(
      (edge) =>
        edge.kind === "sequence" &&
        (rootActionIds.has(edge.from) || byId.get(edge.from)?.kind === "trigger") &&
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
  nodes
    .filter(
      (node) => node.kind === "action" && isBranchAction(node.action),
    )
    .forEach((condition) => {
      // Rebuild each branch list from its root edge and sequence edges, retaining unconnected actions last.
      ["actions", "elseActions"].forEach((branch) => {
        const branchNodes = nodes.filter(
          (node) =>
            node.kind === "branch-action" &&
            node.parentConditionId === condition.id &&
            node.branch === branch,
        );
        if (!branchNodes.length) return;
        const branchNodeIds = new Set(branchNodes.map((node) => node.id));
        const branchEdges = edges.filter(
          (edge) => edge.kind === "branch" && edge.branch === branch,
        );
        const nextBySource = new Map(
          branchEdges
            .filter(
              (edge) =>
                branchNodeIds.has(edge.from) && branchNodeIds.has(edge.to),
            )
            .map((edge) => [edge.from, edge.to]),
        );
        const branchRootId = `branch:${condition.action.workflowId}:${branch}`;
        const first = branchEdges.find(
          (edge) =>
            edge.from === branchRootId && branchNodeIds.has(edge.to),
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
        branchNodes.forEach((node) => {
          if (!branchVisited.has(node.id)) orderedBranch.push(node.action);
        });
        condition.action[branch] = orderedBranch;
      });
    });
  return ordered;
}
