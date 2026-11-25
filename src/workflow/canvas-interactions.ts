// @ts-nocheck

// Handles workflow-canvas gestures, node connections, selection, and graph persistence.
import {
  getWorkflowBranchActions,
  setWorkflowBranchActions,
} from "./graph.ts";

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
  onSelectNode = () => {},
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
  const draw = () => {
    stage.style.transform = `translate(${layout.panX}px, ${layout.panY}px) scale(${layout.zoom})`;
    viewport.style.setProperty("--workflow-zoom", String(layout.zoom));
    renderWorkflowEdges(
      stage,
      svg,
      layout,
      layout.zoom,
    );
    renderWorkflowMinimap(minimap, stage.querySelector(".workflow-node-layer"), layout, graphKey);
  };
  const fitView = () => {
    const nodes = [...stage.querySelector(".workflow-node-layer").children];
    if (!nodes.length) return;
    const minX = Math.min(...nodes.map((node) => Number.parseFloat(node.style.left)));
    const minY = Math.min(...nodes.map((node) => Number.parseFloat(node.style.top)));
    const maxX = Math.max(
      ...nodes.map(
        (node) => Number.parseFloat(node.style.left) + node.offsetWidth,
      ),
    );
    const maxY = Math.max(
      ...nodes.map(
        (node) => Number.parseFloat(node.style.top) + node.offsetHeight,
      ),
    );
    layout.zoom = Math.max(
      0.15,
      Math.min(
        1.2,
        (viewport.clientWidth - 48) / (maxX - minX + 80),
        (viewport.clientHeight - 48) / (maxY - minY + 80),
      ),
    );
    layout.panX = 24 - minX * layout.zoom;
    layout.panY = 24 - minY * layout.zoom;
    toolbar.querySelector(".workflow-zoom-label").textContent =
      `${Math.round(layout.zoom * 100)}%`;
    draw();
    saveWorkflowGraphLayout(graphKey, layout);
  };
  const activeTouches = new Map();
  const updateZoomLabel = () => {
    toolbar.querySelector(".workflow-zoom-label").textContent =
      `${Math.round(layout.zoom * 100)}%`;
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
    layout.zoom = Math.max(
      0.15,
      Math.min(
        1.5,
        layout.zoom + (button.dataset.workflowZoom === "in" ? 0.1 : -0.1),
      ),
    );
    toolbar.querySelector(".workflow-zoom-label").textContent =
      `${Math.round(layout.zoom * 100)}%`;
    draw();
    saveWorkflowGraphLayout(graphKey, layout);
  });
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const previousZoom = layout.zoom;
      layout.zoom = Math.max(
        0.15,
        Math.min(1.5, previousZoom + (event.deltaY < 0 ? 0.08 : -0.08)),
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
    draw();
    saveWorkflowGraphLayout(graphKey, layout);
  });
  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") {
      activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activeTouches.size >= 2) {
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
        return;
      }
    }
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
    if (editorState.spacePressed && !interactiveControl) {
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
      return;
    }
    if (!node) {
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
      return;
    }
    if (node && !interactiveControl) {
      editorState.pointerMode = "node";
      editorState.pointerStart = {
        pointerId: event.pointerId,
        node,
        startX: event.clientX,
        startY: event.clientY,
        left: Number.parseFloat(node.style.left),
        top: Number.parseFloat(node.style.top),
      };
      editorState.selectedNodeId = node.dataset.workflowNodeId;
      editorState.selectedEdgeId = "";
      nodeLayerSelect(node);
      onSelectNode(node);
      node.focus({ preventScroll: true });
      viewport.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (editorState.spacePressed && !node) {
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
    }
  });
  viewport.addEventListener("pointermove", (event) => {
    if (activeTouches.has(event.pointerId))
      activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (editorState.pointerMode === "pinch") {
      if (activeTouches.size < 2 || !editorState.pointerStart) return;
      const [first, second] = [...activeTouches.values()];
      const rect = viewport.getBoundingClientRect();
      const midpointX = (first.x + second.x) / 2 - rect.left;
      const midpointY = (first.y + second.y) / 2 - rect.top;
      const distance = Math.max(
        1,
        Math.hypot(second.x - first.x, second.y - first.y),
      );
      layout.zoom = Math.max(
        0.15,
        Math.min(
          1.5,
          editorState.pointerStart.initialZoom *
            (distance / editorState.pointerStart.initialDistance),
        ),
      );
      // Keep the graph point beneath the moving touch midpoint stationary during a pinch.
      layout.panX = midpointX - editorState.pointerStart.graphX * layout.zoom;
      layout.panY = midpointY - editorState.pointerStart.graphY * layout.zoom;
      updateZoomLabel();
      draw();
      return;
    }
    if (!editorState.pointerStart) return;
    const deltaX =
      (event.clientX - editorState.pointerStart.startX) / layout.zoom;
    const deltaY =
      (event.clientY - editorState.pointerStart.startY) / layout.zoom;
    if (editorState.pointerMode === "node") {
      const { node, left, top } = editorState.pointerStart;
      node.style.left = `${clampNumber(left + deltaX, -50000, 50000, left)}px`;
      node.style.top = `${clampNumber(top + deltaY, -50000, 50000, top)}px`;
      layout.positions[node.dataset.workflowNodeId] = {
        x: Number.parseFloat(node.style.left),
        y: Number.parseFloat(node.style.top),
      };
      draw();
    } else if (editorState.pointerMode === "pan") {
      layout.panX =
        editorState.pointerStart.panX + event.clientX - editorState.pointerStart.startX;
      layout.panY =
        editorState.pointerStart.panY + event.clientY - editorState.pointerStart.startY;
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
      const inputTarget = target?.closest(
        '[data-workflow-handle="in"]',
      );
      if (inputTarget) finishConnection(inputTarget);
      else {
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
      toolbar.querySelector("[data-workflow-expand]").textContent =
        localize.Expand[editorLanguage];
      requestAnimationFrame(draw);
      event.preventDefault();
      return;
    }
    if (event.code === "Space" && !event.target.closest("input, textarea, select")) {
      editorState.spacePressed = true;
      event.preventDefault();
    }
    if (["Delete", "Backspace"].includes(event.key)) {
      if (event.target.closest("input, textarea, select")) return;
      if (editorState.selectedNodeId?.startsWith("action:")) {
        const index = handlers.findIndex(
          (handler) =>
            `action:${handler.workflowId}` === editorState.selectedNodeId,
        );
        if (index >= 0) deleteWorkflowAction(index, appLoad, globalActionId);
      } else if (editorState.selectedNodeId?.startsWith("branch-action:")) {
        const branchNode = workflowNodes.find(
          (node) =>
            node.kind === "branch-action" &&
            node.id === editorState.selectedNodeId,
        );
        const condition = workflowNodes.find(
          (node) => node.id === branchNode?.parentConditionId,
        );
        if (branchNode && condition) {
          setWorkflowBranchActions(
            condition.action,
            branchNode.branch,
            getWorkflowBranchActions(
              condition.action,
              branchNode.branch,
            ).filter(
              (action) =>
                action.workflowId !== branchNode.action.workflowId,
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
              (handler) =>
                (appLoad ? "load" : globalActionId ? "global" : handler.event || "click") !== eventName,
            ),
            appLoad,
            globalActionId,
          );
        }
      } else if (editorState.selectedNodeId) {
        layout.hiddenTokenIds ||= [];
        if (!layout.hiddenTokenIds.includes(editorState.selectedNodeId))
          layout.hiddenTokenIds.push(editorState.selectedNodeId);
        editorState.selectedNodeId = "";
        writeWorkflowActions(handlers, appLoad, globalActionId);
      } else if (editorState.selectedEdgeId) {
        const edge = layout.edges.find(
          (item) => item.id === editorState.selectedEdgeId,
        );
        if (edge) layout.edges = layout.edges.filter((item) => item !== edge);
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
    if (!event.target.closest("input, select, textarea, button"))
      node.focus({ preventScroll: true });
  });
  minimap.addEventListener("click", (event) => {
    const rect = minimap.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    layout.panX = -x * stage.offsetWidth * layout.zoom + viewport.clientWidth / 2;
    layout.panY = -y * stage.offsetHeight * layout.zoom + viewport.clientHeight / 2;
    draw();
    saveWorkflowGraphLayout(graphKey, layout);
  });
  function nodeLayerSelect(node) {
    nodeLayer.querySelectorAll(".is-selected").forEach((item) => {
      item.classList.remove("is-selected");
    });
    node.classList.add("is-selected");
  }

  function finishConnection(targetHandle) {
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
        :
      sourceNode?.kind === "action" &&
      isWorkflowBranchAction(sourceNode.action) &&
      source.portId.startsWith(`${sourceNode.id}:`)
        ? source.branch || source.portId.slice(sourceNode.id.length + 1)
        : "";
    // Branch connections must stay within their owning condition and selected outcome.
    if (sourceBranch || sourceNode?.kind === "branch-action" ||
      targetNode?.kind === "branch-action") {
      if (
        (!sourceBranch &&
          !["branch-action", "branch-root"].includes(sourceNode?.kind)) ||
        targetHandle.dataset.workflowHandle !== "in"
      )
        return;
      if (
        !targetNode ||
        !["action", "branch-action"].includes(targetNode.kind)
      )
        return;
      const branch = sourceBranch || sourceNode.branch;
      const conditionId =
        sourceNode.kind === "action"
          ? sourceNode.id
          : sourceNode.parentConditionId;
      if (
        source.branch &&
        source.branch !== branch
      )
        return;
      if (
        targetNode.kind === "branch-action" &&
        (targetHandle.dataset.workflowBranch !== branch ||
          targetHandle.dataset.workflowParentConditionId !== conditionId ||
          targetNode.parentConditionId !== conditionId ||
          targetNode.branch !== branch)
      )
        return;
      const condition = workflowNodes.find(
        (node) => node.id === conditionId && isWorkflowBranchAction(node.action),
      );
      if (!condition) return;
      const actions = getWorkflowBranchActions(
        condition.action,
        branch,
      ).slice();
      if (targetNode.kind === "action") {
        if (targetNode.event !== condition.event)
          return;
        const targetHandlerIndex = handlers.findIndex(
          (handler) => handler.workflowId === targetNode.action.workflowId,
        );
        if (targetHandlerIndex < 0) return;
        const [targetAction] = handlers.splice(targetHandlerIndex, 1);
        const insertionIndex =
          sourceNode?.kind === "branch-action"
            ? actions.findIndex(
                (action) =>
                  action.workflowId === sourceNode.action.workflowId,
              ) + 1
            : 0;
        actions.splice(Math.max(0, insertionIndex), 0, targetAction);
        setWorkflowBranchActions(condition.action, branch, actions);
        writeWorkflowActions(handlers, appLoad, globalActionId);
        return;
      }
      const targetIndex = actions.findIndex(
        (action) =>
          action.workflowId === targetNode.action.workflowId,
      );
      if (targetIndex < 0) return;
      if (sourceBranch) {
        const [targetAction] = actions.splice(targetIndex, 1);
        actions.unshift(targetAction);
      } else {
        if (sourceNode.id === targetNode.id) return;
        const sourceIndex = actions.findIndex(
          (action) =>
            action.workflowId === sourceNode.action.workflowId,
        );
        if (sourceIndex < 0) return;
        const [moved] = actions.splice(sourceIndex, 1);
        const nextTargetIndex = actions.findIndex(
          (action) =>
            action.workflowId === targetNode.action.workflowId,
        );
        actions.splice(nextTargetIndex, 0, moved);
      }
      setWorkflowBranchActions(condition.action, branch, actions);
      writeWorkflowActions(handlers, appLoad, globalActionId);
      return;
    }
    if (!sourceNode || sourceNode.kind !== "action") {
      if (
        !triggerIdsForGraph().has(source.nodeId) ||
        !targetNode ||
        source.nodeId !== `trigger:${graphKey}:${targetNode.event}`
      )
        return;
    } else if (
      !targetNode ||
      targetNode.kind !== "action" ||
      sourceNode.event !== targetNode.event
    ) {
      return;
    }
    const eventName = sourceNode?.event || targetNode?.event;
    const group = handlers.filter(
      (handler) => (appLoad ? "load" : globalActionId ? "global" : handler.event || "click") === eventName,
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
      if (orderedIds.has(handler.workflowId)) result.push(ordered[cursor++]);
      else result.push(handler);
    });
    const currentNodes = result.map((handler) => ({
      id: `action:${handler.workflowId}`,
      kind: "action",
      event: appLoad ? "load" : globalActionId ? "global" : handler.event || "click",
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
        {
          x: Number.parseFloat(node.style.left),
          y: Number.parseFloat(node.style.top),
        },
      ]),
    );
    writeWorkflowActions(serialized, appLoad, globalActionId);
  }

  function triggerIdsForGraph() {
    return new Set(
      [...container.querySelectorAll(".workflow-trigger-node")].map(
        (node) => node.dataset.workflowNodeId,
      ),
    );
  }

  draw();
}
