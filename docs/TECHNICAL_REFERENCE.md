# Embedly — Technical Reference

This document describes the current implementation in [`app.ts`](../src/app.ts), [`styles.css`](../css/styles.css), and the bundled [`twkhelper.js`](../public/js/twkhelper.js). The project is a framework-free TypeScript browser application built with Vite; runtime functions and data shapes remain application-specific rather than a stable public package API.

## 1. Architecture

### Files and execution

- `src/app.ts` is the composition root and coordinates editor features. The workflow editor is split into `src/workflow/graph.ts` (action IDs, edge identity, and graph serialization), `layout.ts` (persisted graph/view state), `canvas.ts` (edge/minimap drawing), `canvas-interactions.ts` (pointer, pan/zoom, node connections, and selection), and focused action modules: `action-editor.ts` orchestrates graph/action cards, `action-fields.ts` renders action-specific fields, `condition-branches.ts` renders condition branches, `condition-editor.ts` handles nested conditions, and `action-options.ts` populates selectors. `src/editor-state.ts` creates the project/UI state and element history; `src/editor-events.ts` registers builder command events; `src/preview-renderer.ts` renders element markup; and `src/app-runtime.ts` contains the executable exported-app runtime. `src/runtime-builder.ts` prepares its project configuration and embeds that function for standalone exports. `public/` holds static data and browser assets copied by Vite.
- `src/template-engine.ts` provides escaped interpolation and explicit trusted-HTML support, while `src/html-templates.ts` contains reusable document layouts and element partials. `buildHtmlFile()` composes standalone HTML through these modules. `css/styles.css` styles the editor; app and export CSS are still assembled by `src/app.ts`.
- The local template renderer supports dotted scalar values (`{{value}}`), named partials (`{{> head}}`), and explicit trusted markup (`{{{markup}}}` via `TemplateEngine.raw()`). Missing values, unknown partials, partial cycles, invalid expressions, and untrusted raw values fail explicitly. Run its unit tests with `npm test`.
- `public/js/twkhelper.js` is the Tawakkalna integration helper included by the export pipeline. The editor preview can use mock profile data; the exported app expects the helper interface available in the WebView.
- Vite serves the existing HTML pages during development and emits the production site to `dist/`. Vite copies sample JSON, static libraries, and the Tawakkalna JavaScript integration helper from `public/` alongside the compiled app. Electron runs the same built editor in a frameless desktop window; its native File, Project, and Language menus trigger the existing editor commands through the isolated `electron/preload.cjs` bridge. Bundled plugins load from `public/plugin` in development or `dist/plugin` when packaged. Imported Electron plugins are extracted under the writable `app.getPath("userData")/plugin` folder, merged into the plugin catalog, and loaded again on later launches. In the Electron renderer, the topbar is hidden and its in-page menu controls move to the canvas toolbar; the browser editor keeps its regular topbar. The custom titlebar uses the bridge for minimize, maximize/restore, and close controls, and is hidden in the browser. `npm run desktop:dev` starts it with Vite, `npm run desktop` opens the production build, and `npm run desktop:package` creates a Windows installer. The legacy editor, workflow modules, and runtime currently use TypeScript transpilation with type-checking deferred; smaller state, event, template, and rendering modules are checked by `tsc`. Run `npm run dev`, `npm run build`, and `npm test` for local development and validation.

### State and persistence

The editor’s `state` object contains `elements`, `pages`, saved/user components, `variables`, `assets`, `customCss`, `theme`, `settings` (including named `globalActions`), API `requests`, selection/clipboard, and UI-specific fields. A global action stores its ordered action objects under `settings.globalActions[].actions`; its visual workflow layout uses the stable `global-action:<id>` key. `state.workflowEditor` is the transient interaction slice keyed by `app-load`, `global-action:<id>`, or `element:<id>`; it tracks selected nodes/edges, connection gestures, panning, and pointer state. Persistent graph view state lives in `settings.eventWorkflowGraphs`, keyed the same way, and stores node positions, sequence edges, token-input links, zoom/pan, minimap state, and hidden token sources. The project and request data use separate versioned localStorage keys (`tawakkalna-builder-v5`, `tawakkalna-requests-v5`). Loaders validate and normalize persisted input; invalid data logs an error and falls back to safe defaults. `saveProject()` serializes the editable model; `scheduleSave()` coalesces saves.

Element history is separate from project persistence: element snapshots have a 100-entry cap and edits made within the coalescing interval are grouped. Project JSON import/export includes model settings, requests, elements/pages, variables, themes, components, CSS, and assets; app export prunes default values and builds a runtime bundle.

### Model relationships and data flow

