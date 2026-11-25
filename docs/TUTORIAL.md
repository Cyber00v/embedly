# Editor Tutorial

This tutorial explains the main areas and tools in Embedly. It covers building
a page, configuring elements and data, creating workflows, and exporting the
finished app.

## 1. Start Here

### 1.1 How the editor is organized

The editor has three main work areas:

1. **Page elements** on the left: search the library, add elements, and inspect
   the element tree.
2. **App preview** in the center: choose a page, arrange elements, and preview
   the app at different screen sizes.
3. **Properties** on the right: edit app settings or the currently selected
   element.

The top bar contains the **File**, **Project**, and **Language** menus. Changes
are saved automatically in the current browser.

### 1.2 A quick first project

1. Add a **Title**, **Input**, and **Button** from the Page elements library.
2. Select each element and set its text, field name, and appearance in
   Properties.
3. Select the button and open **Manage Events & Actions** to configure what it
   does.
4. Add pages or project data if your app needs them.
5. Use **File > Export app** to download the app or inspect its HTML, CSS, and
   JavaScript.

## 2. Top Bar Menus

### 2.1 File

- **Project gallery** opens a list of available starter projects. Selecting a
  project loads it into the editor.
- **Import JSON** loads a previously exported editable project file.
- **Export JSON** downloads the editable project, including its pages, elements,
  workflows, variables, requests, assets, and settings.
- **Export app** opens the app export dialog.
- **Reset** restores the starter project and removes the current browser's saved
  project after confirmation. Export JSON first if you need a backup.

### 2.2 Project

The Project menu opens the shared resources and settings used throughout the
app:

- **API settings**: define requests to web services.
- **Variables**: define reusable static or data-sourced values.
- **Global actions**: create reusable action workflows.
- **Assets**: upload files used by the app.
- **Colors**: edit light and dark theme palettes.
- **Custom CSS**: add app-wide CSS rules.

### 2.3 Language

Use the Language menu to change the editor interface between Arabic and English.
This does not change the app language. The app language is changed separately
from the preview toolbar.

## 3. Page Elements Panel

### 3.1 Search and collapse library groups

Use the search field above the library to filter elements by name. Open or close
each group by selecting its heading. When the search is cleared, the group
visibility returns to its prior state.

Add an element by selecting its card or dragging it into the preview. To nest an
element, drop it onto a supported container. When there is one top-level
container on the page, new elements may be placed inside it automatically.

### 3.2 Library groups and elements

| Group | Element | Use |
| --- | --- | --- |
| Layout & containers | **Layout** | Group children vertically or horizontally. |
| Layout & containers | **Absolute Layout** | Position children within a fixed composition. |
| Layout & containers | **Grid** | Arrange children in a configurable column grid. |
| Layout & containers | **ScrollView** | Place content in a vertically or horizontally scrolling area. |
| Layout & containers | **Card** | Present a header, text, children, and optional footer. |
| Layout & containers | **Accordion** | Show or collapse a content section. |
| Layout & containers | **Tabs** and **Tab** | Create tab navigation and its content panels. Add Tab elements inside Tabs. |
| Layout & containers | **Sheet** | Create a bottom sheet opened or closed by workflow actions. |
| Text & display | **Title** and **Label** | Display headings and text. |
| Text & display | **Image** | Display an image from a URL or uploaded asset. |
| Text & display | **Icon** | Display a Font Awesome icon, such as `fa-star`. |
| Text & display | **Badge** | Display a short status label. |
| Text & display | **Divider** | Separate sections visually. |
| Form elements | **Input** | Collect typed text, numeric, date, and other supported values. |
| Form elements | **Textarea** | Collect multi-line text with a label, placeholder, initial value, required state, and configurable rows. |
| Form elements | **Checkbox** | Collect a yes/no or grouped selection. |
| Form elements | **Radio Button** | Let the user choose one option. |
| Form elements | **Switch** | Collect a boolean choice. |
| Form elements | **File Picker** | Open Tawakkalna's image picker for one or more images. |
| Actions & feedback | **Button** | Run workflows when activated. |
| Actions & feedback | **Chip** | Display a selectable, interactive tag. |
| Actions & feedback | **Floating Action Button** | Display a prominent action button. |
| Actions & feedback | **Loading** | Show an inline loading indicator. |
| Actions & feedback | **Progress** | Show indeterminate or value-based progress. |
| Actions & feedback | **Toast** | Display a dismissible notification. |
| Data & navigation | **Collection** | Repeat a child-element template for each data record. |
| Data & navigation | **List View** | Let users choose from static or data-sourced options. |
| Data & navigation | **Breadcrumbs** | Display a short navigation trail. |
| Data & navigation | **Stepper** and **Step** plugins | Add Step children under Stepper, then add regular elements inside each Step. Stepper displays the active Step's content. |

