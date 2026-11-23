const path = require("node:path");
const fs = require("node:fs/promises");
const { app, BrowserWindow, Menu, dialog, ipcMain } = require("electron");
const { createPluginStorage } = require("./plugin-storage.cjs");

let devServer;
let editorWindow;
let menuLanguage = "ar";

const bundledAppRoot = path.join(
  __dirname,
  "..",
  process.argv.includes("--dev") ? "public" : "dist",
);
const pluginStorage = createPluginStorage({
  bundledRoot: app.isPackaged
    ? path.join(__dirname, "..", "dist", "plugin")
    : path.join(__dirname, "..", "public", "plugin"),
  userRoot: path.join(app.getPath("userData"), "plugin"),
});

function sendMenuCommand(command) {
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.webContents.send("menu:command", command);
  }
}

function createApplicationMenu(language) {
  const isArabic = language === "ar";
  const label = (arabic, english) => (isArabic ? arabic : english);
  const command = (text, id, accelerator) => ({
    label: text,
    accelerator,
    click: () => sendMenuCommand(id),
  });
  const template = [
    {
      label: label("ملف", "File"),
      submenu: [
        command(
          label("معرض المشاريع", "Project gallery"),
          "project-gallery-button",
        ),
        command(
          label("استيراد JSON", "Import JSON"),
          "import-project-json",
          "CommandOrControl+O",
        ),
        { type: "separator" },
        command(
          label("تصدير JSON", "Export JSON"),
          "export-project-json",
          "CommandOrControl+Shift+S",
        ),
        command(
          label("تصدير التطبيق", "Export app"),
          "export-button",
          "CommandOrControl+Shift+E",
        ),
        { type: "separator" },
        command(label("إعادة ضبط", "Reset"), "reset-button"),
      ],
    },
    {
      label: label("مشروع", "Project"),
      submenu: [
        command(label("إعدادات API", "API settings"), "api-button"),
        command(label("المتغيرات", "Variables"), "variables-button"),
        command(
          label("الإجراءات العامة", "Global actions"),
          "global-actions-button",
        ),
        command(label("الأصول", "Assets"), "assets-button"),
        command(label("الألوان", "Colors"), "theme-button"),
        command(label("CSS مخصص", "Custom CSS"), "custom-css-button"),
      ],
    },
    {
      label: label("اللغة", "Language"),
      submenu: [
        command(isArabic ? "English" : "العربية", "editor-language-toggle"),
      ],
    },
  ];

  if (process.platform === "darwin") {
    template.unshift({
      label: app.name,
      submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }],
    });
  }

  return template;
}

function setMenuLanguage(language) {
  if (language !== "ar" && language !== "en") return;
  menuLanguage = language;
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(createApplicationMenu(language)),
  );
}

ipcMain.on("menu:set-language", (event, language) => {
  if (BrowserWindow.fromWebContents(event.sender) === editorWindow) {
    setMenuLanguage(language);
  }
});

ipcMain.on("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on("window:toggle-maximize", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;

  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }
});

ipcMain.on("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.handle("window:is-maximized", (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
});

ipcMain.handle("plugins:read", async (event, relativePath) => {
  if (BrowserWindow.fromWebContents(event.sender) !== editorWindow)
    throw new Error("Plugin files can only be read by the editor window.");
  return pluginStorage.read(relativePath);
});

ipcMain.handle("plugins:save", async (event, plugin) => {
  if (BrowserWindow.fromWebContents(event.sender) !== editorWindow)
    throw new Error("Plugins can only be saved by the editor window.");
  return pluginStorage.save(plugin);
});

ipcMain.handle("app-files:read", async (event, relativePath) => {
  if (BrowserWindow.fromWebContents(event.sender) !== editorWindow)
    throw new Error("App files can only be read by the editor window.");
  if (
    typeof relativePath !== "string" ||
    !/^(?:projects\/[A-Za-z0-9._-]+\.json|assets\/lib\/fontawesome\/(?:css\/all\.min\.css|webfonts\/fa-solid-900\.woff2)|js\/twkhelper\.js)$/.test(
      relativePath,
    )
  )
    throw new Error("Invalid bundled app file path.");
  return new Uint8Array(
    await fs.readFile(path.join(bundledAppRoot, ...relativePath.split("/"))),
  );
});

ipcMain.handle("app-files:save-export", async (event, fileName, contents) => {
  if (BrowserWindow.fromWebContents(event.sender) !== editorWindow)
    throw new Error("Exports can only be saved by the editor window.");
  if (
    (fileName !== "tawakkalna-project.json" && fileName !== "app.zip") ||
    (typeof contents !== "string" && !(contents instanceof Uint8Array))
  )
    throw new Error("Invalid export data.");

  const filters =
    fileName === "app.zip"
      ? [{ name: "ZIP archive", extensions: ["zip"] }]
      : [{ name: "JSON file", extensions: ["json"] }];
  const result = await dialog.showSaveDialog(editorWindow, {
    defaultPath: fileName,
    filters,
  });
  if (result.canceled) return false;

  await fs.writeFile(result.filePath, contents);
  return true;
});

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    title: "Embedly",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  editorWindow = window;

  window.on("maximize", () => {
    window.webContents.send("window:maximized-change", true);
  });
  window.on("unmaximize", () => {
    window.webContents.send("window:maximized-change", false);
  });
  window.on("closed", () => {
    if (editorWindow === window) editorWindow = null;
  });

  if (process.argv.includes("--dev")) {
    const { createServer } = await import("vite");
    devServer = await createServer({
      server: {
        host: "127.0.0.1",
        port: 5173,
        strictPort: true,
      },
    });
    await devServer.listen();
    await window.loadURL("http://127.0.0.1:5173/index.html");
  } else {
    await window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app
  .whenReady()
  .then(() => {
    setMenuLanguage(menuLanguage);
    return createWindow();
  })
  .catch((error) => {
    console.error("Failed to start Embedly desktop app:", error);
    app.quit();
  });

app.on("before-quit", () => {
  if (devServer) {
    void devServer.close();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