- Elements use stable `id`, `type`, `pageId`, optional `parentId`, style/layout fields, and type-specific fields. Containers determine nesting. A plugin can opt in with `acceptsChildren: true` and a default `<slot>` in its HTML; its children are rendered into that slot. `getSingleRootContainer(pageId)` returns the only top-level non-Sheet container on a page, or `null` when there are zero or multiple candidates; hidden or inactive Sheets are never inferred as default parents. `addElement()` and `addSavedComponent()` use it as the default parent only when no explicit placement target takes precedence. `pruneElementAttributes()` removes fields invalid for an element type/parent.
- A Collection's `listSource` is a discriminated configuration: `{type:"static"}`, `{type:"endpoint", requestId, path}`, or `{type:"twk", field}`. `normalizeCollectionDataSource()` enforces this shape when loading, pruning, editing, and exporting; changing source type drops attributes belonging to the previous source.
- Pages are `page`, `splash`, or `error`; older serialized `loading` page kinds are migrated to a normal page.
- Bindings and variable sources share source families: static, form, TWK, endpoint/API, variable, collection item, extra data, and element property. An optional path extracts nested JSON.
- Runtime token resolution feeds bindings, request values, conditions, action parameters, and extra data. A recursion/visited set prevents cyclic value resolution. API responses are cached in runtime memory by request ID.
- The runtime initializes on DOM ready, applies app language, runs load requests, exits Splash after startup requests, updates bindings, then runs app-load handlers. API activity is reference-counted so overlapping requests keep the progress overlay visible; the overlay is hidden on Splash or when its app setting is off.
- Runtime element event delegation walks the event's composed path from the clicked element outward, collecting form values when required and running configured actions/handlers for each element ancestor. It emits `embedded-app:response`, `embedded-app:action`, and `embedded-app:error` custom events.
- File Picker selection dispatches bubbling `input` and `onFilesSelected` events only when normalization yields at least one file. It updates the value before dispatch; the custom event carries `{files}` in `detail`. Empty arrays and cancellation leave the prior value unchanged and produce no selection/input event. The delegated event-action runner handles `onFilesSelected` like other element triggers.
- Permission workflow actions are branch-capable graph nodes: True/False output ports are labeled Granted/Denied, and the graph serializer stores their connected actions in `actions`/`elseActions`. Runtime awaits the parameterless TWK helper, reads the normalized `granted` boolean directly, executes only the matching branch in sequence, and returns the original `{granted:boolean}` result without evaluating a user-configured condition.
- Parameterless Tawakkalna system actions are available for element events, nested condition branches, and app-load handlers. `runTwkSystemAction(action)` invokes the same-named `window.TWK` method without arguments, unwraps the helper response, and returns permission results as exactly `{granted:boolean}`. Invalid/missing permission results and helper failures throw and are surfaced through `embedded-app:error`; `shareScreenShot` returns `{type, result}` with the successful helper payload.
- A Collection row renderer dispatches `onItemRender` actions before applying item bindings and `onItemDidRender` actions afterward. These lifecycle actions are invoked directly for row elements (not bubbled), preserving row-specific `self` and item context without re-running ancestor actions. Runtime element-property and show/hide actions resolve same-Collection targets inside that exact row instead of applying changes to every rendered instance sharing the template ID.
- The `workflow-dialog` native modal hosts both element and app-load event/action graphs; inspector/application panels provide launch buttons rather than embedding the graph. Native dialog behavior provides focus isolation and Escape dismissal. Element and app-load graph field handlers are delegated from the modal; changes update the model immediately and autosave, while Ctrl/Cmd+S calls `saveProject()` directly. `renderEventHandlers()` builds the trigger/action graph for element and app-load contexts. Action cards have no visible input handles; their surfaces are sequence-connection targets during an active connection gesture. Token nodes have no action-connection ports; dragging a token arrow inserts its interpolation string into a text field without persisting or drawing a token-to-action edge. Old `tokenConnections` layout entries are discarded. The viewport uses pointer events for node dragging, background pan, and two-pointer pinch zoom; wheel input pans, while Ctrl/Cmd+wheel zooms around the pointer. Pointer gesture updates change node positions in `layout.positions` and pan/zoom in the graph layout without replacing sequence edges, then persist through `saveWorkflowGraphLayout()`. The toolbar Fit View button computes node bounds and sets the graph transform to fit and center all nodes. Condition nodes expose separate False (`elseActions`) and True (`actions`) output handles on the left and right, respectively, and connect directly to their branch nodes. Each branch node hosts its own nested action list and add-action control without generated placeholder action nodes; nested actions execute in list order and may themselves be conditions with independent True/False action lists. Nested condition edits resolve their owning action from the full branch/index path, and recursive workflow ID assignment keeps each action node uniquely addressable. `serializeWorkflowGraph(nodes, edges)` walks trigger-to-action sequence edges and returns ordered action descriptors; disconnected root action nodes are appended in their existing order. Condition nodes retain nested `condition`, `actions`, and `elseActions` arrays. `writeWorkflowActions(actions, appLoad)` maps the result back to the compatible primary-action-plus-`handlers` schema. `workflowId` associates serialized action descriptors with stable graph nodes; runtime execution ignores this editor metadata.
- Saved layout-component instances carry `savedComponentId`, `savedComponentInstanceId`, and `savedComponentElementId` metadata. Preview edit mode defers persistence, maps instance IDs back to template IDs on Apply, and remaps internal references while synchronizing the shared template to all instances; Cancel restores the original template.
- The element tree uses a constrained two-axis scroll viewport. Its nested rows can expand horizontally, and rendering restores both scroll offsets.
- Sheet markup is rendered in a separate portal and tagged with its owning page. `collectFormValues()` combines active-page controls with controls in visible Sheets owned by that page, while excluding hidden Sheets.
- Multi-selection is stored as `state.selectedIds` with `state.selectedId` as the primary inspector target. Delete computes the selected subtrees once; inspector edits to shared content, appearance, spacing, and visibility fields are copied to all selected elements on the current page before rendering and saving.