Plugins can act as containers by setting `acceptsChildren: true` in `plugin.json`
and including a default `<slot></slot>` in `index.html`. The editor inserts
nested elements into that slot. Container plugins can be nested, as with the
bundled Stepper and Step plugins. Set a Step's **Step label** property to
override the matching label from Stepper; an empty label uses Stepper's label.
Bundled plugin names and property controls are localized in English and Arabic.
Calendar and Stepper use the app language by default; their **Language**
property can override it.

### 3.3 Element tree

The tree shows the current page's elements and their parent/child structure.
Select an element name to open its properties. Use the arrow buttons to reorder
siblings and the plus/minus control to collapse or expand a container's
children. Reordering the tree also changes the order in the preview.

### 3.4 Your components

Saved layout components and custom HTML/CSS components appear below the element
tree. Select a component to add an instance to the page. Use the plus button in
the HTML and CSS components heading to create a custom component.

## 4. Preview Canvas

### 4.1 Preview size

Choose **Mobile**, **Tablet**, or **Full** to change the preview width. These
controls affect the editor preview, not the content saved in the project.

### 4.2 Editing controls

- **Undo** and **Redo** move through recent element changes.
- **Copy** and **Paste** duplicate the selected element or selection.
- **Select all** selects the visible elements on the current page.
- **Clear selection** returns the right panel to App properties.

You can select multiple elements with Ctrl/Cmd-click or Shift-click. Shared
properties such as text, color, size, spacing, border, and visibility apply to
all selected elements.

### 4.3 App language and theme preview

Use the language button to switch the app preview between its available
languages. If an element has localized content, edit the text while the
corresponding preview language is active. The language control does not change
the editor interface language.

Use the theme button to preview light or dark appearance. Edit the actual
palette colors from **Project > Colors**.

### 4.4 Pages

Use the page selector to switch the page being edited. The page name field
renames the selected page. Use **Page** to add a page and the trash button to
delete the current page when deletion is allowed.

The built-in **Splash** page is shown during initial app setup and startup
requests. The built-in **Error** page is used to report runtime failures. Both
pages can be customized like other pages.

### 4.5 Reordering and nesting

Drag elements in the preview or use the element tree to change their order.
Drop an element onto a supported container to nest it. Drag it out to remove it
from that container. Deleting a container also deletes its descendants.

### 4.6 Saved-component edit mode

When editing a saved component instance, the edit toolbar limits editing to
that instance. **Apply to all instances** updates the saved component and every
instance. **Cancel** restores the saved version without applying the edits.

## 5. Properties Panel

### 5.1 App properties

When no element is selected, the right panel edits app-wide settings:

- **Service title** and **Organization** identify the app. Their values are
  localized by the active app language; switch the app language to enter each
  translation.
- **Element size** scales app controls.
- **Progress indicator** settings control the request loading indicator and its
  label.
- **Show error message** controls the default runtime error message.
- **Page margins** and **Page padding** set spacing around the app content.
- **Top bar type** chooses a title bar, standard bar, or no bar.
- **App colors** opens the theme palette editor.
- **Manage App Load Events** configures actions that run once after initial app
  data setup.

Click an empty area of the preview or select **Clear selection** to return to
these settings.

### 5.2 Element identity and content

Select an element to edit its **Element ID**, visibility, and content. IDs must
be unique and start with a letter or underscore. Use IDs in workflows and data
references where needed. A hidden element remains editable in the editor but is
not shown in the app.

