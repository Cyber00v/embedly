interface BuilderCommandHandlers {
  undoBuilderAction: EventListener;
  redoBuilderAction: EventListener;
  copySelectedElements: EventListener;
  pasteCopiedElements: EventListener;
  selectAllElements: EventListener;
}

export function registerEditorEvents(
  document: Pick<Document, "addEventListener">,
  {
    undoBuilderAction,
    redoBuilderAction,
    copySelectedElements,
    pasteCopiedElements,
    selectAllElements,
  }: BuilderCommandHandlers,
) {
  document.addEventListener("builder:undo", undoBuilderAction);
  document.addEventListener("builder:redo", redoBuilderAction);
  document.addEventListener("builder:copy", copySelectedElements);
  document.addEventListener("builder:paste", pasteCopiedElements);
  document.addEventListener("builder:select-all", selectAllElements);
}
 