### Extension guidance

1. Add/change schema fields in the defaults and normalization/import path before editing rendering.
2. Update `createElement`, `pruneElementAttributes`, inspector rendering/update handlers, editor preview rendering, export markup, runtime update/binding logic, and project serialization as appropriate. Editor preview and generated app are separate renderers.
3. Use existing token resolution, escaping, URL/color/dimension guards, and event delegation. Keep raw custom HTML sanitized and CSS scoped.
4. Add validation for imported and saved input. Keep error reporting explicit and test both preview and exported HTML/runtime behavior.
5. When changing a user-visible property or behavior, update [`USER_GUIDE.md`](./USER_GUIDE.md) and this reference.
6. Plugin manifests may define `localizations` keyed by `en` and `ar`, with optional `title`, `group`, `description`, and per-property `label`/`options` translations. Option keys remain the stored values. `pluginContext.language` exposes the app language to plugin scripts.

## 2. Data contracts

### Project structures

| Record | Important fields |
|---|---|
| Element | `id`, `type`, `content`, `styles`, `pageId`, optional `parentId`, `binding`, `action`, `extraData`; type-specific layout/form/image/progress fields. |
| Page | `id`, `name`, `kind` (`page`, `splash`, `error`). |
| API request | `id`, `name`, HTTP `method`, `url`, JSON-string `headers`/`body`, `trigger`, optional `buttonId`; load ordering follows the stored request list. |
| Variable | `id`, `name`, `source`, source-specific value/path/request/element fields. Static sources can be runtime-overridden. |
| Binding | `source`, source key/path, optional `objectPath`; element bindings additionally identify element/property or item path. |
| Extra data | Array of `{key, value}` entries on any element; runtime references use `{{elementId.extra.key}}`. |
| Event handler | `event` (`click`, `change`, `input`, Collection lifecycle events, or app `load`), `type`, a stable editor `workflowId`, and action-specific fields. Conditions contain `condition`, ordered `actions`, and `elseActions`. |
| Absolute Layout child | `horizontalAlignment`: `start|center|end`; `verticalAlignment`: `top|center|bottom`. These settings are meaningful for direct children of an `absoluteLayout`. |

### Token syntax

Supported token namespaces include `twk`, `form`, `var`, `api`, `item`, `self`/`element`, and element extra data. During an element action, `self.property` (or `element.property`) reads a live property from the invoking element; the workflow token picker lists `self.id`, `self.content`, and supported properties for that component using English property keys. `self.extra.key` resolves extra data in the current collection context. File Picker exposes `files` and `mode` (selected images are available through `files`, not `value`); Input exposes `value`, `min`, `max`, `isValid`, and `characterCount`; Checkbox/Switch expose `checked` and `value`; List/Radio expose `value`, `selectedLabel`, and `options`; Progress exposes `value`, `min`, and `max`. For native data attributes, `self.dataset`, `self.data`, and `self.dataAttributes` return the merged component/native-control dataset, which can be traversed with nested paths (for example `self.dataset.filePickerMode`). Select `options` are `{label, value, selected, disabled}` records; a multi-select's `value` and `selectedLabel` are arrays. The runtime property registry is emitted into the generated app and is also used to populate editor element-property binding choices. Collection-scoped lookups resolve the matching element in the active item row. `self`/`element` require an invoking element context; app-load actions cannot use them. A full token preserves the resolved JSON value; tokens embedded within a larger string stringify/format the value. API and object paths use dot-separated segments, including numeric array indexes (`results.0.title`). JSON path helpers return the original value for an empty path and `undefined` when traversal fails.

### Security and trust boundaries

The editor’s HTML sanitizer and CSS scoping are not a substitute for a server-side security boundary. Exported apps run API requests in the browser and cannot safely protect embedded secrets. User-provided URLs, imported JSON, custom code, and asset scripts must be treated as untrusted. Keep credentials server-side, validate CORS on the API, and do not weaken the sanitizer or escaping paths.

## 3. Core function reference

The app is browser TypeScript. The supported public runtime calls are listed under Public browser runtime API; the function signatures below describe internal implementation details and are not exposed on `window`. Return types describe current behavior (`void` means the function mutates state/DOM and falls through). Inline callbacks are intentionally not listed individually; the catalog covers named function declarations in `app.ts` and `app-runtime.ts` plus the helper functions described in §4.

### Configuration, normalization, model, persistence