Some element types show additional content fields. For example, a Card has
separate header/footer fields, a Tab's content is its tab label, and an Image
has URL, asset, and fit controls.

Buttons can also use an optional Font Awesome icon. Its leading side follows
the app language direction, and the button's text-alignment setting positions
the icon and label together.

### 5.3 Appearance

Expand **Appearance** to configure available visual properties:

- Text and background colors, including a transparent background option.
- Ripple effect for supported interactive elements.
- Button-like variants, font size, and text alignment.
- Width, height, margins, and padding.
- Border width, border color, and corner radius.
- CSS class names, separated by spaces, for use in Custom CSS.

Width and height accept values such as `auto`, `100%`, `240px`, `2rem`, or
`50vh`. Spacing values are in pixels.

### 5.4 Layout

Expand **Layout** for container-specific layout controls:

- **Direction** arranges children in a row or column.
- **Alignment** positions children at the start, center, end, or stretch.
- **Item distribution** positions children at the start, center, end, or with
  space between.
- **Gap** sets the spacing between children.
- **Grid** adds a column count.
- **ScrollView** adds scroll axis settings.
- **Absolute Layout** child controls set horizontal Start/Center/End and
  vertical Top/Center/Bottom alignment for the selected direct child.

### 5.5 Field settings

Form elements have a **Field name** used in form tokens and submitted values,
such as `{{form.email}}`. Depending on element type, this section can also
contain:

- Input type and minimum/maximum values.
- Textarea placeholder, default value, required state, and row count.
- Default checked state and checkbox submitted value.
- List multi-select and file picker mode/appearance.
- Progress mode, current value, and maximum.
- Option configuration and default selections.

For static List View and Radio Button options, add `"selected": true` to an
option in the JSON configuration. A single List View or Radio Button uses the
first selected option; a multi-select List View can have several.

### 5.6 Extra data

Expand **Extra data** to add named key/value pairs to an element. Use these
values in bindings and workflows, for example
`{{elementId.extra.status}}`. Values can be text or supported data tokens.

### 5.7 Data sources and bindings

Expand **Data sources** to configure Collections, List Views, and content
bindings. A binding can use:

- Static content.
- A form field.
- Tawakkalna data (TWK).
- An API response.
- A saved variable.
- The current Collection item.
- Extra data.
- A property from another element.

When a source contains an object or array, an optional JSON property path such
as `profile.name` or `results.0.title` selects a nested value. Leave it empty to
use the whole value. Dynamic bindings show sample values in the editor where
available; the exported app resolves them at runtime.

### 5.8 Element actions

At the bottom of the panel, use **Manage Events & Actions** to open the workflow
editor. Depending on the selected element, the panel also offers actions to
edit a saved component, save a layout group as a component, duplicate the
element, or delete it.

## 6. Workflow Editor

### 6.1 Open a workflow

Select an interactive element and choose **Manage Events & Actions**. The
canvas shows generic Trigger nodes connected to Action nodes. The event is set
on each action, so separate actions can handle different events on the same
element.

Use **Add event** to add an action flow. Choose its event from the action's
**Trigger event** selector, for example **Input** or **Change**. You can have
more than one event type for an element. File Picker elements also support
**On files selected**; elements inside Collections can use **On item render**
and **On item did render**.

### 6.2 Order and edit actions

Change an action's **Type** to configure it. Connect action output and input
handles to set execution order. Each event flow runs its action nodes in
sequence. Drag nodes to move them around without changing their order.

Action nodes can be removed with their remove control or by selecting the node
and pressing Delete. Select and delete an edge to remove the connection.
Workflow changes save automatically.

### 6.3 Conditions and branches

A **Run action based on condition** node compares a value using sources such as
form, TWK, API, variable, current item, extra data, another element, or static
JSON. Supported operators include equals, not equals, empty, not empty,
greater than, less than, and contains.

Add actions to the **True** or **False** branch. Branch actions run in order,
and branches can contain another condition. Tawakkalna permission actions have
**Granted** and **Denied** branches.

### 6.4 Available actions

