// @ts-nocheck

// Handles workflow-canvas gestures, node connections, selection, and graph persistence.
import {
  getWorkflowBranchActions,
  setWorkflowBranchActions,
} from "./graph.ts";

const MIN_CANVAS_ZOOM = 0.15;
const MAX_CANVAS_ZOOM = 1.5;
const MAX_FIT_ZOOM = 1.2;
const ZOOM_STEP_BUTTON = 0.1;
const ZOOM_STEP_WHEEL = 0.08;
const MAX_CANVAS_COORD = 50000;
const MIN_CANVAS_COORD = -50000;

function readNodePosition(node) {
  const x = Number.parseFloat(node.style.left);
  const y = Number.parseFloat(node.style.top);
  return {
    x: Number.isFinite(x) ? x : node.offsetLeft,
    y: Number.isFinite(y) ? y : node.offsetTop,
  };
}

export function attachWorkflowCanvasInteractions({
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
  globalActionId = "",
  onSelectNode = () => { },
}, dependencies) {
  const {
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
  } = dependencies;

  const activeTouches = new Map();

  const resolveHandlerEvent = (handler) =>
    appLoad ? "load" : globalActionId ? "global" : handler.event || "click";

  const updateZoomLabel = () => {
    const label = toolbar.querySelector(".workflow-zoom-label");
    if (label) {
      label.textContent = `${Math.round(layout.zoom * 100)}%`;
    }
  };

  const draw = () => {
    stage.style.transform = `translate(${layout.panX}px, ${layout.panY}px) scale(${layout.zoom})`;
    viewport.style.setProperty("--workflow-zoom", String(layout.zoom));
    renderWorkflowEdges(stage, svg, layout, layout.zoom);
    renderWorkflowMinimap(
      minimap,
      stage.querySelector(".workflow-node-layer"),
      layout,
      graphKey,
    );
  };

  const persistAndDraw = () => {
    draw();
    saveWorkflowGraphLayout(graphKey, layout);
  };

  const fitView = () => {
    const nodes = [...stage.querySelector(".workflow-node-layer").children];
    if (!nodes.length) return;

    const coords = nodes.map((node) => ({
      node,
      ...readNodePosition(node),
    }));
    const minX = Math.min(...coords.map((item) => item.x));
    const minY = Math.min(...coords.map((item) => item.y));
    const maxX = Math.max(...coords.map((item) => item.x + item.node.offsetWidth));
    const maxY = Math.max(
      ...coords.map((item) => item.y + item.node.offsetHeight),
    );

    const fitScaleX = (viewport.clientWidth - 48) / (maxX - minX + 80);
    const fitScaleY = (viewport.clientHeight - 48) / (maxY - minY + 80);
    layout.zoom = Math.max(
      MIN_CANVAS_ZOOM,
      Math.min(MAX_FIT_ZOOM, fitScaleX, fitScaleY),
    );
    layout.panX = 24 - minX * layout.zoom;
    layout.panY = 24 - minY * layout.zoom;
    updateZoomLabel();
    persistAndDraw();
  };

  const nodeLayerSelect = (node) => {
    nodeLayer.querySelectorAll(".is-selected").forEach((item) => {
      item.classList.remove("is-selected");
    });
    node.classList.add("is-selected");
  };

  const triggerIdsForGraph = () =>
    new Set(
      [...container.querySelectorAll(".workflow-trigger-node")].map(
        (node) => node.dataset.workflowNodeId,
      ),
    );

  const startPanGesture = (event) => {
    editorState.pointerMode = "pan";
    editorState.pointerStart = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: layout.panX,
      panY: layout.panY,
    };
    viewport.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const tryStartPinchGesture = (event) => {
    if (event.pointerType !== "touch") return false;
    activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activeTouches.size < 2) return false;

    const [first, second] = [...activeTouches.values()];
    const rect = viewport.getBoundingClientRect();
    const midpointX = (first.x + second.x) / 2 - rect.left;
    const midpointY = (first.y + second.y) / 2 - rect.top;

    editorState.pointerMode = "pinch";
    editorState.pointerStart = {
      initialDistance: Math.max(
        1,
        Math.hypot(second.x - first.x, second.y - first.y),
      ),
      initialZoom: layout.zoom,
      graphX: (midpointX - layout.panX) / layout.zoom,
      graphY: (midpointY - layout.panY) / layout.zoom,
    };
    editorState.connectingFrom = null;
    viewport.setPointerCapture(event.pointerId);
    event.preventDefault();
    return true;
  };

  const updatePinchGesture = () => {
    if (activeTouches.size < 2 || !editorState.pointerStart) return;
    const [first, second] = [...activeTouches.values()];
    const rect = viewport.getBoundingClientRect();
    const midpointX = (first.x + second.x) / 2 - rect.left;
    const midpointY = (first.y + second.y) / 2 - rect.top;
    const distance = Math.max(
      1,
      Math.hypot(second.x - first.x, second.y - first.y),
    );

    layout.zoom = clampNumber(
      editorState.pointerStart.initialZoom *
      (distance / editorState.pointerStart.initialDistance),
      MIN_CANVAS_ZOOM,
      MAX_CANVAS_ZOOM,
      layout.zoom,
    );
    // Keep the graph point beneath the moving touch midpoint stationary during a pinch.
    layout.panX = midpointX - editorState.pointerStart.graphX * layout.zoom;
    layout.panY = midpointY - editorState.pointerStart.graphY * layout.zoom;
    updateZoomLabel();
    draw();
  };

  const connectBranchTarget = (
    source,
    sourceNode,
    sourceBranch,
    targetNode,
    targetHandle,
  ) => {
    if (
      (!sourceBranch &&
        !["branch-action", "branch-root"].includes(sourceNode?.kind)) ||
      targetHandle.dataset.workflowHandle !== "in"
    ) {
      return;
    }
    if (
      !targetNode ||
      !["action", "branch-action", "nested-condition"].includes(targetNode.kind)
    ) {
      return;
    }

    const branch = sourceBranch || sourceNode.branch;
    const conditionId =
      sourceNode.kind === "action" || sourceNode.kind === "nested-condition"
        ? sourceNode.id
        : sourceNode.parentConditionId;

    if (source.branch && source.branch !== branch) return;
    if (
      targetNode.kind === "branch-action" &&
      (targetHandle.dataset.workflowBranch !== branch ||
        targetHandle.dataset.workflowParentConditionId !== conditionId ||
        targetNode.parentConditionId !== conditionId ||
        targetNode.branch !== branch)
    ) {
      return;
    }
    if (
      targetNode.kind === "nested-condition" &&
      (targetNode.parentConditionId !== conditionId ||
        targetNode.branch !== branch)
    ) {
      return;
    }

    const condition = workflowNodes.find(
      (node) => node.id === conditionId && isWorkflowBranchAction(node.action),
    );
    if (!condition) return;

    const actions = getWorkflowBranchActions(condition.action, branch).slice();

    if (targetNode.kind === "action") {
      if (targetNode.event !== condition.event) return;
      const targetHandlerIndex = handlers.findIndex(
        (handler) => handler.workflowId === targetNode.action.workflowId,
      );
      if (targetHandlerIndex < 0) return;

      const [targetAction] = handlers.splice(targetHandlerIndex, 1);
      const insertionIndex =
        sourceNode?.kind === "branch-action"
          ? actions.findIndex(
            (action) => action.workflowId === sourceNode.action.workflowId,
          ) + 1
          : 0;
      actions.splice(Math.max(0, insertionIndex), 0, targetAction);
      setWorkflowBranchActions(condition.action, branch, actions);
      writeWorkflowActions(handlers, appLoad, globalActionId);
      return;
    }

    const targetIndex = actions.findIndex(
      (action) => action.workflowId === targetNode.action.workflowId,
    );
    if (targetIndex < 0) return;

    if (sourceBranch) {
      const [targetAction] = actions.splice(targetIndex, 1);
      actions.unshift(targetAction);
    } else {
      if (sourceNode.id === targetNode.id) return;
      const sourceIndex = actions.findIndex(
        (action) => action.workflowId === sourceNode.action.workflowId,
      );
      if (sourceIndex < 0) return;
      const [moved] = actions.splice(sourceIndex, 1);
      const nextTargetIndex = actions.findIndex(
        (action) => action.workflowId === targetNode.action.workflowId,
      );
      actions.splice(nextTargetIndex, 0, moved);
    }

    setWorkflowBranchActions(condition.action, branch, actions);
    writeWorkflowActions(handlers, appLoad, globalActionId);
  };

  const connectSequenceTarget = (source, sourceNode, targetNode) => {
    if (!sourceNode || sourceNode.kind !== "action") {
      if (
        !triggerIdsForGraph().has(source.nodeId) ||
        !targetNode ||
        source.nodeId !== `trigger:${graphKey}:${targetNode.event}`
      ) {
        return;
      }
    } else if (
      !targetNode ||
      targetNode.kind !== "action" ||
      sourceNode.event !== targetNode.event
    ) {
      return;
    }

    const eventName = sourceNode?.event || targetNode?.event;
    const group = handlers.filter(
      (handler) => resolveHandlerEvent(handler) === eventName,
    );
    const fromId = sourceNode?.id || source.nodeId;
    const toId = targetNode?.id;
    if (!toId || fromId === toId) return;

    const ordered = group.slice();
    const sourceIndex = ordered.findIndex(
      (handler) => `action:${handler.workflowId}` === fromId,
    );
    const targetIndex = ordered.findIndex(
      (handler) => `action:${handler.workflowId}` === toId,
    );

    if (sourceIndex >= 0 && targetIndex >= 0) {
      const targetAction = ordered[targetIndex];
      const [moved] = ordered.splice(sourceIndex, 1);
      ordered.splice(ordered.indexOf(targetAction), 0, moved);
    } else if (sourceNode?.kind === "trigger" || !sourceNode) {
      const [moved] = ordered.splice(targetIndex, 1);
      ordered.unshift(moved);
    } else {
      return;
    }

    const orderedIds = new Set(ordered.map((handler) => handler.workflowId));
    const result = [];
    let cursor = 0;
    handlers.forEach((handler) => {
      if (orderedIds.has(handler.workflowId)) {
        result.push(ordered[cursor++]);
      } else {
        result.push(handler);
      }
    });

    const currentNodes = result.map((handler) => ({
      id: `action:${handler.workflowId}`,
      kind: "action",
      event: resolveHandlerEvent(handler),
      action: handler,
    }));

    const edges = [];
    const eventGroups = new Map();
    currentNodes.forEach((node) => {
      if (!eventGroups.has(node.event)) eventGroups.set(node.event, []);
      eventGroups.get(node.event).push(node);
    });

    eventGroups.forEach((nodes, event) => {
      const trigger = `trigger:${graphKey}:${event}`;
      edges.push(createWorkflowEdge(trigger, nodes[0].id));
      nodes.slice(1).forEach((node, index) => {
        edges.push(createWorkflowEdge(nodes[index].id, node.id));
      });
    });

    const triggerNodes = [...eventGroups.keys()].map((event) => ({
      id: `trigger:${graphKey}:${event}`,
      kind: "trigger",
      event,
    }));

    const serialized = serializeWorkflowGraph(
      [
        ...triggerNodes,
        ...currentNodes,
        ...workflowNodes.filter((node) => node.kind === "branch-action"),
      ],
      [...edges, ...layout.edges.filter((edge) => edge.kind === "branch")],
    );

    layout.edges = edges;
    layout.nodeSignature = currentNodes
      .map((node) => `${node.id}:${node.event}`)
      .join("|");
    layout.positions = Object.fromEntries(
      [...nodeLayer.children].map((node) => [
        node.dataset.workflowNodeId,
        readNodePosition(node),
      ]),
    );
    writeWorkflowActions(serialized, appLoad, globalActionId);
  };

  const finishConnection = (targetHandle) => {
    const source = editorState.connectingFrom;
    editorState.connectingFrom = null;
    editorState.pointerMode = "";
    if (!source) return;

    const sourceNode = workflowNodes.find((node) => node.id === source.nodeId);
    const targetNode = workflowNodes.find(
      (node) => node.id === targetHandle.dataset.workflowNodeId,
    );
    const sourceBranch =
      sourceNode?.kind === "branch-root"
        ? sourceNode.branch
        : ["action", "nested-condition"].includes(sourceNode?.kind) &&
            isWorkflowBranchAction(sourceNode.action) &&
            source.portId.startsWith(`${sourceNode.id}:`)
          ? source.branch || source.portId.slice(sourceNode.id.length + 1)
          : "";

    // Branch connections must stay within their owning condition and selected outcome.
    if (
      sourceBranch ||
      sourceNode?.kind === "branch-action" ||
      sourceNode?.kind === "nested-condition" ||
      targetNode?.kind === "branch-action"
    ) {
      connectBranchTarget(
        source,
        sourceNode,
        sourceBranch,
        targetNode,
        targetHandle,
      );
      return;
    }

    connectSequenceTarget(source, sourceNode, targetNode);
  };

  const handleDeleteSelection = (event) => {
    if (event.target.closest("input, textarea, select")) return;

    if (editorState.selectedNodeId?.startsWith("action:")) {
      const index = handlers.findIndex(
        (handler) => `action:${handler.workflowId}` === editorState.selectedNodeId,
      );
      if (index >= 0) deleteWorkflowAction(index, appLoad, globalActionId);
    } else if (
      editorState.selectedNodeId?.startsWith("branch-action:") ||
      editorState.selectedNodeId?.startsWith("nested-condition:")
    ) {
      const branchNode = workflowNodes.find(
        (node) =>
          ["branch-action", "nested-condition"].includes(node.kind) &&
          node.id === editorState.selectedNodeId,
      );
      const condition = workflowNodes.find(
        (node) => node.id === branchNode?.parentConditionId,
      );
      if (branchNode && condition) {
        setWorkflowBranchActions(
          condition.action,
          branchNode.branch,
          getWorkflowBranchActions(condition.action, branchNode.branch).filter(
            (action) => action.workflowId !== branchNode.action.workflowId,
          ),
        );
        writeWorkflowActions(handlers, appLoad, globalActionId);
      }
    } else if (editorState.selectedNodeId?.startsWith("branch:")) {
      event.preventDefault();
      event.stopPropagation();
      return;
    } else if (editorState.selectedNodeId?.startsWith("trigger:")) {
      const trigger = nodeLayer.querySelector(
        `[data-workflow-node-id="${CSS.escape(editorState.selectedNodeId)}"]`,
      );
      const eventName = trigger?.dataset.workflowEventName;
      if (eventName) {
        writeWorkflowActions(
          handlers.filter(
            (handler) => resolveHandlerEvent(handler) !== eventName,
          ),
          appLoad,
          globalActionId,
        );
      }
    } else if (editorState.selectedNodeId) {
      layout.hiddenTokenIds ||= [];
      if (!layout.hiddenTokenIds.includes(editorState.selectedNodeId)) {
        layout.hiddenTokenIds.push(editorState.selectedNodeId);
      }
      editorState.selectedNodeId = "";
      writeWorkflowActions(handlers, appLoad, globalActionId);
    } else if (editorState.selectedEdgeId) {
      const edge = layout.edges.find(
        (item) => item.id === editorState.selectedEdgeId,
      );
      if (edge) {
        layout.edges = layout.edges.filter((item) => item !== edge);
      }
      editorState.selectedEdgeId = "";
      draw();
      const triggers = [
        ...container.querySelectorAll(".workflow-trigger-node"),
      ].map((node) => ({
        id: node.dataset.workflowNodeId,
        kind: "trigger",
        event: node.dataset.workflowEventName,
      }));
      writeWorkflowActions(
        serializeWorkflowGraph([...triggers, ...workflowNodes], layout.edges),
        appLoad,
        globalActionId,
      );
    }

    event.preventDefault();
    event.stopPropagation();
  };

  toolbar.addEventListener("click", (event) => {
    const button = event.target.closest(
      "[data-workflow-zoom], [data-workflow-fit], [data-workflow-minimap], [data-workflow-expand]",
    );
    if (!button) return;

    if (button.hasAttribute("data-workflow-fit")) {
      fitView();
      return;
    }
    if (button.hasAttribute("data-workflow-minimap")) {
      layout.minimapOpen = !layout.minimapOpen;
      minimap.hidden = !layout.minimapOpen;
      saveWorkflowGraphLayout(graphKey, layout);
      return;
    }
    if (button.hasAttribute("data-workflow-expand")) {
      container.classList.toggle("is-expanded");
      button.textContent = container.classList.contains("is-expanded")
        ? localize.Close[editorLanguage]
        : localize.Expand[editorLanguage];
      requestAnimationFrame(draw);
      return;
    }

    const delta =
      button.dataset.workflowZoom === "in"
        ? ZOOM_STEP_BUTTON
        : -ZOOM_STEP_BUTTON;
    layout.zoom = clampNumber(
      layout.zoom + delta,
      MIN_CANVAS_ZOOM,
      MAX_CANVAS_ZOOM,
      layout.zoom,
    );
    updateZoomLabel();
    persistAndDraw();
  });

  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const previousZoom = layout.zoom;
      const step = event.deltaY < 0 ? ZOOM_STEP_WHEEL : -ZOOM_STEP_WHEEL;
      layout.zoom = clampNumber(
        previousZoom + step,
        MIN_CANVAS_ZOOM,
        MAX_CANVAS_ZOOM,
        previousZoom,
      );
      const rect = viewport.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const factor = layout.zoom / previousZoom;
      // Adjust the pan by the zoom delta so the graph point under the pointer stays fixed.
      layout.panX = pointerX - (pointerX - layout.panX) * factor;
      layout.panY = pointerY - (pointerY - layout.panY) * factor;
      updateZoomLabel();
    } else {
      layout.panX -= event.deltaX;
      layout.panY -= event.deltaY;
    }
    persistAndDraw();
  });

  viewport.addEventListener("pointerdown", (event) => {
    if (tryStartPinchGesture(event)) return;

    const handle = event.target.closest("[data-workflow-handle]");
    if (handle?.dataset.workflowHandle === "out") {
      editorState.connectingFrom = {
        nodeId: handle.dataset.workflowNodeId,
        portId: handle.dataset.workflowPortId || handle.dataset.workflowNodeId,
        branch: handle.dataset.workflowBranch || "",
      };
      editorState.pointerMode = "connect";
      viewport.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }

    if (editorState.pointerMode === "pinch") return;

    if (editorState.connectingFrom) {
      const connectionTarget = event.target.closest(
        '[data-workflow-handle="in"]',
      );
      if (connectionTarget) {
        finishConnection(connectionTarget);
        event.preventDefault();
      }
      return;
    }

    const node = event.target.closest(".workflow-node, .workflow-token-node");
    const interactiveControl = event.target.closest(
      "button, input, select, textarea, [contenteditable='true']",
    );

    if (!node || (editorState.spacePressed && !interactiveControl)) {
      startPanGesture(event);
      return;
    }

    if (!interactiveControl) {
      const { x, y } = readNodePosition(node);
      editorState.pointerMode = "node";
      editorState.pointerStart = {
        pointerId: event.pointerId,
        node,
        startX: event.clientX,
        startY: event.clientY,
        left: x,
        top: y,
      };
      editorState.selectedNodeId = node.dataset.workflowNodeId;
      editorState.selectedEdgeId = "";
      nodeLayerSelect(node);
      onSelectNode(node);
      node.focus({ preventScroll: true });
      viewport.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  });

  viewport.addEventListener("pointermove", (event) => {
    if (activeTouches.has(event.pointerId)) {
      activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (editorState.pointerMode === "pinch") {
      updatePinchGesture();
      return;
    }
    if (!editorState.pointerStart) return;

    const deltaX = (event.clientX - editorState.pointerStart.startX) / layout.zoom;
    const deltaY = (event.clientY - editorState.pointerStart.startY) / layout.zoom;

    if (editorState.pointerMode === "node") {
      const { node, left, top } = editorState.pointerStart;
      const nextX = clampNumber(
        left + deltaX,
        MIN_CANVAS_COORD,
        MAX_CANVAS_COORD,
        left,
      );
      const nextY = clampNumber(
        top + deltaY,
        MIN_CANVAS_COORD,
        MAX_CANVAS_COORD,
        top,
      );
      node.style.left = `${nextX}px`;
      node.style.top = `${nextY}px`;
      layout.positions[node.dataset.workflowNodeId] = { x: nextX, y: nextY };
      draw();
    } else if (editorState.pointerMode === "pan") {
      layout.panX =
        editorState.pointerStart.panX +
        event.clientX -
        editorState.pointerStart.startX;
      layout.panY =
        editorState.pointerStart.panY +
        event.clientY -
        editorState.pointerStart.startY;
      draw();
    }
  });

  const finishPointerGesture = (event) => {
    if (activeTouches.has(event.pointerId)) {
      activeTouches.delete(event.pointerId);
      if (editorState.pointerMode === "pinch") {
        editorState.pointerMode = "";
        editorState.pointerStart = null;
        saveWorkflowGraphLayout(graphKey, layout);
        return;
      }
    }

    if (editorState.pointerMode === "connect") {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const inputTarget = target?.closest('[data-workflow-handle="in"]');
      if (inputTarget) {
        finishConnection(inputTarget);
      } else {
        editorState.connectingFrom = null;
        editorState.pointerMode = "";
      }
    } else if (
      editorState.pointerMode === "node" ||
      editorState.pointerMode === "pan"
    ) {
      editorState.pointerMode = "";
      editorState.pointerStart = null;
      saveWorkflowGraphLayout(graphKey, layout);
    }
  };

  viewport.addEventListener("pointerup", finishPointerGesture);
  viewport.addEventListener("pointercancel", finishPointerGesture);

  viewport.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && container.classList.contains("is-expanded")) {
      container.classList.remove("is-expanded");
      const expandButton = toolbar.querySelector("[data-workflow-expand]");
      if (expandButton) {
        expandButton.textContent = localize.Expand[editorLanguage];
      }
      requestAnimationFrame(draw);
      event.preventDefault();
      return;
    }
    if (
      event.code === "Space" &&
      !event.target.closest("input, textarea, select")
    ) {
      editorState.spacePressed = true;
      event.preventDefault();
    }
    if (["Delete", "Backspace"].includes(event.key)) {
      handleDeleteSelection(event);
    }
  });

  viewport.addEventListener("keyup", (event) => {
    if (event.code === "Space") editorState.spacePressed = false;
  });

  viewport.addEventListener("click", (event) => {
    const node = event.target.closest(".workflow-node, .workflow-token-node");
    if (!node) return;
    editorState.selectedNodeId = node.dataset.workflowNodeId;
    editorState.selectedEdgeId = "";
    nodeLayerSelect(node);
    onSelectNode(node);
    if (!event.target.closest("input, select, textarea, button")) {
      node.focus({ preventScroll: true });
    }
  });

  minimap.addEventListener("click", (event) => {
    const rect = minimap.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    layout.panX =
      -x * stage.offsetWidth * layout.zoom + viewport.clientWidth / 2;
    layout.panY =
      -y * stage.offsetHeight * layout.zoom + viewport.clientHeight / 2;
    persistAndDraw();
  });

  draw();
}