| Function (parameters) | Inferred return | Responsibility |
|---|---|---|
| `getElementName(element)` | string | Palette/tree label from type and ID. |
| `getChangePropertyOptions(element)` | array | Allowed action-target properties for an element type. |
| `normalizeChangePropertyAction(action)` | object | Corrects an unsupported target/property to a safe default. |
| `getActionValueType(property)` | string | Selects boolean/variant/text editor semantics. |
| `getVariantOptions(type)`, `getDefaultVariant(type)`, `normalizeElementVariant(type, variant)` | array/string | Return, default, and validate style variants. |
| `normalizeAppLoadHandlers(handlers)` | array | Filters and normalizes application-load actions. |
| `populateValueSourceOptions(select, allowItem = true)` | void | Rebuilds source selector options. |
| `normalizeClassNames(value)` | string | Filters/deduplicates valid CSS class names. |
| `normalizeLocalizedContent(value)` | object | Keeps Arabic/English string localizations only. |
| `defaultBorderRadius(type)`, `getElementFontSize(element)`, `getElementSizeScale()` | number | Resolve type/theme/scale defaults. |
| `normalizeSpacing(value, fallback = 0, max = 100)`, `normalizeAppSpacing(settings)` | object/number | Clamp and normalize per-side spacing. |
| `getSpacingValue(styles, side, kind)`, `getSpacingCss(styles, kind)`, `getScaledSpacingCss(styles, kind)` | number/string | Resolve a side and generate CSS spacing values. |
| `getLocalizedContent(element, language = state.settings.appLanguage)` | string | Read localized content with base-content fallback. |
| `getAsset(assetId)`, `getImageSource(element)` | object/string | Find asset and resolve an image source. |
| `loadProject()` | project object | Load, validate, migrate, and normalize saved project; logs and defaults on invalid storage. |
| `loadRequests()` | request array | Load/validate persisted API requests, or return defaults/empty list on error. |
| `createId()`, `createPageId()` | string | Generate unique element and page IDs. |
| `isContainer(element)`, `isInsideCollection(element)` | boolean | Check container status or collection ancestry. |
| `getAbsoluteLayoutChildAlignment(element)`, `getPreviewItemContext(element)` | object/null | Resolve parent-based child placement or current preview row context. |
| `normalizeExtraData(value)` | array | Validate/deduplicate element extra-data records. |
| `pruneElementAttributes(elements)` | array | Remove fields unsupported by each type/parent and normalize elements. |
| `pruneSavedComponents(components)` | array | Normalize saved reusable component records. |
| `removeDefaultProperties(value, defaults, requiredKeys = [])` | object | Remove redundant defaults while preserving required keys. |
| `getDefaultElementOutputValues(element)`, `pruneProjectElementsForOutput(elements)`, `pruneProjectForOutput(project)` | object/array | Compact project model for export. |
| `clearOrphanedItemBindings()` | void | Remove item-only references outside a Collection. |
| `createElement(type)` | element object | Construct a complete typed element with defaults and prune unsupported fields. |
| `normalizeOptions(value, singleSelection = false)` | array | Validate and normalize select/radio options, preserving the optional `selected: true` default marker and limiting single-choice controls to their first marked option. |
| `getFormName(element)` | string | Resolve the runtime form field name. |
| `saveProject()` | void | Persist current editor project to localStorage and update save status. |
| `scheduleSave()` | void | Debounce project persistence. |
| `clampNumber(value, min, max, fallback)` | number | Parse and clamp numeric settings. |
| `normalizeDimension(value)` | string | Validate supported CSS dimension syntax. |

### History, localization, rendering, preview

| Function (parameters) | Inferred return | Responsibility |
|---|---|---|
| `translateEditorText(value)`, `applyEditorLanguage()` | string/void | Translate editor strings and refresh UI language/direction. |
| `setEditorLanguage(language)`, `setAppLanguage(language)`, `applyPreviewLanguageDirection()` | void | Persist/apply editor language or update app-preview language and direction. |
| `recordElementHistory()`, `restoreElementHistorySnapshot(snapshot)`, `undoBuilderAction()`, `redoBuilderAction()`, `updateHistoryControls()` | void | Maintain bounded element undo/redo history and toolbar state. |
| `escapeHtml(value)` | string | Escape HTML text/attribute data. |
| `highlightCssSource(source)`, `highlightHtmlSource(source)` | string | Produce escaped syntax-highlighted editor markup. |
| `refreshCodeEditor(textarea)`, `setupCodeEditors()` | void | Synchronize layered code editor rendering and listeners. |
| `safeCustomHtml(value)` | string | Sanitize custom component markup. |
| `scopeCss(css, scope)` | string | Scope CSS selectors to a component/app selector. |
| `customComponentClass(componentId)`, `buildCustomComponentStyles()`, `buildAdditionalComponentStyles(scope)`, `buildSharedPreviewStyles()` | string | Build CSS scopes and shared preview/export styling. |
| `safeColor(value, fallback)`, `getElementThemeColor(element, property)` | string | Validate colors and resolve theme-aware element colors. |
| `safeImageUrl(value)` | string | In the editor and generated runtime, accept safe image URL/data forms or return empty string; runtime image-property actions use this helper to validate image sources and asset URLs. |
| `readPath(value, path)`, `readValuePath(value, path)` | value/undefined | Read dot-paths from objects; second helper applies optional nested value path. |
| `formatBoundValue(value, fallback)` | string/value | Format a value for a bound element. |
| `getPreviewTokenValue(reference, itemContext, visited)`, `getPreviewExtraValue(reference, itemContext, visited = new Set())` | value | Resolve preview tokens and extra-data dependency chains. |
| `getElementSourcePropertyOptions(element)`, `getPreviewElementPropertyValue(elementId, property)` | array/value | Enumerate/read preview-bindable properties. |
| `getRawElementValue(element, formValues = new Map(), itemContext = null)`, `getElementValue(element, formValues = new Map(), itemContext = null)` | value | Resolve raw/bound values for preview, including form and item contexts. |
| `isJsonObjectValue(value)`, `sameBoundValue(left, right)` | boolean | Classify values and compare bound values. |
| `updateBindingObjectPathVisibility(element)`, `updateVariablePropertyPathVisibility(variable = selectedVariable())` | void | Toggle inspector path controls. |
| `getPreviewVariableValue(variable, formValues, itemContext, visited = new Set())`, `getVariableEditorPreviewValue(variable)` | value | Resolve variable previews while detecting recursion. |
| `getListOptions(element)`, `getCollectionItems(element)` | array | Resolve preview options/records. |
| `renderElementTree()` | void | Rebuild hierarchical element tree. |
| `moveTreeElement(id, direction)` | void | Reorder a sibling from the tree UI. |
| `renderPreview(updateProperties = true)` | void | Render selected page, nodes, selection, and preview properties. |
| `createPreviewHeader()`, `createGreeting()`, `createWelcomeCard()` | DOM node | Build preview-only header/demo nodes. |
| `collectPreviewFormValues()` | object | Gather preview form values for binding resolution; an unselected single List View is present with an empty-string value. |
| `renderPageOptions()`, `selectPage(pageId)`, `addPage()`, `deleteCurrentPage()` | void | Maintain editor page selection and CRUD. |
| `sourceIsDynamic(source = {})` | boolean | Determine whether a preview source requires runtime data. |

