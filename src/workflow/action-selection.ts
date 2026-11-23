type ApiRequest = { id: string };
type Page = { id: string; kind: string };
type Element = { id: string; pageId?: string; [key: string]: unknown };
type ElementTargetState = {
  pages: readonly Page[];
  elements: readonly Element[];
  currentPageId?: string;
};
type ElementTargetAction = {
  targetPageId?: string;
  [key: string]: unknown;
};

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
  if (
    typeof target?.pageId === "string" &&
    pages.some((page) => page.id === target.pageId)
  )
    return target.pageId;

  const targetPageId = action[pageField];
  if (
    typeof targetPageId === "string" &&
    pages.some((page) => page.id === targetPageId)
  )
    return targetPageId;

  return (
    pages.find((page) => page.id === state.currentPageId)?.id ||
    pages[0]?.id ||
    ""
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
