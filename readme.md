# Embedly

> ⚠️ **Disclaimer:** This is an unofficial community and is **not affiliated with, associated with, or endorsed by** the official Tawakkalna team or the Saudi government. This project is maintained by individual contributors as an open-source community initiative.

> **Testing & Code Responsibility Notice:** The generated code has primarily been tested within Tawakkalna Developer Test Utility app. Developers are solely responsible for reviewing, auditing, and verifying all generated code and functionality within the official Tawakkalna environment before releasing their mini apps to ensure complete compatibility, security, and proper data handling.

> ⚠️ **إخلاء المسؤولية:** هذا المشروع مجتمعي وغير رسمي و غير تابع أو مرتبط أو معتمد من فريق توكلنا الرسمي أو الحكومة السعودية. تتم صيانة هذا المشروع من قبل المساهمين الأفراد كمبادرة مجتمعية مفتوحة المصدر.

> **إشعار مسؤولية الاختبار والتعليمات البرمجية:** تم اختبار التعليمات البرمجية التي تم إنشاؤها بشكل أساسي داخل تطبيق Tawakkalna Developer Test Utility. يتحمل المطورون وحدهم مسؤولية مراجعة وتدقيق والتحقق من جميع التعليمات البرمجية والوظائف التي تم إنشاؤها داخل بيئة توكلنا الرسمية قبل إطلاق تطبيقاتهم المصغرة لضمان التوافق الكامل والأمان والتعامل السليم مع البيانات.

# Embedly — User Guide

This guide covers the visual editor and the app it exports. The editor saves the project locally, and exports a standalone HTML app (or the HTML, CSS, and JavaScript separately).

## 1. Start a project

1. Add elements from the **Page elements** palette by clicking or dragging them into the preview. Drag elements onto a supported container to nest them. If the current page has exactly one top-level non-Sheet container, newly added palette elements and saved components default to that container. A Sheet is never chosen implicitly; select it or drop directly onto it to add children there.
2. Select an element in the preview or element tree to edit it in the properties panel. Its clearly labeled action buttons are grouped below the settings: manage events, edit a saved component, save a layout group, duplicate, or delete. Ctrl/Cmd-click or Shift-click to add or remove elements from the selection. Editing a shared property, such as text, color, size, spacing, border, or visibility, applies it to every selected element.
3. Add and name pages in the page toolbar. The built-in Splash page is displayed at startup until the initial load requests finish; the built-in Error page is used for runtime failures. Both can contain your own elements.
4. Use **File > Export app** to copy or download the app. **Export JSON** saves the editable project.

The editor language (Arabic/English) is independent of the app language. Text content can have separate Arabic and English localizations; use the preview language control when editing localized content.

## 2. Editor controls

| Area                 | Purpose                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| File menu            | Open the project gallery, import/export project JSON, export the app, or reset the project.                                     |
| Project menu         | Configure API requests, variables, assets, theme colors, and custom CSS.                                                        |
| Language menu        | Change the editor UI language.                                                                                                  |
| Element palette/tree | Add elements; inspect, select, and reorder elements.                                                                            |
| Preview toolbar      | Choose phone/tablet/full preview size; undo, redo, copy, paste, select all, change app language and theme, and clear selection. |
| Page toolbar         | Select, add, rename, or delete pages. Splash and Error are built-in special pages.                                              |
| Properties panel     | Edit app settings or the selected element. Sections can be expanded/collapsed.                                                  |

When no element is selected, app properties include the service title, organization, element-size scale, per-side app margins/padding, top-bar style, theme colors, app-load event handlers, and toggles for the API progress indicator, its visible loading label, and the default error message.

Use the preview toolbar's theme control to switch between light and dark app appearance. Open **Project > Colors** and choose the light or dark palette to edit its colors independently. The selected mode and both palettes are saved with the project and used in the exported HTML app. In Tawakkalna, the exported app follows the device's `appearance` value (`1` for light, `2` for dark).