### Import/export, assets, components, and inspector

| Function (parameters) | Inferred return | Responsibility |
|---|---|---|
| `exportProjectJson()` | void | Download the editable project JSON. |
| `validateImportedProject(project)` | normalized project/throws | Validate import schema and reject invalid structures. |
| `importProjectFile(file)`, `importProjectData(project)` | Promise<void> | Read/validate/import a project file or object. |
| `loadProjectGallery()`, `loadGalleryProject(file)` | Promise<void> | Fetch gallery index and import a selected sample. |
| `formatAssetSize(size)` | string | Present a byte count. |
| `assetArchivePath(asset)` | string | Choose ZIP path for an asset. |
| `isJavaScriptAsset(asset)`, `isFunctionAssetInUse(assetId)` | boolean | Classify JavaScript assets and check references. |
| `readFileAsDataUrl(file)` | Promise<string> | Read a file as a data URL. |
| `renderAssets()` | void | Render asset list and actions. |
| `addAssets(files)` | Promise<void> | Validate file sizes/types and add assets. |
| `renderExtraDataFields(element)` | void | Render key/value controls for extra data. |
| `getConditionActionLists(action = {})` | object | Normalize `actions` and `elseActions` arrays, including legacy effect. |
| `renderProperties()` | void | Populate app or element inspector from current selection. |
| `initializeEventHandler(handler)` | object/void | Initialize defaults for a chosen action type. |
| `renderEventHandlers(action = {}, { appLoad = false } = {})` | void | Render event/action editors, including nested condition actions. |
| `moveEventHandler(index, direction, appLoad)` | void | Reorder a primary/additional element action or app-load action while preserving sequence semantics. `direction` is `up` or `down`. |
| `renderConditionOptions(action = {}, root = document)` | void | Populate condition selectors and source-specific controls. |
| `renderTwkOptions()`, `renderEndpointOptions()`, `renderVariableOptions(selectedId = "")` | void | Refresh TWK/request/variable option lists. |
| `updateAppLoadHandlerField(field)`, `updateAppLoadConditionField(field)`, `updateAppLoadConditionAction(field)` | void | Persist app-load handler, condition, and nested branch edits from the app-properties panel. |
| `selectedVariable()` | variable/null | Find the selected variable. |
| `renderVariableList()`, `renderVariableForm()` | void | Render variable list and editor. |
| `updateVariableSourceFields(source)` | void | Show source-specific variable inputs. |
| `addVariable()` | void | Create/select a new variable. |
| `replaceVariableReferences(oldName, newName)` | void | Update references after a variable rename. |
| `saveVariable()` | void | Validate and persist the variable form. |
| `updateColorLabels()` | void | Synchronize color values and visible labels. |
| `focusSelectedPreviewElement(id)` | void | Focus/scroll an element in the preview. |
| `setElementSelection(ids, primaryId = ids[ids.length - 1] || null)`, `clearElementSelection()`, `selectAllElements()`, `selectElement(id, focusPreviewElement = true, additive = false)` | void | Manage single/multiple element selection and inspector state. Ctrl/Cmd/Shift-click toggles additive selection. |
| `addElement(type, beforeId = null, parentId = null, customComponentId = "")` | element/void | Create and insert an element, optionally nested or before a sibling. |
| `deleteSelected()`, `duplicateSelected()` | void | Delete all selected elements and their descendants in one operation, or duplicate the primary selection. |
| `getSelectedElementRoots(selectedIds)`, `getElementSubtreeIds(rootIds)` | array | Reduce multi-selection to roots and enumerate descendants. |
| `copySelectedElements(showFeedback = true)`, `pasteCopiedElements(showFeedback = true)` | boolean/void | Copy/paste selected structures with remapped IDs/references. |
| `remapCopiedElementReferences(value, idMap, key = "")` | value | Recursively remap copied IDs in stored values. |
| `moveElement(draggedId, targetId, placeAfter, parentId = null)` | void | Move an element before/after/into a target. |
| `showToast(message)` | void | Show a transient editor notification. |
| `renderCustomComponents()` | void | Render saved component palette. |
| `openCustomMarkupDialog(component = null)`, `openSaveComponentDialog()` | void | Open custom HTML/CSS or save-component dialogs. |
| `saveSelectedComponent(name)` | void | Save selected layout subtree as reusable component. |
| `addSavedComponent(componentId)` | void | Add a saved component instance. |
| `syncSavedComponentInstances(component, templateElements)` | void | Synchronize a component definition into all its instances, preserving instance/page IDs and remapping internal references. |
| `startSavedComponentEditing(instanceId)` | void | Enter preview edit mode for one saved component instance and defer autosave. |
| `applySavedComponentEditing(saveChanges)` | void | Apply the edited instance to the shared template and all instances, or restore the template when `saveChanges` is false. |
| `renderThemeFields()`, `renderSettingsFields()`, `applyTheme()` | void | Render and apply app theme/settings controls. |
| `renameElementId(element, nextId)` | void | Update element ID and dependent references. |
| `syncSelectedSharedProperty(element, control)`, `updateSelectedElement(event)` | void | Apply shared inspector property changes to the current multi-selection; validate, rerender, and persist edits. |

