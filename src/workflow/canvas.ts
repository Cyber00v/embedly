// @ts-nocheck

// Draws workflow connection paths and the compact node overview.

const MIN_BEZIER_CURVE = 42;
const MINIMAP_WIDTH = 170;
const MINIMAP_HEIGHT = 86;
const MIN_MINIMAP_NODE_WIDTH = 5;
const MIN_MINIMAP_NODE_HEIGHT = 4;

function computeEdgeBezierPath(source, target, stageRect, zoom) {
  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const x1 = (sourceRect.left + sourceRect.width / 2 - stageRect.left) / zoom;
  const y1 = (sourceRect.top + sourceRect.height / 2 - stageRect.top) / zoom;
  const x2 = (targetRect.left + targetRect.width / 2 - stageRect.left) / zoom;
  const y2 = (targetRect.top + targetRect.height / 2 - stageRect.top) / zoom;
  const curve = Math.max(MIN_BEZIER_CURVE, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
}

function buildEdgePathsMarkup(edge, path, escapeHtml) {
  const kindClass = `workflow-edge-${escapeHtml(edge.kind)}`;
  const visiblePath = `<path class="workflow-edge-visible ${kindClass}" d="${path}"></path>`;
  // Keep an invisible, focusable path above the visible stroke for reliable edge selection.
  const hitPath = `<path class="workflow-edge-path ${kindClass}" d="${path}" data-workflow-edge-id="${escapeHtml(edge.id)}" tabindex="0" role="button" aria-label="${escapeHtml(edge.label || "Workflow connection")}"></path>`;
  return { visiblePath, hitPath };
}

function bindEdgeSelectionHandlers(svg, getEditorState) {
  const edgeElements = [...svg.querySelectorAll("[data-workflow-edge-id]")];
  edgeElements.forEach((path) => {
    path.addEventListener("click", () => {
      const graphState = getEditorState(svg.dataset.workflowGraph);
      graphState.selectedEdgeId = path.dataset.workflowEdgeId;
      graphState.selectedNodeId = "";
      path.focus({ preventScroll: true });
      edgeElements.forEach((edge) =>
        edge.classList.toggle(
          "is-selected",
          edge.dataset.workflowEdgeId === graphState.selectedEdgeId,
        ),
      );
    });
  });
}

export function renderWorkflowEdges(
  stage,
  svg,
  layout,
  zoom,
  { getEditorState, escapeHtml },
) {
  const stageRect = stage.getBoundingClientRect();
  const visiblePaths = [];
  const hitPaths = [];

  layout.edges.forEach((edge) => {
    const sourcePortKey = CSS.escape(edge.fromPort || edge.from);
    const targetPortKey = CSS.escape(edge.toPort || edge.to);
    const source = stage.querySelector(`[data-workflow-port-id="${sourcePortKey}"]`);
    const target = stage.querySelector(`[data-workflow-port-id="${targetPortKey}"]`);
    if (!source || !target) return;

    const path = computeEdgeBezierPath(source, target, stageRect, zoom);
    const { visiblePath, hitPath } = buildEdgePathsMarkup(edge, path, escapeHtml);
    visiblePaths.push(visiblePath);
    hitPaths.push(hitPath);
  });

  svg.innerHTML = `${visiblePaths.join("")}${hitPaths.join("")}`;
  bindEdgeSelectionHandlers(svg, getEditorState);
}

function readNodeCoordinate(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function renderMinimapNodeMarkup(node, maxX, maxY) {
  const x = readNodeCoordinate(node.style.left, node.offsetLeft);
  const y = readNodeCoordinate(node.style.top, node.offsetTop);
  const left = (x / maxX) * MINIMAP_WIDTH;
  const top = (y / maxY) * MINIMAP_HEIGHT;
  const width = Math.max(
    MIN_MINIMAP_NODE_WIDTH,
    (node.offsetWidth / maxX) * MINIMAP_WIDTH,
  );
  const height = Math.max(
    MIN_MINIMAP_NODE_HEIGHT,
    (node.offsetHeight / maxY) * MINIMAP_HEIGHT,
  );
  const triggerClass = node.classList.contains("workflow-trigger-node")
    ? " is-trigger"
    : "";

  return `<span class="workflow-minimap-node${triggerClass}" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px"></span>`;
}

export function renderWorkflowMinimap(minimap, nodeLayer, layout, graphKey) {
  if (!minimap) return;
  const nodes = [...nodeLayer.children];

  const maxX = Math.max(
    1,
    ...nodes.map(
      (node) =>
        readNodeCoordinate(node.style.left, node.offsetLeft) + node.offsetWidth,
    ),
  );
  const maxY = Math.max(
    1,
    ...nodes.map(
      (node) =>
        readNodeCoordinate(node.style.top, node.offsetTop) + node.offsetHeight,
    ),
  );

  minimap.dataset.workflowGraph = graphKey;
  // Scale nodes relative to the graph bounds so their relative positions remain recognizable.
  minimap.innerHTML = nodes
    .map((node) => renderMinimapNodeMarkup(node, maxX, maxY))
    .join("");
  minimap.hidden = !layout.minimapOpen;
}