// @ts-nocheck

// Draws workflow connection paths and the compact node overview.
 
export function renderWorkflowEdges(
  stage,
  svg,
  layout,
  zoom,
  { getEditorState, escapeHtml },
) {
  const stageRect = stage.getBoundingClientRect();
  const edgeMarkup = [];
  const paths = [];
  layout.edges.forEach((edge) => {
    const source = stage.querySelector(
      `[data-workflow-port-id="${CSS.escape(edge.fromPort || edge.from)}"]`,
    );
    const target = stage.querySelector(
      `[data-workflow-port-id="${CSS.escape(edge.toPort || edge.to)}"]`,
    );
    if (!source || !target) return;
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const x1 =
      (sourceRect.left + sourceRect.width / 2 - stageRect.left) / zoom;
    const y1 =
      (sourceRect.top + sourceRect.height / 2 - stageRect.top) / zoom;
    const x2 =
      (targetRect.left + targetRect.width / 2 - stageRect.left) / zoom;
    const y2 =
      (targetRect.top + targetRect.height / 2 - stageRect.top) / zoom;
    const curve = Math.max(42, Math.abs(x2 - x1) / 2);
    const path = `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
    // Keep an invisible, focusable path above the visible stroke for reliable edge selection.
    paths.push(
      `<path class="workflow-edge-path workflow-edge-${edge.kind}" d="${path}" data-workflow-edge-id="${escapeHtml(edge.id)}" tabindex="0" role="button" aria-label="${escapeHtml(edge.label || "Workflow connection")}"></path>`,
    );
    edgeMarkup.push(
      `<path class="workflow-edge-visible workflow-edge-${edge.kind}" d="${path}"></path>`,
    );
  });
  svg.innerHTML = `${edgeMarkup.join("")}${paths.join("")}`;
  svg.querySelectorAll("[data-workflow-edge-id]").forEach((path) => {
    path.addEventListener("click", () => {
      const graphState = getEditorState(svg.dataset.workflowGraph);
      graphState.selectedEdgeId = path.dataset.workflowEdgeId;
      graphState.selectedNodeId = "";
      path.focus({ preventScroll: true });
      svg
        .querySelectorAll("[data-workflow-edge-id]")
        .forEach((edge) =>
          edge.classList.toggle(
            "is-selected",
            edge.dataset.workflowEdgeId === graphState.selectedEdgeId,
          ),
        );
    });
  });
}

export function renderWorkflowMinimap(minimap, nodeLayer, layout, graphKey) {
  if (!minimap) return;
  const nodes = [...nodeLayer.children];
  const maxX = Math.max(
    1,
    ...nodes.map(
      (node) => Number.parseFloat(node.style.left) + node.offsetWidth,
    ),
  );
  const maxY = Math.max(
    1,
    ...nodes.map(
      (node) => Number.parseFloat(node.style.top) + node.offsetHeight,
    ),
  );
  minimap.dataset.workflowGraph = graphKey;
  // Scale nodes relative to the graph bounds so their relative positions remain recognizable.
  minimap.innerHTML = nodes
    .map((node) => {
      const left = (Number.parseFloat(node.style.left) / maxX) * 170;
      const top = (Number.parseFloat(node.style.top) / maxY) * 86;
      const width = Math.max(5, (node.offsetWidth / maxX) * 170);
      const height = Math.max(4, (node.offsetHeight / maxY) * 86);
      return `<span class="workflow-minimap-node ${node.classList.contains("workflow-trigger-node") ? "is-trigger" : ""}" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px"></span>`;
    })
    .join("");
  minimap.hidden = !layout.minimapOpen;
}