| Action | What it does |
| --- | --- |
| **None** | Performs no operation. |
| **Send API Request** | Runs a configured request and exposes the response to bindings. |
| **Open Tawakkalna Service** | Calls the Tawakkalna service helper with a service ID and JSON values. |
| **Navigate to Page** / **Go Back** | Opens a page or returns to the previous page when available. |
| **Set Variable** | Sets a static variable for the current app session. |
| **Change Element Property** | Changes supported properties such as content, visibility, disabled state, variant, or type-specific values. |
| **Run action based on condition** | Runs True or False branch actions based on a comparison. |
| **Show Message** | Opens a dialog with a title and message. |
| **Show Sheet** / **Hide Sheet** | Opens or closes a selected Sheet. |
| **Show Toast** | Displays a selected Toast element. |
| **Call JavaScript Function** | Calls a named global function or function from a JavaScript asset. |
| **Call Global Action** | Runs a reusable workflow configured under Project > Global actions. |
| **Share Screenshot** | Calls the Tawakkalna screenshot-sharing action. |
| **Request Permission** | Requests a Tawakkalna permission and follows the Granted or Denied branch. |

### 6.5 Global actions and app-load actions

Create a reusable workflow from **Project > Global actions**. Give it a unique
name, select **Edit workflow**, and add its steps. Then choose **Call Global
Action** in an element or conditional action. A global action runs in the
caller's current form, element, and Collection-item context.

Use **Manage App Load Events** in App properties to run actions after initial
app data setup. App-load workflows do not have a caller element or current
Collection item.

### 6.6 Workflow canvas controls

- Zoom with the plus/minus controls, use **Fit view**, or open the minimap.
- Scroll over the canvas to pan. Hold Space and drag to pan; use Ctrl/Cmd+scroll
  or pinch to zoom.
- Drag a node by its body or header to reposition it.
- Expand the editor when you need more workspace.
- Press Esc to close the workflow dialog. Use **Save and close** when finished.

### 6.7 Insert data tokens

Use the token picker or drag a token from a source node into a text field.
Common tokens include:

| Token | Value |
| --- | --- |
| `{{form.field_name}}` | Current form field value. |
| `{{twk.full_name}}` | Tawakkalna helper value. |
| `{{var.variable_name}}` | Saved variable value. |
| `{{api.requestId.data.status}}` | A value from an API response. |
| `{{item.user.name}}` | A property on the current Collection record. |
| `{{self.value}}` | A property of the element that triggered the action. |
| `{{elementId.extra.key}}` | Extra data from a named element. |

Use a complete token without surrounding quotes to preserve JSON values such
as numbers, arrays, and objects. A token embedded in other text is converted to
text. `self` and `item` require their corresponding event context.

## 7. Project Data and Resources

### 7.1 API requests

Open **Project > API settings** and add a request. Configure its name, HTTP
method, URL, optional headers, and optional JSON body. Methods include GET,
POST, PUT, PATCH, and DELETE.

Use the token picker beside the URL and in request parameters to insert
available values. The parameter editor supports top-level JSON key/value pairs;
use **Advanced JSON** for nested objects or arrays. Enable **Allow run on app
open** for startup requests. Use **Test request** to make a real browser
request; the server must allow the editor origin through CORS.

Never put private credentials or secrets in a browser-exported app. Use a
trusted backend or proxy for secrets.

### 7.2 Variables

Open **Project > Variables**, create a variable, choose a source, configure its
value, then save it. Variable names use English letters, digits, and
underscores, and must start with a letter or underscore.

Sources include static JSON, a form field, Tawakkalna data, an API response,
another variable, a Collection item, element extra data, or another element's
property. Use `{{var.name}}` to reference a variable in content, requests, and
actions. Static variables can also be updated by **Set Variable**.

### 7.3 Assets

Open **Project > Assets** and add files. Images can be selected by Image
elements, and JavaScript assets can provide workflow functions. Assets are
included in project JSON and the exported ZIP under `assets/`. The total
browser storage limit for assets is 2 MB.

### 7.4 Theme colors

Open **Project > Colors** to edit the light or dark palette. Choose a palette
mode, change its colors, and select **Done**. Use **Reset default colors** to
restore the built-in palette. The preview theme button switches modes for
testing; Tawakkalna can select the exported mode based on the device appearance.