### API editor and generated app

| Function (parameters) | Inferred return | Responsibility |
|---|---|---|
| `getSelectedRequest()` | request/null | Return the selected editor request. |
| `renderRequestList()`, `renderApiEditor()` | void | Render request list and selected request editor. |
| `getRequestParameterEditor(kind)` | HTMLElement/null | Locate the headers or body parameter grid by `kind` (`"headers"` or `"body"`). |
| `renderRequestParameterEditor(kind)` | void | Parse the canonical JSON textarea and render top-level object entries as editable rows; report malformed or non-object JSON in the section status. |
| `appendRequestParameterRow(editor, kind, key = "", value = "")` | HTMLDivElement | Add a key/type/value row, preserve the original body value kind, and attach its searchable token picker. |
| `serializeRequestParameterEditor(kind)` | boolean | Validate non-empty unique keys, serialize the row values back to the canonical request JSON textarea, and synchronize request state; returns `false` when a row is invalid. |
| `setRequestResult(message, status)` | void | Update API test result UI. |
| `newRequest()` | void | Add/select a request with defaults. |
| `syncRequestForm()` | void | Copy request form controls into the model. |
| `parseHelperResult(result, field)` | value/throws | Validate/unwrap a TWK helper response. |
| `getTwkValue(fieldKey, useMock)`, `resolveEditorVariable(name, formValues = {}, visited = new Set())`, `resolveEditorToken(source, key, formValues, useMock)` | Promise<value> | Resolve editor-side TWK, variable, and token values. |
| `resolveTemplate(value, useMock, encodeValues = false, formValues = {})`, `resolveJsonTemplate(value, useMock, formValues = {})` | Promise<string/object> | Resolve interpolated strings or typed JSON request input. |
| `executeRequest(request, useMock = false)` | Promise<response/undefined> | Execute editor/test request and update response/binding state. |
| `responseSummary(data)` | string | Format a request result. |
| `buildStyles()` | string | Generate app CSS. |
| `buildMarkup(assetUrlFor = asset => asset.dataUrl)` | string | Generate page/element HTML from model. |
| `buildScript()` | string | Generate the standalone app runtime script. |
| `getExportContent(tab)` | string | Select HTML, CSS, or JS export content. |
| `buildHtmlFile()` | string | Assemble standalone HTML with project model and runtime. |
| `refreshExportCode()` | void | Update export dialog preview. |
| `initializeApp()` | Promise<void> | Runtime bootstrap: language, load requests, Splash exit, bindings, app-load actions. |

### Token picker

| Function (parameters) | Inferred return | Responsibility |
|---|---|---|
| `getWorkflowTokenOptions(element)` | source[] | Build categorized token sources from form fields, TWK fields, variables, API responses, current Collection item, and the active element context. Element-specific sources are omitted when that context is unavailable. |
| `renderTokenPickerOptions(query = "")` | void | Filter the current token sources by label or token string and update the picker’s category list and empty state. |
| `openTokenPicker(target, element = null)` | void/throws | Set the active text target and element context, render the initial list, show the dialog, and focus search. Throws when `target` is not an input or textarea. |
| `attachTokenPicker(input, element, label = "Insert token")` | HTMLElement | Wrap a text input with the reusable token-picker trigger and return the wrapper. |
| `insertWorkflowToken(field, token)` | boolean | Insert a token at the current selection, dispatch a bubbling `input` event, and return `false` for non-text fields. |

### Exported runtime: pages, values, controls, requests

Standalone exports prefer widely supported `div`, `button`, and `span` markup for app containers, accordions, progress indicators, message dialogs, and collection templates instead of newer native elements. This improves compatibility with older embedded WebViews; custom plugin HTML retains its authored markup.

