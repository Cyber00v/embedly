const electronWindow = window.electronWindow;

if (electronWindow) {
  const titlebar = document.querySelector<HTMLElement>("#desktop-titlebar");
  const topbar = document.querySelector<HTMLElement>(".topbar");
  const topbarActions = topbar?.querySelector<HTMLElement>(".topbar-actions");
  const canvasToolbar = document.querySelector<HTMLElement>(".canvas-toolbar");
  const minimizeButton = document.querySelector<HTMLButtonElement>("#window-minimize");
  const maximizeButton = document.querySelector<HTMLButtonElement>("#window-maximize");
  const closeButton = document.querySelector<HTMLButtonElement>("#window-close");

  if (
    !titlebar ||
    !topbar ||
    !topbarActions ||
    !canvasToolbar ||
    !minimizeButton ||
    !maximizeButton ||
    !closeButton
  ) {
    throw new Error("Electron window controls or editor toolbar are missing.");
  }
 
  document.body.classList.add("electron-app");
  titlebar.hidden = false;
  canvasToolbar.insertBefore(topbarActions, canvasToolbar.querySelector(".view-switcher"));
  minimizeButton.addEventListener("click", electronWindow.minimize);
  maximizeButton.addEventListener("click", electronWindow.toggleMaximize);
  closeButton.addEventListener("click", electronWindow.close);

  const updateMaximizeButton = (maximized: boolean) => {
    maximizeButton.setAttribute("aria-label", maximized ? "Restore window" : "Maximize window");
    maximizeButton.title = maximized ? "Restore" : "Maximize";
    maximizeButton.setAttribute("aria-pressed", String(maximized));
    maximizeButton.innerHTML = maximized
      ? '<i class="fa-solid fa-clone" aria-hidden="true"></i>'
      : '<i class="fa-regular fa-square" aria-hidden="true"></i>';
  };

  const unsubscribe = electronWindow.onMaximizedChange(updateMaximizeButton);
  const menuCommands = new Set([
    "project-gallery-button",
    "import-project-json",
    "export-project-json",
    "export-button",
    "reset-button",
    "api-button",
    "variables-button",
    "global-actions-button",
    "assets-button",
    "theme-button",
    "custom-css-button",
    "editor-language-toggle",
  ]);
  const unsubscribeMenu = electronWindow.onMenuCommand((command) => {
    const button = menuCommands.has(command)
      ? document.getElementById(command)
      : null;
    if (!(button instanceof HTMLButtonElement)) {
      console.error(`Unknown Electron menu command: ${command}`);
      return;
    }
    button.click();
  });

  const syncMenuLanguage = () => {
    electronWindow.setMenuLanguage(document.documentElement.lang);
  };
  syncMenuLanguage();
  const languageObserver = new MutationObserver(syncMenuLanguage);
  languageObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });

  window.addEventListener(
    "pagehide",
    () => {
      unsubscribe();
      unsubscribeMenu();
      languageObserver.disconnect();
    },
    { once: true },
  );

  void electronWindow
    .isMaximized()
    .then(updateMaximizeButton)
    .catch((error: unknown) => {
      console.error("Unable to read the Electron window state:", error);
    });
}