Keyboard shortcuts: **Delete** or **Backspace** removes the selection and its descendants (not while editing a field); **Ctrl/Cmd+Z** undo; **Ctrl/Cmd+Shift+Z** or **Ctrl/Cmd+Y** redo; **Ctrl/Cmd+C/V** copy/paste; **Ctrl/Cmd+A** select visible page elements. History retains up to 100 element snapshots and coalesces rapid edits.

## 3. Elements and properties

All elements have a unique ID, content (where applicable), visibility, appearance, spacing, dimensions, and CSS class properties. Available properties depend on the element type. Width/height accept `auto`, `px`, `%`, `rem`, `em`, `vw`, or `vh`; spacing is in pixels. Element backgrounds can be transparent. Hidden elements remain editable in the editor. Interactive elements that support it can be disabled.

### Content and interaction elements

| Element                          | Purpose and type-specific properties                                                                                                                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Title (heading)**              | Heading text; normal content, typography, color, size, spacing, and dimensions.                                                                                                                                                               |
| **Label (text)**                 | Static or data-bound text.                                                                                                                                                                                                                    |
| **Button**                       | Clickable action target; content, action handlers, and Primary/Secondary/Destructive/Ghost/Outline/Custom variant. Custom variant allows a background color.                                                                                  |
| **Input**                        | Form text field; field name, placeholder/content, input type (`text`, `number`, `email`, `tel`, `url`, `password`, `search`, `date`, `time`, `datetime-local`, `month`, `week`, `color`, `range`), min/max, disabled state, and data binding. |
| **Textarea**                     | Multi-line form field; label, field name, placeholder, initial value, required state, row count, and data binding.                                                                                                                                 |
| **List View**                    | Form select; field name, one or multiple selections, static/API/TWK options, label/value paths, default selections, and data binding. Multiple selection returns an array. An unselected single-select field resolves to an empty string.     |
| **Checkbox**                     | Yes/no form control; field name, initially checked, submitted JSON value, and disabled state. Multiple checkboxes can share a field name to produce an array of selected values.                                                              |
| **Radio Button**                 | Single-choice form control; field name, static options or bound item labels/values, default selection, and disabled state.                                                                                                                    |
| **Switch**                       | Boolean form control; field name, initial checked state, submitted value, and disabled state.                                                                                                                                                 |
| **File Picker**                  | Opens the native Tawakkalna image picker; choose one or multiple images and button/dropzone presentation. Selected image records are exposed through `files` and can be bound or submitted.                                                   |
| **Chip**                         | Compact selectable/clickable item; selected state, action, and Primary/Secondary/Success/Warning/Destructive/Outline appearance.                                                                                                              |
| **Badge**                        | Short status label; content and Primary/Secondary/Success/Warning/Destructive appearance.                                                                                                                                                     |
| **Floating Action Button (FAB)** | Prominent action button; content/accessibility label, action, and button variant.                                                                                                                                                             |
| **Toast**                        | Dismissible notification; content and Primary/Secondary/Success/Warning/Destructive appearance. The **Show Toast** action can display a selected Toast.                                                                                       |
| **Loading**                      | An inline decorative loading spinner and optional label. It is not the API request indicator.                                                                                                                                                 |
| **Progress**                     | Progress bar; indeterminate/determinate mode, current value, and maximum. Value and maximum can be changed by action or data binding.                                                                                                         |
| **Breadcrumbs**                  | A short navigation trail; content and standard appearance properties.                                                                                                                                                                         |
| **Divider**                      | A visual separator; standard dimensions, color, and spacing.                                                                                                                                                                                  |
| **Image**                        | Image URL or image asset, `cover`/`contain` fit, alt/content text, dimensions, and data binding.                                                                                                                                              |
| **Icon**                         | Font Awesome icon class such as `fa-star`, plus standard appearance properties.                                                                                                                                                               |

The File Picker uses Tawakkalna's native gallery and returns image records with `type`, `mime_type`, and base64 `data`. If access fails with 401 (`1000006`), enable the **Gallery** permission under **Device Information** in the Tawakkalna portal for the embedded service. A 400 (`1000007`) means the selected file exceeds the 10 MB limit.

### Containers and compositional elements

