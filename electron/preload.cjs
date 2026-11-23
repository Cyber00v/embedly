const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronWindow", {
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
  close: () => ipcRenderer.send("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  readPluginFile: (relativePath) =>
    ipcRenderer.invoke("plugins:read", relativePath),
  savePlugin: (plugin) => ipcRenderer.invoke("plugins:save", plugin),
  readAppFile: (relativePath) => ipcRenderer.invoke("app-files:read", relativePath),
  saveExportFile: (fileName, contents) =>
    ipcRenderer.invoke("app-files:save-export", fileName, contents),
  setMenuLanguage: (language) => ipcRenderer.send("menu:set-language", language),
  onMaximizedChange: (callback) => {
    const listener = (_event, maximized) => callback(maximized);
    ipcRenderer.on("window:maximized-change", listener);
    return () => ipcRenderer.removeListener("window:maximized-change", listener);
  },
  onMenuCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("menu:command", listener);
    return () => ipcRenderer.removeListener("menu:command", listener);
  },
}); 
