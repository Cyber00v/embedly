// @ts-nocheck

// Validates persisted graph layout and provides its transient editor state.

const MIN_GRAPH_COORD = 0;
const MAX_GRAPH_COORD = 50000;
const MIN_PAN_OFFSET = -50000;
const MAX_PAN_OFFSET = 50000;
const MIN_GRAPH_ZOOM = 0.15;
const MAX_GRAPH_ZOOM = 1.5;
const DEFAULT_GRAPH_ZOOM = 1;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeGraphPositions(rawPositions, clampNumber) {
  if (!isPlainObject(rawPositions)) return {};

  return Object.fromEntries(
    Object.entries(rawPositions)
      .filter(
        ([nodeId, position]) =>
          typeof nodeId === "string" &&
          isPlainObject(position) &&
          Number.isFinite(position.x) &&
          Number.isFinite(position.y),
      )
      .map(([nodeId, position]) => [
        nodeId,
        {
          x: clampNumber(position.x, MIN_GRAPH_COORD, MAX_GRAPH_COORD, 0),
          y: clampNumber(position.y, MIN_GRAPH_COORD, MAX_GRAPH_COORD, 0),
        },
      ]),
  );
}

function normalizeSequenceEdges(rawEdges, createWorkflowEdge) {
  if (!Array.isArray(rawEdges)) return [];

  // Only sequence edges are persisted here; branch and token links are derived from the action model.
  return rawEdges
    .filter(
      (edge) =>
        isPlainObject(edge) &&
        edge.kind === "sequence" &&
        typeof edge.from === "string" &&
        typeof edge.to === "string",
    )
    .map((edge) => createWorkflowEdge(edge.from, edge.to, "sequence"));
}

function normalizeWorkflowNodeIds(rawNodeIds) {
  if (!isPlainObject(rawNodeIds)) return {};

  return Object.fromEntries(
    Object.entries(rawNodeIds).filter(
      ([index, nodeId]) => /^\d+$/.test(index) && typeof nodeId === "string",
    ),
  );
}

function migrateLegacyTokenConnections(savedLayouts, graphKey, onMigrate) {
  const entry = isPlainObject(savedLayouts) ? savedLayouts[graphKey] : null;
  if (isPlainObject(entry) && Object.hasOwn(entry, "tokenConnections")) {
    // Older layouts stored token links separately; token connections now live in graph edges.
    delete entry.tokenConnections;
    onMigrate();
  }
}

export function getWorkflowGraphLayout(
  savedLayouts,
  graphKey,
  { clampNumber, createWorkflowEdge, onMigrate },
) {
  const saved =
    isPlainObject(savedLayouts) && isPlainObject(savedLayouts[graphKey])
      ? savedLayouts[graphKey]
      : {};

  const positions = normalizeGraphPositions(saved.positions, clampNumber);
  const edges = normalizeSequenceEdges(saved.edges, createWorkflowEdge);
  migrateLegacyTokenConnections(savedLayouts, graphKey, onMigrate);

  return {
    positions,
    edges,
    zoom: clampNumber(
      saved.zoom,
      MIN_GRAPH_ZOOM,
      MAX_GRAPH_ZOOM,
      DEFAULT_GRAPH_ZOOM,
    ),
    panX: clampNumber(saved.panX, MIN_PAN_OFFSET, MAX_PAN_OFFSET, 0),
    panY: clampNumber(saved.panY, MIN_PAN_OFFSET, MAX_PAN_OFFSET, 0),
    minimapOpen: saved.minimapOpen === true,
    hiddenTokenIds: Array.isArray(saved.hiddenTokenIds)
      ? saved.hiddenTokenIds.filter((tokenId) => typeof tokenId === "string")
      : [],
    workflowNodeIds: normalizeWorkflowNodeIds(saved.workflowNodeIds),
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
  if (!isPlainObject(settings.eventWorkflowGraphs)) {
    settings.eventWorkflowGraphs = {};
  }
  settings.eventWorkflowGraphs[graphKey] = layout;
  scheduleSave();
}