| Element             | Purpose and type-specific properties                                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Layout**          | Flex container. Set row/column direction, child alignment (start/center/end/stretch), distribution (start/center/end/space-between), and gap.                                                                                                                                                                 |
| **Absolute Layout** | Positioned canvas for overlapping/precisely aligned children. Set its dimensions (default height 200px). Select each direct child to set `horizontalAlignment` (`start`, `center`, `end`) and `verticalAlignment` (`top`, `center`, `bottom`). Horizontal start/end follow the app’s text direction.          |
| **Grid**            | CSS grid container; choose 1–12 columns, gap, child alignment, and distribution.                                                                                                                                                                                                                              |
| **Scroll View**     | A constrained container; choose vertical, horizontal, or both axes and set its height.                                                                                                                                                                                                                        |
| **Collection**      | Repeater. Its direct children form a template rendered once for every record; choose static, API, or TWK records. API sources store the selected request and an optional path to the response array (blank for a root array).                                                                                 |
| **Card**            | Card with separate header, body text, and optional footer. Nest children in the body or set their card slot to Footer.                                                                                                                                                                                        |
| **Accordion**       | Expandable/collapsible container; heading/content, initial open state, and nested children.                                                                                                                                                                                                                   |
| **Tabs**            | Tab container. Add **Tab** children; each Tab’s content is its tab label, and its nested elements form that panel.                                                                                                                                                                                            |
| **Tab**             | A panel belonging to a Tabs parent; set its label/content and nest panel elements beneath it.                                                                                                                                                                                                                 |
| **Sheet**           | Bottom-sheet content container; use **Show Sheet** and **Hide Sheet** actions to control it in the exported app. Form fields inside a visible Sheet participate in bindings and action submissions. A Sheet nested in a Collection row keeps that row's item data when opened by an action from the same row. |
| **Custom Element**  | Reusable saved HTML/CSS component. Add components in **Your components**, then place them like other elements.                                                                                                                                                                                                |

Open **Choose plugins** in the element library to import a plugin ZIP. The Electron app saves imported plugins in its writable user-data `plugin` folder and loads them again on later launches. Browser imports remain available for the current session.

Containers can be nested where allowed. Drag a child into or out of a container to change its parent. Deleting a container also deletes its descendants. Use the element tree to select elements or move siblings up/down. Edit an element's ID in the properties panel.

### Common appearance/layout properties

- **Content/ID:** element text and unique runtime ID. IDs begin with a letter or `_`; permitted remaining characters include letters, digits, `_`, `.`, `:`, and `-`.
- **Visibility/disabled:** hide an element in the app without deleting it; disable supported interactive elements.
- **Text/background colors and transparency;** button-like variant; font size; text alignment.
- **Width/height;** border width/color/radius; CSS classes separated by spaces.
- **Margin and padding:** separate top/right/bottom/left pixel values.
- **Layout fields:** container-specific direction, alignment, gap, grid columns, scroll axis, or Absolute Layout child alignment.

### Token syntax

Supported token namespaces include `twk`, `form`, `var`, `api`, `item`, `self`/`element`, and element extra data. `self` and `element` refer to the element that triggered the current event/action; `self.extra.key` reads its extra data. These element-context tokens are unavailable in app-load actions. A full token preserves the resolved JSON value; tokens embedded within a larger string stringify/format the value. API and object paths use dot-separated segments, including numeric array indexes (`results.0.title`). JSON path helpers return the original value for an empty path and `undefined` when traversal fails.

## 4. Events, handlers, and actions

Select an interactive element and click **Manage Events & Actions** to open the workflow dialog. The workflow canvas shows a **Trigger** node connected to ordered **Action** nodes. Drag an action's output handle to another action's input handle to change its execution order. A **Condition** node has separate **True** and **False** output handles, connected directly to their branch nodes; the False handle is on the left and the True handle is on the right. Each branch node contains its own nested action configuration and add-action control, without extra placeholder nodes. Branch actions run in list order, and a branch can include another **Run action based on condition** action with its own True and False actions. Element triggers are **click**, **change**, and **input**. For elements inside a Collection, **On item render** runs before the row's data bindings and **On item did render** runs afterward. A page-level **App load** trigger runs once after the initial app data setup; configure it from **Manage App Load Events** in application properties.