| Function (parameters) | Inferred return | Responsibility |
|---|---|---|
| `applyAppLanguage()`, `applyElementLocalizations(root = document)` | void | Set app direction/language and localized content. |
| `localizeAppMessage(message)` | string | Localize runtime messages. |
| `setStatus(message)` | void | Update runtime request/status text. |
| `showPage(pageId, recordHistory = false)`, `goBackPage()` | void/string | Navigate, manage history, and refresh progress visibility. |
| `closeSheet()` | void | Hide current sheet and backdrop. |
| `showSheet(sheetId)`, `hideSheet(sheetId)`, `showToastElement(toastId)` | object | Show/hide a configured Sheet or display a Toast; returns action metadata. |
| `normalizeGalleryResponse(response, mode)` | array/null/throws | Unwrap the Tawakkalna response and validate its `{type:"image", mime_type, data}` records; limit single-selection responses to one image, return `null` for cancellation, and map documented 401/400 errors to permission/10 MB guidance. |
| `openFilePicker(picker)` | Promise<void> | Open native gallery, normalize result, and update picker value. |
| `changeElementProperty(targetId, property, value, elementContext = null)` | void | Apply supported runtime property changes, including Image `src`/`assetId`, scoped to the invoking Collection row when the target belongs to that Collection. |
| `runTwkSystemAction(action)` | Promise<{granted:boolean}> / Promise<{type:string,result:unknown}> | Invoke a parameterless Tawakkalna helper action; normalize permission responses and return the screenshot helper result. |
| `getRuntimeElementTargets(targetId, elementContext = null)` | array<Element> | Resolve element instances; use the current row for same-Collection targets and all matching elements otherwise. |
| `showMessageDialog(title, message)` | void | Display accessible message dialog. |
| `updateApiProgressIndicator()`, `showApiProgress()`, `hideApiProgress()` | void | Render progress overlay based on preference, active request count, and Splash state. |
| `showErrorPage(message)` | void | Record error, show Error page, and update message. |
| `parseHelperValue(value, responseKey)`, `getTwkValue(key)` | value/Promise<value> | Parse/resolve Tawakkalna helper values. |
| `resolveVariableValue(name, formValues = {}, elementContext = null, visited = new Set())` | Promise<value> | Resolve runtime variable source, path, and dependencies. |
| `resolveApiValue(key)` | Promise<value> | Resolve a request response token/path. |
| `resolveString(value, encodeTokens, formValues = {}, elementContext = null)` | Promise<string> | Resolve tokens inside a string, optionally URL-encoding. |
| `readPath(value, path)`, `readValuePath(value, path)` | value/undefined | Read nested response/object paths. |
| `populateList(select, data, config)`, `populateRequestLists(requestId, data)` | void/Promise<void> | Populate select controls and API-backed list sources. |
| `populateCollection(collection, items)`, `initializeStaticCollections()` | Promise<void> | Render Collection rows and initialize static rows. |
| `runCollectionItemActions(item, eventName)` | Promise<void> | Run matching, non-bubbling Collection lifecycle actions for the elements in one rendered row. |
| `displayValue(value)` | string | Format runtime values for display. |
| `loadFunctionScript(assetId)` | Promise<void> | Load a JavaScript asset once before invoking it. |
| `getNamedGlobalFunction(name)` | function/throws | Resolve a valid callable function from `window`. |
| `runFunctionAction(action, formValues, elementContext)` | Promise<value> | Resolve arguments, call the configured function, and optionally store result. |
| `normalizeFilePickerValue(value)` | array | Normalize native gallery values. |
| `applyBoundValue(element, value)`, `applyDataBoundValue(element, value)` | void | Apply resolved values to live elements and controls. |
| `getRuntimeElementPropertyValue(elementId, property, elementContext)`, `getRuntimeContextElementId(elementContext)` | value/string | Read an element property or identify the action-invoking element with collection-row context. |
| `updateElementPropertyBindings(root = document)`, `updateFormBindings(formValues = collectFormValues(), root = document)` | void/Promise<void> | Refresh element and form-driven bindings. |
| `hasUnavailableExtraDataDependency(value, formValues, elementContext, visited = new Set(), collectionContextId = "")` | boolean | Detect unresolved/cyclic extra-data dependencies. |
| `getCollectionIdFromContext(elementContext)`, `getExtraDataContext(elementId, elementContext)` | string/object | Resolve current Collection and extra-data context. |
| `updateExtraBindings(formValues = {}, root = document)` | Promise<void> | Resolve and apply element extra-data bindings. |
| `isVariableDataReady(variable, visited = new Set())` | boolean | Check whether source data exists without a dependency loop. |
| `updateVariableBindings(formValues = {})` | Promise<void> | Resolve variables and refresh dependent elements. |
| `readFormValue(control)`, `collectFormValues()` | value/object | Read active-page and visible same-page Sheet controls and build the submission map; an unselected single List View resolves to an empty string and a multiple List View to an empty array. |
| `resolveActionValue(value, formValues = {}, elementContext = null, resolvingExtras = new Set(), resolvingVariables = new Set())` | Promise<value> | Resolve whole-value JSON/tokens for actions. |
| `resolveToken(token)` | Promise<value> | Resolve a single token namespace/path. |
| `resolveConfiguredActionValue(value, formValues, elementContext = null)` | Promise<value> | Parse JSON or resolve a complete token with input errors. |
| `resolveRequestValue(value, formValues = {}, elementContext = null)` | Promise<value> | Resolve request JSON values. |
| `runRequest(request, formValues = {}, elementContext = null)` | Promise<response/undefined> | Execute runtime API request, manage progress, update lists/bindings, emit response/error. |
| `loadTwkBindings()` | Promise<void> | Resolve live TWK-bound elements, lists, and Collections. |
| `isEmptyConditionValue(value)`, `conditionValuesEqual(left, right)` | boolean | Evaluate condition empty/equality semantics. |
| `evaluateCondition(condition, formValues, elementContext = null)` | Promise<boolean> | Resolve source/path and apply the configured comparison operator. |
| `runConditionalEffect(effect, formValues, elementContext = null)` | Promise<object> | Execute a nested conditional action. |
| `getConditionActionLists(action = {})` | object | Normalize nested condition branches. |
| `handleComponentEvent(event)`, `handleComponentEventForElement(event, elementNode)` | Promise<void> | Dispatch a bubbling event to each element in its composed path, then handle that element's primary action, linked requests, and additional handlers. |
| `runInitialRequests()` | Promise<void> | Run enabled startup requests in stored order. |
| `runAppLoadHandlers()` | Promise<void> | Run application-load action handlers. |

