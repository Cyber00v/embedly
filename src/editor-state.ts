export const ELEMENT_HISTORY_LIMIT = 100;
export const ELEMENT_HISTORY_COALESCE_MS = 600;

interface SavedProject {
  elements: unknown[];
  pages: Array<{ id: string; kind: string }>;
  components: unknown[];
  userComponents: unknown[];
  variables: unknown[];
  assets: unknown[];
  customCss: string;
  theme: Record<string, unknown>;
  settings: Record<string, unknown>;
}

interface ElementHistory {
  undo: string[];
  redo: string[];
  snapshot: string;
  lastRecordedAt: number;
}
 
export function createEditorState(
  savedProject: SavedProject,
  requests: unknown[],
) {
  const currentPage = savedProject.pages.find((page) => page.kind === "page");
  if (!currentPage) throw new Error("The project must contain a regular page.");

  const state = {
    elements: savedProject.elements,
    pages: savedProject.pages,
    components: savedProject.components,
    userComponents: savedProject.userComponents,
    variables: savedProject.variables,
    assets: savedProject.assets,
    customCss: savedProject.customCss,
    theme: savedProject.theme,
    settings: savedProject.settings,
    currentPageId: currentPage.id,
    requests,
    selectedId: null,
    selectedIds: [],
    editingSavedComponentInstanceId: null,
    editingSavedComponentHistory: null,
    clipboardElements: [],
    clipboardRootIds: [],
    previewSheetId: null,
    selectedRequestId: null,
    selectedVariableId: null,
    draggingId: null,
    workflowEditor: {},
    exportTab: "html",
    saveTimer: null,
    toastTimer: null,
    responses: {},
  };

  const elementHistory: ElementHistory = {
    undo: [],
    redo: [],
    snapshot: JSON.stringify(state.elements),
    lastRecordedAt: 0,
  };

  return {
    state,
    elementHistory,
    collapsedTreeElements: new Set<string>(),
  };
}