Define reusable action sequences from **Project > Global actions**. Give each sequence a unique name, choose **Edit workflow**, and add or arrange its steps in the visual workflow editor. Then choose **Call Global Action** in an element, app-load, or conditional action list. Global actions run in order with the caller's form, item, and element context; recursive calls are reported as runtime errors.

Use the canvas controls to zoom, fit the graph, open the minimap, or expand the editor. Scroll over the canvas to pan; hold **Space** and drag to pan as well. Use **Ctrl/Cmd + scroll** or a two-finger pinch to zoom. Drag a node body or header to reposition it; connected edges stay attached, and the node layout saves with the project. Select and press **Delete** to remove a node or connection. Changes save automatically; use **Ctrl/Cmd + S** to save immediately or **Esc** to close the dialog. To insert a context token, select its value in a source node and drag its arrow onto a text parameter field. Token nodes are not connected to action nodes; the token is inserted as interpolation syntax, such as `{{self.content}}`. Current-item tokens are available only for elements inside a Collection; choose a sample field or type a nested item path in the source node. App-load flows omit element and item context.

Available actions:

| Action                    | Behavior / configuration                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| None                      | No operation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Send API request          | Runs a configured API request and exposes the response to bindings.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Open Tawakkalna service   | Calls `TWK.openService(serviceId, values)` with resolved form/action values.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Navigate / Back           | Navigate to a selected page or return to the previous page when available.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Set variable              | Set a static variable to JSON or a resolved data token for the current runtime session.                                                                                                                                                                                                                                                                                                                                                                                                          |
| Change element property   | Change another element’s content, visibility, disabled state, variant, or supported type-specific value (for example an Image URL or image asset, input bounds, Switch checked state, Progress value/max, or an Icon’s Font Awesome class such as `fa-heart`).                                                                                                                                                                                                                                   |
| Condition                 | Compare a value and execute ordered `actions` or `elseActions`; nested conditions are supported in either branch. Sources include static JSON, form, TWK, API, variable, current collection item, extra data, and another element. Operators: equals, not equals, empty, not empty, greater than, less than, contains.                                                                                                                                 |
| Switch                    | Evaluate an element property, variable, form field, API response path, or static value; add multiple match-value cases and an optional default branch, each with its own ordered actions.                                                                                                                                                                                                                                                                                                      |
| Message                   | Display a dialog with resolved title and message.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Show Sheet / Hide Sheet   | Open or close the selected Sheet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Show Toast                | Display the selected Toast.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Call JavaScript function  | Call a named global function, or a named function in a project `.js` asset, with a JSON array of resolved arguments. A selected static variable may receive the return value.                                                                                                                                                                                                                                                                                                                    |
| Call Global Action        | Runs the named reusable action sequence defined in **Project > Global actions**. The sequence accepts the caller's context and cannot call itself recursively.                                                                                                                                                                                                                                                                                                                                   |
| Tawakkalna system actions | **Share Screenshot** calls `shareScreenShot`. Permission actions (**Request Camera Permission**, **Request Gallery Permission**, **Request Location Permission**, **Request Push Notification Permission**, and **Request Precise Location Permission**) call their matching Tawakkalna method without parameters and branch automatically: connect the node's **Granted** output to the success path and **Denied** output to the alternative path. No condition or comparison setup is needed. |

Use **Add event** to add another trigger/action flow. File Picker elements also support **On files selected**, which runs only after a successful gallery selection that returns at least one file, and provides the normalized image array as `event.detail.files`. Cancellation and empty results do not update the picker value or dispatch `input`/`onFilesSelected`. A click on a child element also triggers configured click actions on its containing elements, from the child outward. A request can also be linked to a button in API settings; it runs with that button’s matching click event. Actions can use tokens in values, messages, conditions, and function arguments. The `{{self.property}}` token refers to the element that invoked the current action. Errors are surfaced on the Error page and through the exported `embedded-app:error` event.

## 5. Configure API requests

