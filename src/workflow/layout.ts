// @ts-nocheck

// Validates persisted graph layout and provides its transient editor state.
 
export function getWorkflowGraphLayout(
  savedLayouts,
  graphKey,
  { clampNumber, createWorkflowEdge, onMigrate },
) {
  const saved =
    savedLayouts &&
    typeof savedLayouts === "object" &&
    !Array.isArray(savedLayouts)
      ? savedLayouts[graphKey] || {}
      : {};
  const positions = Object.fromEntries(
    Object.entries(saved.positions || {})
      .filter(
        ([nodeId, position]) =>
          typeof nodeId === "string" &&
          position &&
          Number.isFinite(position.x) &&
          Number.isFinite(position.y),
      )
      .map(([nodeId, position]) => [
        nodeId,
        {
          x: clampNumber(position.x, 0, 50000, 0),
          y: clampNumber(position.y, 0, 50000, 0),
        },
      ]),
  );
  // Only sequence edges are persisted here; branch and token links are derived from the action model.
  const edges = Array.isArray(saved.edges)
    ? saved.edges
        .filter(
          (edge) =>
            edge &&
            edge.kind === "sequence" &&
            typeof edge.from === "string" &&
            typeof edge.to === "string",
        )
        .map((edge) => createWorkflowEdge(edge.from, edge.to, "sequence"))
    : [];
  if (
    savedLayouts?.[graphKey] &&
    typeof savedLayouts[graphKey] === "object" &&
    Object.hasOwn(savedLayouts[graphKey], "tokenConnections")
  ) {
    // Older layouts stored token links separately; token connections now live in graph edges.
    delete savedLayouts[graphKey].tokenConnections;
    onMigrate();
  }
  return {
    positions,
    edges,
    zoom: clampNumber(saved.zoom, 0.15, 1.5, 1),
    panX: clampNumber(saved.panX, -50000, 50000, 0),
    panY: clampNumber(saved.panY, -50000, 50000, 0),
    minimapOpen: saved.minimapOpen === true,
    hiddenTokenIds: Array.isArray(saved.hiddenTokenIds)
      ? saved.hiddenTokenIds.filter((tokenId) => typeof tokenId === "string")
      : [],
    workflowNodeIds:
      saved.workflowNodeIds &&
      typeof saved.workflowNodeIds === "object" &&
      !Array.isArray(saved.workflowNodeIds)
        ? Object.fromEntries(
            Object.entries(saved.workflowNodeIds).filter(
              ([index, nodeId]) =>
                /^\d+$/.test(index) && typeof nodeId === "string",
            ),
          )
        : {},
    nodeSignature:
      typeof saved.nodeSignature === "string" ? saved.nodeSignature : "",
  };
}

export function getWorkflowEditorState(workflowEditor, graphKey) {
  workflowEditor[graphKey] ||= {
    selectedNodeId: "",
    selectedEdgeId: "",
    connectingFrom: null,
    pointerMode: "",
    pointerStart: null,
    spacePressed: false,
  };
  return workflowEditor[graphKey];
}

export function saveWorkflowGraphLayout(settings, graphKey, layout, scheduleSave) {
  if (
    !settings.eventWorkflowGraphs ||
    typeof settings.eventWorkflowGraphs !== "object" ||
    Array.isArray(settings.eventWorkflowGraphs)
  ) {
    settings.eventWorkflowGraphs = {};
  }
  settings.eventWorkflowGraphs[graphKey] = layout;
  scheduleSave();
}
