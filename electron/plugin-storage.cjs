const fs = require("node:fs/promises");
const path = require("node:path");

const SAFE_PLUGIN_ID = /^[a-z][a-z0-9-]{1,63}$/;
const PLUGIN_FILES = ["plugin.json", "index.html", "style.css", "script.js"];
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * MAX_FILE_BYTES;
const MAX_CATALOG_BYTES = 64 * 1024;
const MAX_CATALOG_PLUGINS = 100;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateCatalog(text) {
  if (Buffer.byteLength(text, "utf8") > MAX_CATALOG_BYTES)
    throw new Error("Plugin catalog exceeds the 64 KB limit.");

  let catalog;
  try {
    catalog = JSON.parse(text);
  } catch {
    throw new Error("Plugin catalog plugins.json is not valid JSON.");
  }
  if (
    !isRecord(catalog) ||
    !Array.isArray(catalog.plugins) ||
    catalog.plugins.length > MAX_CATALOG_PLUGINS ||
    catalog.plugins.some(
      (id) => typeof id !== "string" || !SAFE_PLUGIN_ID.test(id),
    ) ||
    new Set(catalog.plugins).size !== catalog.plugins.length
  )
    throw new Error("Plugin catalog must list unique valid plugin IDs.");
  return catalog.plugins;
}

function validatePluginFiles(plugin) {
  if (!isRecord(plugin)) throw new Error("Imported plugin data is invalid.");

  const { id, title, group, description, icon, version, properties, events } =
    plugin;
  if (typeof id !== "string" || !SAFE_PLUGIN_ID.test(id))
    throw new Error("Plugin id must use lowercase letters, numbers, and hyphens.");
  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.length > 60 ||
    typeof group !== "string" ||
    !group.trim() ||
    group.length > 40
  )
    throw new Error("Plugin title and group are required.");
  if (typeof description !== "string" || description.length > 240)
    throw new Error("Plugin description is invalid.");
  if (
    typeof icon !== "string" ||
    icon.length > 60 ||
    !/^fa-[a-z0-9-]+$/.test(icon)
  )
    throw new Error("Plugin icon must be a Font Awesome icon class.");
  if (typeof version !== "string" || !version.trim() || version.length > 32)
    throw new Error("Plugin version is invalid.");
  if (
    !Array.isArray(properties) ||
    properties.length > 20 ||
    !Array.isArray(events) ||
    events.length > 20
  )
    throw new Error("Plugin properties or events are invalid.");

  const metadata = JSON.stringify({
    id,
    title: title.trim(),
    group: group.trim(),
    description,
    icon,
    version,
    properties,
    events,
  });
  const files = {
    "plugin.json": metadata,
    "index.html": plugin.html,
    "style.css": plugin.css,
    "script.js": plugin.js,
  };
  let totalSize = 0;
  Object.entries(files).forEach(([name, contents]) => {
    if (typeof contents !== "string")
      throw new Error(`Plugin file "${name}" is invalid.`);
    const size = Buffer.byteLength(contents, "utf8");
    if (size > MAX_FILE_BYTES)
      throw new Error(`Plugin file "${name}" exceeds the 1 MB limit.`);
    totalSize += size;
  });
  if (totalSize > MAX_TOTAL_BYTES)
    throw new Error("Expanded plugin content must not exceed 2 MB.");

  return { id, files };
}

function createPluginStorage({ bundledRoot, userRoot }) {
  async function readBundledPluginIds() {
    const catalogText = await fs.readFile(
      path.join(bundledRoot, "plugins.json"),
      "utf8",
    );
    return validateCatalog(catalogText);
  }

  async function readUserPluginIds(bundledIds) {
    let entries;
    try {
      entries = await fs.readdir(userRoot, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }

    const pluginIds = [];
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        !SAFE_PLUGIN_ID.test(entry.name) ||
        bundledIds.includes(entry.name)
      )
        continue;
      const directory = path.join(userRoot, entry.name);
      let files;
      try {
        files = await fs.readdir(directory);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        console.error(`Ignoring incomplete plugin folder "${entry.name}".`);
        continue;
      }
      if (!PLUGIN_FILES.every((fileName) => files.includes(fileName))) {
        console.error(`Ignoring incomplete plugin folder "${entry.name}".`);
        continue;
      }
      pluginIds.push(entry.name);
    }
    return pluginIds.sort();
  }

  async function read(relativePath) {
    if (typeof relativePath !== "string")
      throw new Error("Invalid plugin file path.");
    if (relativePath === "plugins.json") {
      const bundledIds = await readBundledPluginIds();
      const userIds = await readUserPluginIds(bundledIds);
      const pluginIds = [...bundledIds, ...userIds];
      if (pluginIds.length > MAX_CATALOG_PLUGINS)
        throw new Error("Plugin catalog exceeds the 100 plugin limit.");
      return JSON.stringify({ plugins: pluginIds });
    }

    const match =
      /^([a-z][a-z0-9-]{1,63})\/(plugin\.json|index\.html|style\.css|script\.js)$/.exec(
        relativePath,
      );
    if (!match) throw new Error("Invalid plugin file path.");
    const [, id, fileName] = match;
    const bundledIds = await readBundledPluginIds();
    const pluginRoot = bundledIds.includes(id) ? bundledRoot : userRoot;
    const contents = await fs.readFile(
      path.join(pluginRoot, id, fileName),
      "utf8",
    );
    if (Buffer.byteLength(contents, "utf8") > MAX_FILE_BYTES)
      throw new Error("Plugin files must not exceed 1 MB.");
    return contents;
  }

  async function save(plugin) {
    const { id, files } = validatePluginFiles(plugin);
    const bundledIds = await readBundledPluginIds();
    if (bundledIds.includes(id))
      throw new Error(`Plugin "${id}" already exists in the plugin folder.`);
    const userIds = await readUserPluginIds(bundledIds);
    if (userIds.includes(id))
      throw new Error(`Plugin "${id}" already exists in the plugin folder.`);
    if (bundledIds.length + userIds.length >= MAX_CATALOG_PLUGINS)
      throw new Error("Plugin catalog exceeds the 100 plugin limit.");

    await fs.mkdir(userRoot, { recursive: true });
    const directory = path.join(userRoot, id);
    try {
      await fs.mkdir(directory);
    } catch (error) {
      if (error.code === "EEXIST")
        throw new Error(`Plugin "${id}" already exists in the plugin folder.`);
      throw error;
    }

    try {
      for (const [fileName, contents] of Object.entries(files))
        await fs.writeFile(path.join(directory, fileName), contents, {
          encoding: "utf8",
          flag: "wx",
        });
    } catch (error) {
      await fs.rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  return { read, save };
}

module.exports = { createPluginStorage };