1. Open **Project > API settings** and add a request. Give it a name, an `http:` or `https:` URL, method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`), JSON headers, and optional JSON body.
2. Configure headers and body parameters in the three-column editor: enter a key, choose **Static Value** or **Token Type**, then enter a value or use **Token** to search and insert one. The searchable picker groups available values by source, including form inputs, Tawakkalna, variables, API responses, current Collection items, and the active element where context is available. The **Insert token** control beside the URL uses the same picker.
3. Use `{{twk.field_name}}`, `{{form.field_name}}`, or `{{var.variable_name}}` in URL, headers, and body. A complete URL token (for example `{{var.api_url}}`) can supply the entire URL; tokens inserted into a URL path or query are URL-encoded. In JSON, a whole-token value preserves its type; for example an array token remains an array rather than becoming a string.
4. The parameter editor supports top-level JSON objects. Use **Advanced JSON** to edit nested structures or arrays; switching between the editor and advanced JSON preserves JSON values where possible.
5. Enable **Allow run on app open** for startup requests. They run in displayed order while Splash remains visible. Otherwise trigger the request from an element action or request link.
6. Use **Test request** to make a real browser request. The API must allow CORS from the editor origin.
7. Bind response data using a request and response path, for example `data.profile.full_name` or `results.0.title`. Request IDs are internal identifiers for tokens such as `{{api.requestId.data.status}}`.

The exported app displays a centered progress indicator while API requests are active, except while Splash is the active page. Turn it on/off in **App properties > Show progress indicator during API requests**. This setting does not change the separate inline Loading element.

Never put private credentials or secrets in a browser-exported app. Use a trusted backend/proxy for secrets. Do not treat `Access-Control-Allow-Origin` as a request header to bypass server CORS policy; configure CORS on the API server.

## 6. Variables and data binding

Open **Project > Variables** and create a variable with a unique name (letters, digits, `_`, beginning with a letter or `_`). Available sources:

| Source           | Configuration                                                |
| ---------------- | ------------------------------------------------------------ |
| Static           | Valid JSON: string, number, boolean, null, array, or object. |
| Form             | A field on the current page.                                 |
| TWK              | A Tawakkalna helper field.                                   |
| API response     | Request plus response path.                                  |
| Saved variable   | Another variable. Avoid circular dependencies.               |
| Current item     | A path in the current Collection record.                     |
| Extra data       | A named extra-data value from an element.                    |
| Element property | A supported property of another element.                     |

Use `{{var.name}}` in content, request inputs, extra-data values, and action values. Content bindings also have a source picker. Supported sources include static content, form, TWK, API, variable, current item, extra data, and an element property. Optional **JSON property path** extracts nested values (`profile.name`, `results.0.title`); leave it blank to keep the whole value. The preview uses sample TWK data where possible; exported app values are read at runtime.

Element-property bindings support properties available for that element (for example content and visibility; File Picker `files` and `mode`; Input `value`, `min`, `max`, `isValid`, and `characterCount`; Checkbox/Switch `checked` and `value`; List/Radio `value`, `selectedLabel`, and `options`; Progress `value`, `min`, and `max`; Accordion open state; and Chip selection). Choose a source element and property, then the destination updates when the source changes.

In an element event or action, use `{{self.property}}` to read the live value/state of the element that triggered the workflow. `{{element.property}}` is an equivalent alias. The workflow token picker lists `self.id`, `self.content`, and the supported properties for the selected component; property keys are shown in English. Examples include `{{self.files}}`, `{{self.isValid}}`, `{{self.selectedLabel}}`, and `{{self.options.0.value}}`. `{{self.dataset.someAttribute}}` reads a `data-some-attribute` attribute from the component or its native form control; `self.data` and `self.dataAttributes` expose the merged dataset. File Picker selected Tawakkalna image records are exposed as `files`; use `{{self.files}}` rather than `{{self.value}}`. For a multi-select List, `value` and `selectedLabel` are arrays; for a single select they are scalar values. `options` is an array of `{label, value, selected, disabled}` records. `self`/`element` use the active repeated item when the triggering element is inside a Collection.

### Extra data

Select any element and expand **Extra data**. Add one or more key/value pairs. Keys must be unique and use letters, digits, `_`, or `-`, beginning with a letter or `_`. Values may be static text or tokens. Reference a value in bindings as an Extra data source or in an expression as `{{elementId.extra.key}}`. Values can use form, TWK, API, variable, and Collection item tokens. An extra-data value referencing a collection item has the active row context inside the collection; outside it, the most recently selected row is used.

## 7. Collections, lists, and item binding

### Repeating a Collection template

1. Add a **Collection** and set its source to static JSON, API response, or TWK. For an API source, choose the request and enter the response-array path if the array is nested (for example, `data.items`); leave it blank for a root-level array.
2. Supply the record array directly (or choose an API request and array path / TWK array field).
3. Nest child elements under the Collection. These children are the repeated template; nested containers (including Sheets) are supported.
4. For each child’s content binding, choose **Current item** and specify a path such as `title` or `user.name`. For item-aware checkbox/radio controls, set the item label and value paths (for example `name` and `id`).

The preview displays configured sample/static rows; the exported app instantiates the template for each row and supplies the row as item context. Each repeated node keeps its element ID and also receives collection-instance context internally. Collection item values can feed variables, actions, extra data, and form controls.

### List View choices

Set a List View’s source to static, API, or TWK. For dynamic sources choose the request/field and the path to the array. Set **label path** and **value path** inside each item; leave paths empty for primitive values. If the value path is empty for an object, the whole item is submitted. The selected value retains its JSON type. Single select returns one value; multiple select returns an array.

For static choices, use a JSON array of `{ "label": "Shown text", "value": "submitted-value" }`. Add `"selected": true` to an option to select it by default. A multiple List View may mark several options; a single List View and Radio Button use only the first marked option. Checkbox choices use the same label/value structure.

## 8. Assets, custom CSS, and custom components

### Assets

Open **Project > Assets** and add image, JavaScript, or other supported files. Assets are stored in the project, included in project JSON, and packaged under `assets/` in the exported ZIP. Images can be selected in an Image element. A JavaScript asset may be selected as the source for a function action; define a callable global such as `window.myFunction = function (...) { ... }`. Scripts are loaded on demand by the exported runtime. The total stored asset limit is 2 MB; do not delete an asset still referenced by an action.

### Custom CSS and HTML/CSS components

Use **Project > Custom CSS** for app-wide styles. Assign one or more CSS classes in an element's properties, then target them in Custom CSS (for example, `.notice-panel { background: #eef7f3; }`). Custom CSS declarations override the builder's default inline appearance styles in both preview and exported apps. Add a reusable component under **Your components** with HTML and CSS, then place it from the custom component palette. Component CSS is scoped to the component. Custom HTML is sanitized to remove script tags and inline event attributes; do not use it as an executable-script mechanism. Use a JavaScript asset and function action for supported behavior.

### Editing saved layout components

Save a Layout, Grid, or Absolute Layout group as a component, then add one or more instances from **Your components**. Select an instance or one of its elements and choose **Edit component in preview**. Edit its internal content, properties, and nested layout in the preview. The edit toolbar's **Apply to all instances** updates the saved template and every instance; **Cancel** restores the saved version. While this mode is active, selection is limited to the instance, insertion requires a container inside it, and drag-and-drop cannot move elements outside it.

## 9. Save, import, and export

- Changes are saved automatically in local browser storage. Project JSON import/export moves the editable model between browsers.
- Export the standalone app as ZIP, or copy HTML/CSS/JavaScript from the export dialog.
- The export includes app pages, styles, runtime code, project assets, and the TWK integration. Verify any external API endpoints, CORS settings, and service permissions in the target WebView.
- Runtime events emitted on `document`: `embedded-app:response` (request ID and data), `embedded-app:action` (completed action detail), and `embedded-app:error` (runtime error detail).

## الترخيص (License)

الكود المصدري الخاص بهذا المشروع مرخّص بموجب رخصة **Apache License 2.0** — راجع ملف [LICENSE](./LICENSE) للتفاصيل.
_ملاحظة: يسري هذا الترخيص على الكود المصدري الخاص بـ Embedly فقط، ولا يشمل حزمة SDK الخاصة بمطوري توكلنا أو أي مكتبات خارجية خاضعة لتراخيصها المستقلة._