`app-runtime.ts` contains the runtime-only functions above as executable TypeScript. `runtime-builder.ts` pairs the compiled function with current project configuration and serializes both into standalone exports; runtime functions are not authored inside a generated string.

### Public browser runtime API

The runtime publishes a frozen `window.TakweenStudio` object for host-page integrations:

| Method | Parameters | Result |
| --- | --- | --- |
| `showMessage(title, message)` | Dialog title and message text | Opens the message dialog. |
| `navigateToPage(pageId)` | Existing page ID | Navigates to the page and returns its ID. |
| `goBack()` | None | Returns the current page ID after going back, or if history is empty. |
| `showSheet(sheetId)`, `hideSheet(sheetId)` | Existing Sheet ID | Opens or closes the Sheet. |
| `showToast(toastId)` | Existing Toast ID | Shows the Toast. |
| `showElement(elementId)`, `hideElement(elementId)` | Existing element ID | Shows or hides the element. |

Methods throw when their target is unavailable. The facade intentionally excludes internal action dispatchers, conditional-action execution, and configured JavaScript-function execution.

## 4. TWK helper reference

`public/js/twkhelper.js` provides helper functions used by Tawakkalna integration. Its implementation is bundled/vendor-maintained; avoid editing it without an upstream/source-of-truth change. The editor/runtime currently calls Tawakkalna field methods by name and expects the helper result format validated by `parseHelperResult()` / `parseHelperValue()`.

| Helper function | Parameters | Inferred return | Purpose |
|---|---|---|---|
| `isValidCurrency(code)` | currency code | boolean | Validate a currency code. |
| `dateString(date)` | date | string | Format a date into the helper’s supported string form. |
| `getPropListOfObject(obj)` | object | array | Enumerate property names. |
| `isValidJSON(jsonString)` | JSON string | boolean | Test JSON syntax. |
| `convertStringToBase64(str)`, `encodeBase64(array)` | string / byte array | string | Base64 encoding helpers. |
| `generateError(errorMessage)` | message | helper error object | Create a consistent error value. |
| `fileToBase64(file)` | File/Blob | Promise<string> | Read and encode a file. |
| `getReturn(httpRequest, rawForce)` | request/result, raw flag | Promise<value> | Normalize a helper HTTP response. |
| `fileEndpointHelper()` | none | helper object/function | Build file endpoint support. |
| `httpHelper(endpoint, rawForce)` | endpoint, raw flag | helper object/function | Build HTTP endpoint support. |
| `shareScreenShot()` | none | Promise<helper response> | Request that Tawakkalna share a screenshot. |
| `askCameraPermission()`, `askGalleryPermission()`, `askUserLocationPermission()`, `askPushNotificationPermission()`, `askUserPreciseLocationPermission()` | none | Promise<helper response> | Request the corresponding Tawakkalna system permission. The app action adapter normalizes success to `{granted:boolean}`. |
| `generateSignatureFromParams(signatureParams, sharedSecret)` | params, secret | string | Generate a request signature. |
| `generateSignatureFromParamsHelper(signatureParams, sharedSecret)` | params, secret | Promise<string> | Asynchronous signature helper. |
| `createDigest(message)` | message | digest value | Create a digest. |
| `createDigestHelper(message)` | message | Promise<digest> | Asynchronous digest helper. |
| `generateHttpHashHeaders(path, method, messageBody)` | path, method, body | headers object | Build HTTP hash/signature headers. |

The helper also contains per-field `loaded()` adapter functions for individual Tawakkalna methods. These are internal repeated callbacks, not a public extension surface; their behavior depends on the corresponding helper field mapping.

## 5. Validation and maintenance checklist

- Run `npm run build` after TypeScript edits and `git diff --check` before review.
- For data-model changes, test new project, legacy project load, JSON export/import, and malformed project input.
- For element changes, test palette insertion, nested selection, properties, preview, copy/paste, serialization, and exported markup.
- For data/runtime changes, test both editor mock preview and exported app with static and dynamic data, including empty/missing paths and API failure.
- For actions, test click/change/input dispatch, order, conditions and both branches, form collection, runtime events, and error navigation.
- For Absolute Layout, test all nine alignment combinations, RTL/LTR direction, dimensions, and nested-container output.
- For API progress, test overlapping requests, request completion/failure, Splash exclusion, and the saved indicator/label settings; also verify the saved error-message setting on Error pages.
