export type ApiRequest = {
  id: string;
};

export type Page = {
  id: string;
  kind: string;
};

export type Element = {
  id: string;
  pageId?: string;
  [key: string]: unknown;
};

export type ElementTargetState = {
  pages: readonly Page[];
  elements: readonly Element[];
  currentPageId?: string;
};

export type ElementTargetAction = {
  targetPageId?: string;
  [key: string]: unknown;
};

function findValidPageId(
  pages: readonly Page[],
  candidateId: unknown,
): string | undefined {
  if (typeof candidateId !== "string" || !candidateId) return undefined;
  return pages.find((page) => page.id === candidateId)?.id;
}

export function getRequestIdOrDefault(
  requests: readonly ApiRequest[],
  requestId?: string,
): string {
  const selectedRequest = requests.find(
    (request) => request.id === requestId,
  );
  return selectedRequest?.id || requests[0]?.id || "";
}

export function getTargetPageId(
  state: ElementTargetState,
  action: ElementTargetAction,
  targetField: string,
  pageField = "targetPageId",
): string {
  const pages = state.pages.filter((page) => page.kind === "page");

  const target = state.elements.find(
    (element) => element.id === action[targetField],
  );
  const elementPageId = findValidPageId(pages, target?.pageId);
  if (elementPageId) {
    return elementPageId;
  }

  const actionPageId = findValidPageId(pages, action[pageField]);
  if (actionPageId) {
    return actionPageId;
  }

  return (
    findValidPageId(pages, state.currentPageId) || pages[0]?.id || ""
  );
}

export function getElementsOnPage(
  state: ElementTargetState,
  pageId: string,
  predicate: (element: Element) => boolean = () => true,
): Element[] {
  return state.elements.filter(
    (element) => element.pageId === pageId && predicate(element),
  );
}