### 7.5 Custom CSS

Open **Project > Custom CSS** to add app-wide styles. Assign CSS class names to
elements in Properties and target them from the custom stylesheet, for example:

```css
.notice-panel {
  background: #eef7f3;
}
```

Save the CSS to preview it and include it in the exported ZIP as `custom.css`.
The app's `index.html` links to that file. Use the theme color variables,
such as `var(--primary)`, `var(--background)`, and `var(--theme-primary)`;
they follow the active light or dark palette. Expand **Theme color variables**
in the Custom CSS dialog to see and insert the available variables.

### 7.6 Saved layout components

Select a Layout, Grid, or Absolute Layout group and choose **Save group as
component**. Give the component a name. Instances can then be added from **Your
components**. Edit an instance using **Edit component in preview**; apply
changes to all instances or cancel them.

### 7.7 Custom HTML and CSS components

Use the plus button under **HTML and CSS components** to enter a component name,
HTML, and CSS. Save it, then add it from the component library. Custom HTML is
not a way to run JavaScript; use an asset and a function action for supported
script behavior. Use an iframe for external content where appropriate.

## 8. Collections and Lists

### 8.1 Build a Collection

Add a **Collection** and choose a source:

- **Static JSON**: enter an array of records.
- **API response**: choose a request and the path to the records array, such as
  `data.items`.
- **Tawakkalna data**: choose a helper field that returns an array.

Place child elements inside the Collection. The children form a template
repeated for every record. Bind child content to **Current item** and enter a
path such as `title` or `user.name`. For item-aware checkbox or radio controls,
set the item label and value paths, for example `name` and `id`.

### 8.2 Configure a List View

Set the List View source to static, API, or Tawakkalna data. For dynamic
sources, choose the request or field and an array path. Set the label and value
paths inside each record. Leave paths empty for primitive options; an empty
value path on an object submits the whole object.

Static options use JSON records such as:

```json
[
  { "label": "First", "value": 1, "selected": true },
  { "label": "Second", "value": 2 }
]
```

A single-select List View returns one value, while a multi-select List View
returns an array. Checkbox groups with the same field name also return selected
values as an array.

## 9. Save, Import, and Export

### 9.1 Automatic saving

The editor saves changes in the current browser automatically. Use **Export
JSON** to make a portable backup or move the editable project to another
browser. Browser-local project data is not automatically shared across devices.

### 9.2 Export the app

Choose **File > Export app** to open the export dialog. Select the **HTML**,
**CSS**, or **JavaScript** tab to inspect or copy that part of the app. Choose
**Download app** to download the standalone ZIP package.

The ZIP includes the app files, styles, runtime code, project assets, and
Tawakkalna integration resources. Test API URLs, CORS policy, and required
Tawakkalna permissions in the target WebView.

## 10. Helpful Shortcuts and Troubleshooting

### 10.1 Keyboard shortcuts

| Shortcut | Result |
| --- | --- |
| Ctrl/Cmd+Z | Undo. |
| Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y | Redo. |
| Ctrl/Cmd+C / Ctrl/Cmd+V | Copy / paste the selection. |
| Ctrl/Cmd+A | Select visible elements on the current page. |
| Delete or Backspace | Delete the selection, unless focus is in an editable field. |
| Ctrl/Cmd+S | Save immediately. |
| Esc | Close a dialog. |

### 10.2 Common checks

- **A bound value is empty:** confirm the source, variable/request, and JSON
  path. Check that the selected page contains the named form field.
- **A Collection shows no records:** confirm the source returns an array and
  that any API response path points to that array.
- **An API request fails:** check the URL, method, JSON, server response, and
  server-side CORS configuration.
- **A workflow does not run:** confirm the action's event, referenced variable,
  API request, page, or target element still exists.
- **A Tawakkalna permission or File Picker fails:** confirm the corresponding
  permission is enabled for the embedded service in the Tawakkalna portal.
- **A runtime error appears:** inspect the Error page and runtime error event;
  correct the missing or invalid workflow configuration before exporting again.
