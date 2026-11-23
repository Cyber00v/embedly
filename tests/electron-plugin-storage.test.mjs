import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createPluginStorage } = require("../electron/plugin-storage.cjs");

async function createStorage(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "embedly-plugin-storage-"));
  const bundledRoot = path.join(root, "bundled");
  const userRoot = path.join(root, "user", "plugin");
  await mkdir(path.join(bundledRoot, "bundled-plugin"), { recursive: true });
  await writeFile(
    path.join(bundledRoot, "plugins.json"),
    JSON.stringify({ plugins: ["bundled-plugin"] }),
  );
  await writeFile(
    path.join(bundledRoot, "bundled-plugin", "plugin.json"),
    JSON.stringify({ id: "bundled-plugin" }),
  );
  await writeFile(
    path.join(bundledRoot, "bundled-plugin", "index.html"),
    "<p>Bundled</p>",
  );
  await writeFile(
    path.join(bundledRoot, "bundled-plugin", "style.css"),
    "p { color: red; }",
  );
  await writeFile(
    path.join(bundledRoot, "bundled-plugin", "script.js"),
    "",
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    storage: createPluginStorage({ bundledRoot, userRoot }),
    userRoot,
  };
}

function plugin(overrides = {}) {
  return {
    id: "saved-plugin",
    title: "Saved plugin",
    group: "Testing",
    description: "A persisted test plugin.",
    icon: "fa-puzzle-piece",
    version: "1.0.0",
    html: "<p>Saved</p>",
    css: "p { color: blue; }",
    js: "",
    properties: [],
    events: [],
    ...overrides,
  };
}

test("saves imported plugins and loads them with bundled plugins", async (t) => {
  const { storage, userRoot } = await createStorage(t);
  const imported = plugin();

  assert.deepEqual(
    JSON.parse(await storage.read("plugins.json")).plugins,
    ["bundled-plugin"],
  );
  await storage.save(imported);

  const catalog = JSON.parse(await storage.read("plugins.json"));
  assert.deepEqual(catalog.plugins, ["bundled-plugin", "saved-plugin"]);
  assert.equal(
    await storage.read("saved-plugin/index.html"),
    imported.html,
  );
  assert.equal(
    await storage.read("bundled-plugin/index.html"),
    "<p>Bundled</p>",
  );
  const savedManifest = JSON.parse(
    await readFile(
      path.join(userRoot, "saved-plugin", "plugin.json"),
      "utf8",
    ),
  );
  assert.equal(savedManifest.id, imported.id);
  assert.equal(savedManifest.title, imported.title);
});

test("rejects unsafe paths, duplicate plugins, and oversized imports", async (t) => {
  const { storage } = await createStorage(t);

  await assert.rejects(storage.read("../outside/plugin.json"), /Invalid plugin file path/);
  await assert.rejects(
    storage.save(plugin({ id: "bundled-plugin" })),
    /already exists/,
  );
  await storage.save(plugin());
  await assert.rejects(storage.save(plugin()), /already exists/);
  await assert.rejects(
    storage.save(plugin({ id: "large-plugin", html: "x".repeat(1024 * 1024 + 1) })),
    /exceeds the 1 MB limit/,
  );
});
