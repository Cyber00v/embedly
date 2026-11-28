import assert from "node:assert/strict";
import test from "node:test";
import {
  createEditorState,
  ELEMENT_HISTORY_COALESCE_MS,
  ELEMENT_HISTORY_LIMIT,
} from "../src/editor-state.ts";
import { registerEditorEvents } from "../src/editor-events.ts";
import { createRuntimeBuilder } from "../src/runtime-builder.ts";
import { createPreviewRenderer } from "../src/preview-renderer.ts";
import { createWorkflowActionFields } from "../src/workflow/action-fields.ts";
import {
  ensureWorkflowActionIds,
  getNestedWorkflowBranchNodes,
  getWorkflowActionBranches,
  getWorkflowBranchActions,
  isWorkflowBranchAction,
  serializeWorkflowGraph,
  setWorkflowBranchActions,
} from "../src/workflow/graph.ts";
import { createWorkflowConditionEditor } from "../src/workflow/condition-editor.ts";
import { TemplateEngine } from "../src/template-engine.ts";
import { getRadioGroupValue } from "../src/form-values.ts";
import { EXPORT_HTML_TEMPLATES } from "../src/html-templates.ts";
import { startRuntime } from "../src/app-runtime.ts";
import {
  getElementsOnPage,
  getRequestIdOrDefault,
  getTargetPageId,
} from "../src/workflow/action-selection.ts";
import {
  normalizeLocalizedContent,
  resolveLocalizedContent,
} from "../src/localization.ts";
import {
  createPluginComponent,
  normalizePluginManifest,
} from "../src/plugin-system.ts";

test("defaults send-request actions to the first request and preserves its name", () => {
  const requests = [
    { id: "request-1", name: "Profile API" },
    { id: "request-2", name: "Orders API" },
  ];
  const handler = { type: "request", requestId: "deleted-request" };
  let selectArguments;
  const renderFields = createWorkflowActionFields({
    state: { requests },
    editorLanguage: "en",
    localize: { APIRequest: { en: "API request" } },
  });

  renderFields({
    handler,
    type: { value: "request" },
    title: { textContent: "Action 1" },
    row: {},
    addSelect(...args) {
      selectArguments = args;
    },
  });

  assert.equal(handler.requestId, "request-1");
  assert.deepEqual(selectArguments[1], [
    ["Profile API", "request-1"],
    ["Orders API", "request-2"],
  ]);
  assert.equal(selectArguments[2], "request-1");
  assert.equal(getRequestIdOrDefault(requests, "request-2"), "request-2");
  assert.equal(getRequestIdOrDefault([], "missing"), "");
});

test("scopes change-property element choices to a page and labels them by element name", () => {
  const state = {
    pages: [
      { id: "page-one", name: "One", kind: "page" },
      { id: "page-two", name: "Two", kind: "page" },
    ],
    elements: [
      { id: "button-one", type: "button", pageId: "page-one" },
      { id: "text-two", type: "text", pageId: "page-two" },
      { id: "button-two", type: "button", pageId: "page-two" },
    ],
  };
  const handler = {
    type: "changeProperty",
    targetElementId: "button-two",
    property: "content",
    value: "Updated",
  };
  const selects = new Map();
  const renderFields = createWorkflowActionFields({
    state,
    editorLanguage: "en",
    localize: {
      TargetPage: { en: "Target page" },
      TargetElement: { en: "Target element" },
      Property: { en: "Property" },
      Value: { en: "Value" },
    },
    getElementName: (element) => `type · ${element.id}`,
    normalizeChangePropertyAction() {},
    getChangePropertyOptions: () => [["Content", "content"]],
    getVariantOptions: () => [],
    variantLabels: {},
    isJavaScriptAsset: () => false,
  });

  renderFields({
    handler,
    type: { value: "changeProperty" },
    title: { textContent: "Action 1" },
    row: { append() {} },
    addSelect(field, options, value) {
      const select = { value: value || options[0]?.[1] || "" };
      selects.set(field, { options, select });
      return select;
    },
    addInput() {},
  });

  assert.deepEqual(selects.get("targetPageId").options, [
    ["One", "page-one"],
    ["Two", "page-two"],
  ]);
  assert.equal(selects.get("targetPageId").select.value, "page-two");
  assert.deepEqual(selects.get("targetElementId").options, [
    ["text-two", "text-two"],
    ["button-two", "button-two"],
  ]);
});

test("filters condition source elements using its selected source page", () => {
  const state = {
    currentPageId: "page-one",
    pages: [
      { id: "page-one", kind: "page" },
      { id: "page-two", kind: "page" },
    ],
    elements: [
      { id: "button-one", type: "button", pageId: "page-one" },
      { id: "text-two", type: "text", pageId: "page-two" },
      { id: "button-two", type: "button", pageId: "page-two" },
    ],
  };
  const condition = { elementPageId: "page-two", elementId: "" };
  const pageId = getTargetPageId(
    state,
    condition,
    "elementId",
    "elementPageId",
  );

  assert.equal(pageId, "page-two");
  assert.deepEqual(
    getElementsOnPage(state, pageId).map((element) => element.id),
    ["text-two", "button-two"],
  );
});

test("resolves an unselected radio form field to an empty value", () => {
  const controls = [
    { checked: false, value: "riyadh" },
    { checked: false, value: "jeddah" },
  ];

  assert.equal(getRadioGroupValue(controls, (control) => control.value), "");
  assert.equal(
    getRadioGroupValue(
      [{ checked: false, value: "riyadh" }, { checked: true, value: "jeddah" }],
      (control) => control.value,
    ),
    "jeddah",
  );
});

test("keeps unselected radio handling self-contained in the embedded runtime", () => {
  const runtimeSource = startRuntime.toString();

  assert.match(
    runtimeSource,
    /return selected \? readFormValue\(selected\) : ""/,
  );
  assert.doesNotMatch(runtimeSource, /\bgetRadioGroupValue\b/);
});

test("resolves nested actions in Switch branches with colon-delimited branch IDs", () => {
  const conditionEditor = createWorkflowConditionEditor({
    isWorkflowBranchAction: (action) =>
      isWorkflowBranchAction(action, []),
  });
  const selectedAction = { type: "back" };
  const switchAction = {
    type: "switch",
    cases: [
      {
        id: "ready",
        actions: [
          {
            type: "condition",
            actions: [],
            elseActions: [selectedAction],
          },
        ],
      },
    ],
  };
  const path = conditionEditor.conditionActionPathValue([
    { branch: "case:ready", index: 0 },
    { branch: "elseActions", index: 0 },
  ]);
  const parsedPath = conditionEditor.parseConditionActionPath(path);

  assert.deepEqual(parsedPath, [
    { branch: "case:ready", index: 0 },
    { branch: "elseActions", index: 0 },
  ]);
  assert.equal(
    conditionEditor.getConditionActionAtPath(switchAction, parsedPath),
    selectedAction,
  );
});

test("collects nested condition nodes from condition and switch branches", () => {
  const nestedCondition = {
    type: "condition",
    workflowId: "nested-condition",
    actions: [
      {
        type: "switch",
        workflowId: "nested-switch",
        cases: [
          {
            id: "ready",
            actions: [
              {
                type: "condition",
                workflowId: "deep-condition",
                actions: [],
                elseActions: [],
              },
            ],
          },
        ],
      },
    ],
    elseActions: [],
  };
  const nodes = getNestedWorkflowBranchNodes(
    [nestedCondition],
    (action) => ["condition", "switch"].includes(action?.type),
    "action:root",
    "elseActions",
    "branch:root:elseActions",
  );

  assert.deepEqual(
    nodes.map(({ id, parentConditionId, branch, parentBranchRootId }) => ({
      id,
      parentConditionId,
      branch,
      parentBranchRootId,
    })),
    [
      {
        id: "nested-condition:nested-condition",
        parentConditionId: "action:root",
        branch: "elseActions",
        parentBranchRootId: "branch:root:elseActions",
      },
      {
        id: "nested-condition:nested-switch",
        parentConditionId: "nested-condition:nested-condition",
        branch: "actions",
        parentBranchRootId: "branch:nested-condition:actions",
      },
      {
        id: "nested-condition:deep-condition",
        parentConditionId: "nested-condition:nested-switch",
        branch: "case:ready",
        parentBranchRootId: "branch:nested-switch:case:ready",
      },
    ],
  );
});

test("preserves legacy parent actions while editing nested branches", () => {
  const nestedCondition = {
    type: "condition",
    condition: { source: "element" },
    actions: [],
    elseActions: [],
  };
  const parentCondition = {
    type: "condition",
    effect: nestedCondition,
    elseActions: [],
  };
  const editor = createWorkflowConditionEditor({
    isWorkflowBranchAction: (action) =>
      isWorkflowBranchAction(action, []),
  });
  const nestedPath = editor.parseConditionActionPath("actions:0");

  assert.equal(
    getWorkflowBranchActions(parentCondition, "actions")[0],
    nestedCondition,
  );
  assert.equal(
    editor.getConditionActionAtPath(parentCondition, nestedPath),
    nestedCondition,
  );

  setWorkflowBranchActions(parentCondition, "elseActions", [{ type: "back" }]);
  assert.equal(parentCondition.effect, nestedCondition);

  setWorkflowBranchActions(parentCondition, "actions", [nestedCondition]);
  assert.equal(parentCondition.effect, undefined);
  assert.deepEqual(parentCondition.actions, [nestedCondition]);
});

test("binds branch action fields to their owning condition or switch branch", () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.dataset = {};
      this.children = [];
      this.value = "";
    }

    append(...children) {
      this.children.push(...children);
    }

    replaceChildren(...children) {
      this.children = children;
    }

    setAttribute() {}

    closest() {
      return null;
    }

    querySelectorAll(selector) {
      if (selector !== "[data-condition-action]") return [];
      return this.children.flatMap((child) => [
        ...(child.dataset?.conditionAction ? [child] : []),
        ...(typeof child.querySelectorAll === "function"
          ? child.querySelectorAll(selector)
          : []),
      ]);
    }
  }

  const previousDocument = globalThis.document;
  const previousOption = globalThis.Option;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };
  globalThis.Option = class {
    constructor(label, value) {
      this.label = label;
      this.value = value;
    }
  };

  try {
    const conditionEditor = createWorkflowConditionEditor({
      editorLanguage: "en",
      localize: {},
      twkSystemActionOptions: [],
      isWorkflowBranchAction: (action) =>
        ["condition", "switch"].includes(action?.type),
      getConditionActionLists: (action) => ({
        actions: action.actions || [],
        elseActions: action.elseActions || [],
      }),
    });

    const cases = [
      {
        branch: "actions",
        owner: { type: "condition", actions: [{ type: "back" }] },
      },
      {
        branch: "elseActions",
        owner: { type: "condition", elseActions: [{ type: "back" }] },
      },
      {
        branch: "case:ready",
        owner: {
          type: "switch",
          cases: [{ id: "ready", actions: [{ type: "back" }] }],
        },
      },
    ];

    cases.forEach(({ branch, owner }) => {
      const actionList = new FakeElement("div");
      const addButton = new FakeElement("button");
      addButton.dataset.addConditionAction = branch;
      const action = branch.startsWith("case:")
        ? owner.cases[0].actions[0]
        : owner[branch][0];
      conditionEditor.renderConditionOptions(
        owner,
        {
          closest: () => null,
          querySelector: () => actionList,
          querySelectorAll: (selector) =>
            selector === "[data-condition-action]"
              ? actionList.querySelectorAll(selector)
              : [addButton],
        },
        [],
        {
          index: 0,
          isPrimary: true,
          appLoad: false,
          branchOnly: true,
        },
        [
          {
            branch,
            heading: branch,
            actions: [action],
            listSelector: "#condition-actions",
          },
        ],
      );

      const actionType = actionList.children[0].children.find(
        (field) => field.dataset.conditionAction === "type",
      );
      assert.equal(
        actionType.children.some((option) => option.value === "condition"),
        false,
      );
      const parsedPath = conditionEditor.parseConditionActionPath(
        actionType.dataset.conditionActionPath,
      );
      assert.equal(
        conditionEditor.getConditionActionAtPath(owner, parsedPath),
        action,
      );
      assert.equal(actionType.dataset.eventHandlerIndex, "0");
      assert.equal(actionType.dataset.eventHandlerAppLoad, "false");
      assert.equal(addButton.dataset.conditionActionOwnerPath, "");
      assert.equal(
        conditionEditor.getConditionOwnerForField(owner, addButton),
        owner,
      );
      assert.equal(addButton.dataset.eventHandlerIndex, "0");
    });

    const nestedCondition = {
      type: "condition",
      actions: [{ type: "back" }],
    };
    const outerCondition = {
      type: "condition",
      actions: [nestedCondition],
    };
    const nestedActionList = new FakeElement("div");
    const nestedAddButton = new FakeElement("button");
    nestedAddButton.dataset.addConditionAction = "actions";
    conditionEditor.renderConditionOptions(
      nestedCondition,
      {
        closest: () => null,
        querySelector: () => nestedActionList,
        querySelectorAll: (selector) =>
          selector === "[data-condition-action]"
            ? nestedActionList.querySelectorAll(selector)
            : [nestedAddButton],
      },
      [{ branch: "actions", index: 0 }],
      {
        index: 0,
        isPrimary: true,
        appLoad: false,
        branchOnly: true,
      },
      [
        {
          branch: "actions",
          heading: "True",
          actions: nestedCondition.actions,
          listSelector: "#condition-actions",
        },
      ],
    );
    const nestedActionType = nestedActionList.children[0].children.find(
      (field) => field.dataset.conditionAction === "type",
    );
    assert.equal(nestedActionType.dataset.eventHandlerIndex, "0");
    assert.equal(nestedActionType.dataset.eventHandlerAppLoad, "false");
    assert.equal(nestedActionType.dataset.conditionActionOwnerPath, "actions:0");
    const nestedActionOwner = conditionEditor.getConditionOwnerForField(
      outerCondition,
      nestedActionType,
    );
    assert.equal(nestedActionOwner, nestedCondition);
    assert.equal(
      getWorkflowBranchActions(
        nestedActionOwner,
        nestedActionType.dataset.conditionBranch,
      )[Number(nestedActionType.dataset.actionIndex)],
      nestedCondition.actions[0],
    );
    assert.equal(
      conditionEditor.getConditionActionForField(nestedActionType),
      nestedCondition.actions[0],
    );
    assert.equal(
      conditionEditor.getConditionOwnerForField(
        outerCondition,
        nestedAddButton,
      ),
      nestedCondition,
    );
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousOption === undefined) delete globalThis.Option;
    else globalThis.Option = previousOption;
  }
});

test("routes global-action condition fields through the managed workflow", () => {
  class FakeElement {
    constructor(id = "") {
      this.id = id;
      this.dataset = {};
      this.value = "";
      this.hidden = false;
      this.disabled = false;
    }

    replaceChildren() {}

    closest() {
      return null;
    }
  }

  const controlIds = [
    "property-condition-source",
    "property-condition-request",
    "property-condition-path",
    "property-condition-object-path",
    "property-condition-static-value",
    "property-condition-variable",
    "property-condition-twk-field",
    "property-condition-form-field",
    "property-condition-item-path",
    "property-condition-extra",
    "property-condition-element-page",
    "property-condition-element",
    "property-condition-element-property",
    "property-condition-operator",
    "property-condition-value",
  ];
  const controls = new Map(
    controlIds.map((id) => [`#${id}`, new FakeElement(id)]),
  );
  [
    "#condition-static-fields",
    "#condition-api-fields",
    "#condition-variable-fields",
    "#condition-twk-fields",
    "#condition-form-fields",
    "#condition-item-fields",
    "#condition-extra-fields",
    "#condition-element-fields",
    "#condition-object-path-fields",
    "#condition-value-fields",
    "#condition-actions",
    "#condition-elseActions",
  ].forEach((selector) => controls.set(selector, new FakeElement()));

  const previousOption = globalThis.Option;
  globalThis.Option = class {
    constructor(label, value) {
      this.label = label;
      this.value = value;
    }
  };

  try {
    const conditionEditor = createWorkflowConditionEditor({
      state: {
        currentPageId: "page-one",
        pages: [{ id: "page-one", kind: "page", name: "One" }],
        elements: [],
        requests: [],
        variables: [],
        assets: [],
      },
      editorLanguage: "en",
      localize: {},
      TWK_FIELDS: [],
      variableSourceTypes: [
        "static",
        "endpoint",
        "variable",
        "twk",
        "form",
        "item",
        "extra",
        "element",
      ],
      twkSystemActionOptions: [],
      populateValueSourceOptions() {},
      isInsideCollection: () => false,
      normalizeExtraData: () => [],
      getElementName: (element) => element.id,
      getElementSourcePropertyOptions: () => [],
      getConditionActionLists: (action) => ({
        actions: action.actions || [],
        elseActions: action.elseActions || [],
      }),
      isWorkflowBranchAction: (action) =>
        ["condition", "switch"].includes(action?.type),
    });

    const action = {
      type: "condition",
      condition: { source: "element" },
      actions: [],
      elseActions: [],
    };
    const root = {
      closest: () => null,
      querySelector: (selector) => controls.get(selector),
      querySelectorAll: (selector) =>
        selector === '[id^="property-condition-"]'
          ? controlIds.map((id) => controls.get(`#${id}`))
          : [],
    };

    conditionEditor.renderConditionOptions(action, root, [], {
      index: 2,
      isPrimary: false,
      appLoad: true,
      branchOnly: false,
      globalActionId: "global-action-1",
    });

    const sourceField = controls.get("#property-condition-source");
    assert.equal(sourceField.dataset.globalActionId, "global-action-1");
    assert.equal(controls.get("#condition-api-fields").hidden, true);
    assert.equal(controls.get("#condition-element-fields").hidden, false);
  } finally {
    if (previousOption === undefined) delete globalThis.Option;
    else globalThis.Option = previousOption;
  }
});

test("switch source element choices are scoped to a selected page", () => {
  const state = {
    currentPageId: "page-one",
    pages: [
      { id: "page-one", name: "One", kind: "page" },
      { id: "page-two", name: "Two", kind: "page" },
    ],
    elements: [
      { id: "input-one", type: "input", pageId: "page-one" },
      { id: "input-two", type: "input", pageId: "page-two" },
      { id: "label-two", type: "label", pageId: "page-two" },
    ],
  };
  const handler = {
    type: "switch",
    switchSource: "element",
    switchElementId: "input-two",
  };
  const selects = new Map();
  const renderFields = createWorkflowActionFields({
    state,
    editorLanguage: "en",
    localize: {
      APIRequest: { en: "API request" },
      Element: { en: "Element" },
      Variable: { en: "Variable" },
      FormFieldAlternativeA: { en: "Form field" },
      Value: { en: "Value" },
      SwitchSource: { en: "Source" },
      TargetPage: { en: "Target page" },
      AddSourceElementFirst: { en: "Add an element first" },
      NoMatchingElements: { en: "No matching elements" },
      Property: { en: "Property" },
    },
    getElementName: (element) => element.id,
    getElementSourcePropertyOptions: () => [["Value", "value"]],
  });

  renderFields({
    handler,
    type: { value: "switch" },
    title: { textContent: "Action 1" },
    row: { append() {} },
    addSelect(field, options, value, _ariaLabel, label) {
      const select = { value: value || options[0]?.[1] || "" };
      selects.set(field, { options, select, label });
      return select;
    },
    addInput() {},
  });

  assert.equal(selects.get("switchElementPageId").select.value, "page-two");
  assert.equal(selects.get("switchSource").label, "Source");
  assert.equal(selects.get("switchElementPageId").label, "Target page");
  assert.equal(selects.get("switchElementId").label, "Element");
  assert.equal(selects.get("switchProperty").label, "Property");
  assert.deepEqual(selects.get("switchElementId").options, [
    ["input-two", "input-two"],
    ["label-two", "label-two"],
  ]);
});

test("keeps nested condition and switch branch actions distinct when serializing", () => {
  const firstAction = { type: "back" };
  const secondAction = { type: "navigate", pageId: "page-home" };
  const switchAction = {
    type: "switch",
    cases: [
      {
        id: "case-ready",
        value: '"ready"',
        actions: [firstAction, secondAction],
      },
    ],
    defaultEnabled: true,
    defaultActions: [
      {
        type: "condition",
        actions: [{ type: "back" }],
        elseActions: [],
      },
    ],
  };
  const isBranchAction = (action) =>
    isWorkflowBranchAction(action, []);
  let nextId = 0;
  ensureWorkflowActionIds([switchAction], {
    isBranchAction,
    createId: () => `id-${++nextId}`,
  });

  const actionId = `action:${switchAction.workflowId}`;
  const branch = "case:case-ready";
  const branchRootId = `branch:${switchAction.workflowId}:${branch}`;
  const nodes = [
    { id: "trigger", kind: "trigger" },
    { id: actionId, kind: "action", action: switchAction },
    { id: branchRootId, kind: "branch-root" },
    {
      id: "first",
      kind: "branch-action",
      parentConditionId: actionId,
      branch,
      action: firstAction,
    },
    {
      id: "second",
      kind: "branch-action",
      parentConditionId: actionId,
      branch,
      action: secondAction,
    },
  ];
  const serialized = serializeWorkflowGraph(
    nodes,
    [
      { kind: "sequence", from: "trigger", to: actionId },
      { kind: "branch", from: branchRootId, to: "first", branch },
      { kind: "branch", from: "first", to: "second", branch },
    ],
    isBranchAction,
  );

  assert.deepEqual(serialized[0].cases[0].actions, [firstAction, secondAction]);
  assert.ok(switchAction.workflowId);
  assert.ok(firstAction.workflowId);
  assert.ok(secondAction.workflowId);
  assert.ok(switchAction.defaultActions[0].workflowId);
  assert.ok(switchAction.defaultActions[0].actions[0].workflowId);
  assert.deepEqual(
    getWorkflowActionBranches(switchAction).map(({ key }) => key),
    ["case:case-ready", "default"],
  );
});

test("exports textarea label, placeholder, initial value, required state, and rows", () => {
  const state = {
    elements: [
      {
        id: "textarea-1",
        type: "textarea",
        pageId: "page-home",
        content: "Details",
        fieldName: "details",
        placeholder: "Write details",
        value: "Initial text",
        required: true,
        rows: 6,
        styles: {},
      },
    ],
    pages: [{ id: "page-home", kind: "page", name: "Home" }],
    settings: {
      appLanguage: "en",
      appTopBarType: "none",
      appApiProgressLabel: false,
      appShowErrorMessage: true,
    },
    assets: [],
    userComponents: [],
    requests: [],
  };
  const buildMarkup = createPreviewRenderer({
    TemplateEngine,
    EXPORT_HTML_TEMPLATES,
    state,
    escapeHtml: TemplateEngine.escapeHtml,
    normalizeClassNames: () => "",
    getLocalizedContent: (element) => element.content,
    getElementThemeColor: () => "#ffffff",
    getExportElementThemeColor: () => "#ffffff",
    getExportThemeColor: () => "#ffffff",
    getElementFontSize: () => 16,
    getScaledSpacingCss: () => "0px",
    getSpacingCss: () => "0px",
    clampNumber: (_value, _min, _max, fallback) => fallback,
    safeColor: (_value, fallback) => fallback,
    defaultBorderRadius: () => 0,
    normalizeDimension: () => "",
    getAbsoluteLayoutChildAlignment: () => null,
    getFormName: (element) => element.fieldName,
    inputTypes: [],
    getAsset: () => null,
    safeImageUrl: () => "",
    isInsideCollection: () => false,
    getVariantOptions: () => [],
    getDefaultVariant: () => "",
    normalizeOptions: () => [],
    customComponentClass: () => "",
    safeCustomHtml: () => "",
  });

  const markup = buildMarkup();
  assert.match(markup, /<span data-localize-content>Details<\/span>/);
  assert.match(
    markup,
    /<textarea class="content-textarea" name="details" data-form-name="details" aria-label="Details" placeholder="Write details" rows="6" required[^>]*>Initial text<\/textarea>/,
  );
});

test("resolves missing locales from the first configured translation", () => {
  const localizations = normalizeLocalizedContent({
    fr: "French first",
    en: "English second",
    ar: "Second translation",
  });

  assert.deepEqual(Object.keys(localizations), ["fr", "en", "ar"]);
  assert.equal(
    resolveLocalizedContent(localizations, "de", "Base"),
    "French first",
  );
  assert.equal(
    resolveLocalizedContent(localizations, "ar", "Base"),
    "Second translation",
  );
  assert.equal(resolveLocalizedContent({}, "fr", "Base"), "Base");
});

test("waits for initial collection data before running app-load actions", () => {
  const buildScript = createRuntimeBuilder({
    TWK_FIELDS: [],
    state: {
      elements: [],
      pages: [{ id: "page-home", name: "Home", kind: "page" }],
      settings: {},
      requests: [],
      variables: [],
      assets: [],
    },
    componentRuntimePropertyRegistry: {},
    normalizeExtraData: () => [],
    normalizeLocalizedContent: () => ({}),
    normalizeCollectionDataSource: (source) => source ?? { type: "static" },
    removeDefaultProperties: (value) => value,
    normalizeAppLoadHandlers: () => [],
    isJavaScriptAsset: () => false,
    assetArchivePath: () => "",
    twkSystemActionOptions: [],
    twkPermissionActionTypes: [],
    variantOptionsByType: {},
  });
  const script = buildScript();

  assert.ok(
    script.indexOf("await Promise.all([twkBindingsReady, staticCollectionsReady]);") <
      script.indexOf("await runAppLoadHandlers();"),
  );
  assert.doesNotThrow(() => new Function(script));
});

test("creates editor state and history from the loaded project", () => {
  const project = {
    elements: [{ id: "element-1", type: "text" }],
    pages: [{ id: "page-home", kind: "page" }],
    components: [],
    userComponents: [],
    variables: [],
    assets: [],
    customCss: "",
    theme: {},
    settings: {},
  };
  const requests = [{ id: "request-1" }];
  const { state, elementHistory, collapsedTreeElements } = createEditorState(
    project,
    requests,
  );

  assert.equal(state.elements, project.elements);
  assert.equal(state.requests, requests);
  assert.equal(state.currentPageId, "page-home");
  assert.equal(state.selectedId, null);
  assert.equal(state.workflowEditor.constructor, Object);
  assert.equal(elementHistory.snapshot, JSON.stringify(project.elements));
  assert.deepEqual(elementHistory.undo, []);
  assert.equal(collapsedTreeElements instanceof Set, true);
  assert.equal(ELEMENT_HISTORY_LIMIT, 100);
  assert.equal(ELEMENT_HISTORY_COALESCE_MS, 600);
});

test("registers builder command events with their provided handlers", () => {
  const listeners = new Map();
  const fakeDocument = {
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
  };
  const handlers = {
    undoBuilderAction() {},
    redoBuilderAction() {},
    copySelectedElements() {},
    pasteCopiedElements() {},
    selectAllElements() {},
  };

  registerEditorEvents(fakeDocument, handlers);

  assert.equal(listeners.get("builder:undo"), handlers.undoBuilderAction);
  assert.equal(listeners.get("builder:redo"), handlers.redoBuilderAction);
  assert.equal(listeners.get("builder:copy"), handlers.copySelectedElements);
  assert.equal(listeners.get("builder:paste"), handlers.pasteCopiedElements);
  assert.equal(listeners.get("builder:select-all"), handlers.selectAllElements);
});

test("exports global actions and multiple element events into a runtime script", () => {
  const globalAction = {
    id: "global-action-1",
    name: "name",
    actions: [{ type: "back" }],
  };
  const buildScript = createRuntimeBuilder({
    TWK_FIELDS: [],
    state: {
      elements: [
        {
          id: "button-1",
          type: "button",
          action: { type: "globalAction" },
        },
        {
          id: "button-2",
          type: "button",
          action: { type: "setVariable", value: "true" },
        },
        {
          id: "input-1",
          type: "input",
          action: {
            event: "input",
            type: "none",
            handlers: [
              {
                event: "change",
                type: "setVariable",
                variableId: "variable-1",
                value: "true",
              },
            ],
          },
        },
      ],
      pages: [{ id: "page-home", name: "Home", kind: "page" }],
      settings: { globalActions: [globalAction] },
      requests: [],
      variables: [
        {
          id: "variable-1",
          name: "enabled",
          source: "static",
          value: false,
        },
      ],
      assets: [],
    },
    componentRuntimePropertyRegistry: {},
    normalizeExtraData: () => [],
    normalizeLocalizedContent: () => ({}),
    normalizeCollectionDataSource: (source) => source ?? { type: "static" },
    removeDefaultProperties: (value) => value,
    normalizeAppLoadHandlers: () => [],
    isJavaScriptAsset: () => false,
    assetArchivePath: () => "",
    twkSystemActionOptions: [],
    twkPermissionActionTypes: [],
    variantOptionsByType: {},
  });

  const script = buildScript();

  assert.match(
    script,
    /"GLOBAL_ACTIONS":\[\{"id":"global-action-1","name":"name","actions":\[\{"type":"back"\}\]\}\]/,
  );
  assert.match(
    script,
    /"ELEMENT_ACTIONS":\{"button-1":\{"type":"globalAction"\},"button-2":\{"type":"setVariable","value":"true"\},"input-1":\{"event":"input","type":"none","handlers":\[\{"event":"change","type":"setVariable","variableId":"variable-1","value":"true"\}\]\}\}/,
  );
  assert.match(
    script,
    /"event":"input","type":"none","handlers":\[\{"event":"change","type":"setVariable","variableId":"variable-1","value":"true"\}\]/,
  );
  assert.match(
    script,
    /"VARIABLES":\[\{"id":"variable-1","name":"enabled","source":"static","value":false\}\]/,
  );
  assert.match(
    script,
    /effect\.variableId \|\| VARIABLES\.find\(\(item\) => item\.source === "static"\)\?\.id \|\| ""/,
  );
  assert.match(
    script,
    /configured\.variableId \|\| VARIABLES\.find\(\(item\) => item\.source === "static"\)\?\.id \|\| ""/,
  );
  assert.match(
    script,
    /const globalActionId =\s*effect\.globalActionId \|\| GLOBAL_ACTIONS\[0\]\?\.id \|\| "";/,
  );
  assert.match(
    script,
    /await runConditionalEffect\(\s*action,\s*formValues,\s*elementContext,\s*nextStack\s*\)/,
  );
  assert.match(
    script,
    /const globalActionFormValues = \{\s*\.\.\.collectFormValues\(elementContext\),\s*\.\.\.formValues,\s*\};[\s\S]*?await runActionSequence\(\s*globalAction\.actions,\s*globalActionFormValues,/,
  );
  assert.match(
    script,
    /elementContext\?\.closest\("\.content-collection-item"\)/,
  );
  assert.match(script, /Recursive global action call:/);
  assert.doesNotThrow(() => new Function(script));
});

test("refreshes form values before running a global action", () => {
  const runtimeSource = startRuntime.toString();
  const globalActionStart = runtimeSource.indexOf('case "globalAction": {');
  const globalActionEnd = runtimeSource.indexOf(
    'case "showElement":',
    globalActionStart,
  );
  const globalActionCase = runtimeSource.slice(
    globalActionStart,
    globalActionEnd,
  );

  assert.notEqual(globalActionStart, -1);
  assert.notEqual(globalActionEnd, -1);
  assert.match(
    globalActionCase,
    /const globalActionFormValues = \{\s*\.\.\.collectFormValues\(elementContext\),\s*\.\.\.formValues,\s*\};/,
  );
  assert.match(
    globalActionCase,
    /runActionSequence\(\s*globalAction\.actions,\s*globalActionFormValues,/,
  );
});

test("collects form values from the page containing the action element", () => {
  const runtimeSource = startRuntime.toString();
  const formControlsStart = runtimeSource.indexOf(
    "function getActivePageFormControls(",
  );
  const formControlsEnd = runtimeSource.indexOf(
    "function groupFormControls(",
    formControlsStart,
  );
  const formControls = runtimeSource.slice(formControlsStart, formControlsEnd);

  assert.notEqual(formControlsStart, -1);
  assert.notEqual(formControlsEnd, -1);
  assert.match(
    formControls,
    /contextElement\?\.closest\("\[data-app-page\]"\)/,
  );
  assert.match(
    formControls,
    /contextElement\?\.closest\(ACTIVE_SHEET_SELECTOR\)/,
  );
  assert.match(formControls, /contextPage \|\|/);
  assert.match(formControls, /getActivePageSheets\(pageId\)/);
  assert.match(runtimeSource, /validateRequiredFormFields\(elementNode\)/);
  assert.match(runtimeSource, /formValues = collectFormValues\(elementNode\)/);
});

test("runtime resolves nested Tawakkalna helper responses", () => {
  const runtimeSource = startRuntime.toString();

  assert.match(
    runtimeSource,
    /function parseHelperValue\(result, responseKey\)/,
  );
  assert.match(runtimeSource, /Object\.hasOwn\(data, responseKey\)/);
  assert.match(runtimeSource, /const nested = data\.results \?\? data\.data/);
  assert.match(
    runtimeSource,
    /parseHelperValue\(await method\.call\(window\.TWK\), field\.responseKey\)/,
  );
});

test("runtime preserves missing locales for first-translation fallback", () => {
  const buildScript = createRuntimeBuilder({
    TWK_FIELDS: [],
    state: {
      elements: [
        {
          id: "text-1",
          type: "text",
          content: "Base content",
          localizations: { en: "First translation" },
        },
      ],
      pages: [{ id: "page-home", name: "Home", kind: "page" }],
      settings: { appLanguage: "ar" },
      requests: [],
      variables: [],
      assets: [],
    },
    componentRuntimePropertyRegistry: {},
    normalizeExtraData: () => [],
    normalizeLocalizedContent,
    normalizeCollectionDataSource: (source) => source ?? { type: "static" },
    removeDefaultProperties: (value) => value,
    normalizeAppLoadHandlers: () => [],
    isJavaScriptAsset: () => false,
    assetArchivePath: () => "",
    twkSystemActionOptions: [],
    twkPermissionActionTypes: [],
    variantOptionsByType: {},
  });

  const script = buildScript();

  assert.match(script, /"ELEMENT_LOCALIZATIONS":\{"text-1":\{"en":"First translation"\}\}/);
  assert.match(script, /Object\.values\(localizations\)\.find/);
  assert.doesNotThrow(() => new Function(script));
});

test("embeds executable runtime JavaScript with serialized project configuration", () => {
  const buildScript = createRuntimeBuilder({
    TWK_FIELDS: [
      {
        key: "appearance",
        method: "getDeviceInfo",
        responseKey: "appearance",
      },
    ],
    state: {
      elements: [],
      pages: [{ id: "page-home", name: "Home", kind: "page" }],
      settings: {
        appLanguage: "en",
        appTheme: "light",
        appDarkTheme: { background: "#111827" },
        title: "Default title",
        titleLocalizations: { en: "English title", ar: "العنوان العربي" },
        orgnization: "Default organization",
        organizationLocalizations: {
          en: "English organization",
          ar: "الجهة العربية",
        },
        appApiProgressLabel: true,
        globalActions: [
          {
            id: "global-action-1",
            name: "name",
            actions: [{ type: "back" }],
          },
        ],
      },
      theme: { background: "#ffffff" },
      requests: [],
      variables: [],
      assets: [],
    },
    componentRuntimePropertyRegistry: {},
    normalizeExtraData: () => [],
    normalizeLocalizedContent,
    normalizeCollectionDataSource: (source) => source ?? { type: "static" },
    removeDefaultProperties: (value) => value,
    normalizeAppLoadHandlers: () => [],
    isJavaScriptAsset: () => false,
    assetArchivePath: () => "",
    twkSystemActionOptions: [],
    twkPermissionActionTypes: [],
    variantOptionsByType: {},
  });

  const script = buildScript();

  assert.match(
    script,
    /^\(function startRuntime\(runtimeConfig,\s*[A-Za-z_$][\w$]*,\s*[A-Za-z_$][\w$]*,\s*[A-Za-z_$][\w$]*\)/,
  );
  assert.match(script, /function mountPluginElements/);
  assert.match(script, /async function initializeApp\(\)/);
  assert.match(script, /window\.TakweenStudio = Object\.freeze\(\{/);
  const runtimeApi = script
    .split("window.TakweenStudio = Object.freeze({")[1]
    ?.split("\n  });")[0];
  assert.ok(runtimeApi);
  assert.deepEqual(
    [...runtimeApi.matchAll(/^ {4}([A-Za-z]\w*)(?::|\()/gm)].map(
      ([, name]) => name,
    ),
    [
      "showMessage",
      "navigateToPage",
      "goBack",
      "showSheet",
      "hideSheet",
      "showToast",
      "showElement",
      "hideElement",
    ],
  );
  assert.doesNotMatch(
    runtimeApi,
    /runConditionalEffect|runFunctionAction|callJavaScriptFunction/,
  );
  assert.match(script, /showMessage: showMessageDialog/);
  assert.match(script, /goBack: goBackPage/);
  assert.match(script, /showSheet: \(sheetId\) => showSheet\(sheetId\)/);
  assert.match(script, /hideSheet: \(sheetId\) => hideSheet\(sheetId\)/);
  assert.match(script, /showToast: showToastElement/);
  assert.match(
    script,
    /showElement: \(elementId\) => setElementVisibility\(elementId, true\)/,
  );
  assert.match(
    script,
    /hideElement: \(elementId\) => setElementVisibility\(elementId, false\)/,
  );
  assert.match(script, /"INITIAL_APP_LANGUAGE":"en"/);
  assert.match(script, /"APP_TITLE_LOCALIZATIONS":\{"en":"English title","ar":"العنوان العربي"\}/);
  assert.match(script, /"APP_ORGANIZATION_LOCALIZATIONS":\{"en":"English organization","ar":"الجهة العربية"\}/);
  assert.match(script, /document\.title = appTitle/);
  assert.match(script, /headerOrganization\.textContent = appOrganization/);
  assert.match(script, /"API_PROGRESS_LABEL_ENABLED":true/);
  assert.match(
    script,
    /"GLOBAL_ACTIONS":\[\{"id":"global-action-1","name":"name","actions":\[\{"type":"back"\}\]\}\]/,
  );
  assert.match(
    script,
    /"appearance":\{"method":"getDeviceInfo","responseKey":"appearance"\}/,
  );
  assert.match(script, /getTwkValue\("appearance"\)/);
  assert.match(script, /root\.dataset\.appTheme = theme/);
  assert.match(script, /root\.style\.colorScheme = theme/);
  assert.match(script, /TWK field is not configured: /);
  assert.match(script, /requestedKey === "app_appearnce"/);
  assert.doesNotMatch(script, /APP_THEMES/);
  assert.ok(
    script.includes(
      String.raw`const tokenPattern = /\{\{\s*([^{}]+?)\s*\}\}/g;`,
    ),
  );
  assert.ok(script.includes('const [name, ...path] = key.split(".");'));
  assert.ok(script.includes('readValuePath(value, path.join("."))'));
  assert.doesNotMatch(script, /return `const TWK_SYSTEM_ACTION_TYPES/);
  assert.doesNotThrow(() => new Function(script));
});

test("renders nested plugin containers, sheet children, and an asset-backed app logo", () => {
  const stepperPlugin = normalizePluginManifest(
    {
      id: "test-stepper",
      title: "Test Stepper",
      group: "Test",
      icon: "fa-list-ol",
      acceptsChildren: true,
    },
    "<slot></slot>",
    "",
    "",
  );
  const stepPlugin = normalizePluginManifest(
    {
      id: "test-step",
      title: "Test Step",
      group: "Test",
      icon: "fa-list-ol",
      acceptsChildren: true,
    },
    "<slot></slot>",
    "",
    "",
  );
  const sheet = {
    id: "sheet-1",
    pageId: "page-home",
    type: "sheet",
    content: "Details",
    styles: {},
  };
  const child = {
    id: "text-1",
    parentId: sheet.id,
    pageId: "page-home",
    type: "text",
    content: "Styled text",
    localizations: { en: "English fallback" },
    styles: { color: "#123456", background: "#ffffff" },
  };
  const pluginContainer = {
    id: "stepper-1",
    pageId: "page-home",
    type: "custom",
    customComponentId: stepperPlugin.id,
    content: "",
    styles: {},
  };
  const stepContainer = {
    id: "step-1",
    parentId: pluginContainer.id,
    pageId: "page-home",
    type: "custom",
    customComponentId: stepPlugin.id,
    content: "",
    styles: {},
  };
  const stepChild = {
    id: "step-content",
    parentId: stepContainer.id,
    pageId: "page-home",
    type: "text",
    content: "Inside the step",
    styles: {},
  };
  const iconButton = {
    id: "icon-button",
    pageId: "page-home",
    type: "button",
    content: "Save",
    iconClass: "fa-star",
    styles: { variant: "primary", align: "center" },
  };
  const compatibilityElements = [
    {
      id: "compat-accordion",
      pageId: "page-home",
      type: "accordion",
      content: "Accordion",
      accordionOpen: false,
      styles: {},
    },
    {
      id: "compat-accordion-child",
      pageId: "page-home",
      parentId: "compat-accordion",
      type: "text",
      content: "Accordion content",
      styles: {},
    },
    {
      id: "compat-progress",
      pageId: "page-home",
      type: "progress",
      content: "Progress",
      progressMode: "determinate",
      progressMax: 100,
      progressValue: 30,
      styles: {},
    },
    {
      id: "compat-collection",
      pageId: "page-home",
      type: "collection",
      listSource: { type: "static" },
      styles: {},
    },
    {
      id: "compat-collection-child",
      pageId: "page-home",
      parentId: "compat-collection",
      type: "text",
      content: "Collection item",
      styles: {},
    },
  ];
  const state = {
    elements: [
      sheet,
      child,
      pluginContainer,
      stepContainer,
      stepChild,
      iconButton,
      ...compatibilityElements,
    ],
    userComponents: [
      createPluginComponent(stepperPlugin),
      createPluginComponent(stepPlugin),
    ],
    assets: [
      {
        id: "logo-asset",
        name: "logo.png",
        type: "image/png",
        dataUrl: "data:image/png;base64,AA==",
        size: 1,
      },
    ],
    pages: [{ id: "page-home", kind: "page" }],
    settings: {
      appLanguage: "en",
      appTopBarType: "standard",
      title: "Default title",
      titleLocalizations: { en: "English title", ar: "العنوان العربي" },
      orgnization: "Default organization",
      organizationLocalizations: {
        en: "English organization",
        ar: "الجهة العربية",
      },
      appLogoAssetId: "logo-asset",
      appApiProgressLabel: true,
      appShowErrorMessage: true,
    },
  };
  const buildMarkup = createPreviewRenderer({
    TemplateEngine: { render: () => "" },
    EXPORT_HTML_TEMPLATES: {},
    state,
    escapeHtml: (value) => String(value),
    normalizeClassNames: () => "",
    getLocalizedContent: (element, language) =>
      resolveLocalizedContent(
        element.localizations,
        language,
        element.content,
      ),
    getElementThemeColor: () => "#ffffff",
    getExportElementThemeColor: (element, property) =>
      element.styles[property] || "#ffffff",
    getExportThemeColor: () => "#ffffff",
    getElementFontSize: () => 16,
    getScaledSpacingCss: () => "0px",
    getSpacingCss: () => "0px",
    clampNumber: (value, _min, _max, fallback) => value || fallback,
    safeColor: (value, fallback) => value || fallback,
    defaultBorderRadius: () => 0,
    normalizeDimension: () => "",
    getAbsoluteLayoutChildAlignment: () => null,
    getFormName: () => "",
    inputTypes: [],
    getAsset: (assetId) => state.assets.find((asset) => asset.id === assetId),
    safeImageUrl: () => "",
    isInsideCollection: () => false,
    getVariantOptions: () => [],
    getDefaultVariant: () => "",
    normalizeOptions: () => [],
    customComponentClass: () => "",
    safeCustomHtml: () => "",
  });

  const markup = buildMarkup((asset) => `assets/${asset.id}.png`);

  assert.doesNotMatch(
    markup,
    /<(?:dialog|details|summary|progress|template|main|header|section|nav)(?:\s|>)/i,
  );
  assert.match(markup, /data-accordion-toggle aria-expanded="false"/);
  assert.match(markup, /role="progressbar"[^>]*aria-valuenow="30"/);
  assert.match(markup, /data-collection-template="compat-collection"/);
  assert.match(markup, /<img class="app-logo" src="assets\/logo-asset\.png" alt="">/);
  assert.match(
    markup,
    /<span><strong>English title<\/strong><small>English organization<\/small><\/span>/,
  );
  assert.match(markup, /<div class="content content-text"[^>]*style="color:#123456/);
  assert.match(markup, /English fallback/);
  assert.match(
    markup,
    /<button[^>]*content-button-has-icon[^>]*dir="ltr"[^>]*style="[^"]*justify-content:center[^"]*"[^>]*><i class="fa-solid fa-star" aria-hidden="true"><\/i><span data-localize-content dir="auto">Save<\/span><\/button>/,
  );
  iconButton.styles.align = "end";
  assert.match(buildMarkup(), /justify-content:flex-end/);
  iconButton.styles.align = "center";
  state.settings.appLanguage = "ar";
  assert.match(
    buildMarkup(),
    /<button[^>]*content-button-has-icon[^>]*dir="rtl"[^>]*><i class="fa-solid fa-star" aria-hidden="true"><\/i><span data-localize-content dir="auto">Save<\/span><\/button>/,
  );
  state.settings.appLanguage = "en";
  iconButton.iconClass = "";
  assert.doesNotMatch(buildMarkup(), /content-button-has-icon/);
  assert.match(
    markup,
    /data-plugin-id="test-stepper"[^>]*>\s*<div[^>]*data-plugin-id="test-step"[^>]*>\s*<div[^>]*>[\s\S]*Inside the step/,
  );
  assert.doesNotMatch(markup, /<strong data-localize-content>Details<\/strong>/);
  assert.match(markup, /class="app-api-progress-label">Loading data<\/span>/);

  state.settings.appLanguage = "ar";
  assert.match(
    buildMarkup(),
    /<span><strong>العنوان العربي<\/strong><small>الجهة العربية<\/small><\/span>/,
  );
  state.settings.appLanguage = "en";

  state.pages.push({ id: "page-splash", name: "Loading", kind: "splash" });
  state.settings.appApiProgressLabel = false;
  assert.doesNotMatch(buildMarkup(), /class="app-runtime-message app-splash-indicator"/);
  state.settings.appApiProgressLabel = true;
  assert.match(
    buildMarkup(),
    /class="app-runtime-message app-splash-indicator">Starting app\.\.\.<\/p>/,
  );
  state.pages.pop();
  state.settings.appApiProgressLabel = false;

  state.pages[0].kind = "error";
  state.settings.appShowErrorMessage = false;
  assert.doesNotMatch(buildMarkup(), /id="runtime-error-message"/);
});

test("exports collection item layout direction and alignment", () => {
  const collection = {
    id: "collection-1",
    pageId: "page-home",
    type: "collection",
    styles: {},
    layout: {
      direction: "row",
      align: "center",
      justify: "space-between",
      gap: 12,
    },
    listSource: { type: "static" },
  };
  const child = {
    id: "text-1",
    parentId: collection.id,
    pageId: "page-home",
    type: "text",
    content: "Item",
    styles: {},
  };
  const layout = {
    id: "layout-1",
    pageId: "page-home",
    type: "layout",
    content: "",
    styles: {},
    layout: {
      direction: "row",
      align: "stretch",
      justify: "start",
      gap: 8,
    },
  };
  const scrollView = {
    id: "scroll-1",
    pageId: "page-home",
    type: "scrollView",
    content: "",
    styles: {},
    layout: {
      direction: "column",
      align: "stretch",
      justify: "start",
      gap: 8,
    },
    scroll: { axis: "horizontal", height: 100 },
  };
  const state = {
    elements: [collection, child, layout, scrollView],
    pages: [{ id: "page-home", kind: "page" }],
    settings: { appLanguage: "en" },
  };
  const buildMarkup = createPreviewRenderer({
    TemplateEngine: { render: () => "" },
    EXPORT_HTML_TEMPLATES: {},
    state,
    escapeHtml: (value) => String(value),
    normalizeClassNames: () => "",
    getLocalizedContent: (element) => element.content,
    getElementThemeColor: () => "#ffffff",
    getExportElementThemeColor: () => "#ffffff",
    getExportThemeColor: () => "#ffffff",
    getElementFontSize: () => 16,
    getScaledSpacingCss: () => "0px",
    getSpacingCss: () => "0px",
    clampNumber: (value, _min, _max, fallback) => value ?? fallback,
    safeColor: (value, fallback) => value || fallback,
    defaultBorderRadius: () => 0,
    normalizeDimension: () => "",
    getAbsoluteLayoutChildAlignment: () => null,
    getFormName: () => "",
    inputTypes: [],
    getAsset: () => null,
    safeImageUrl: () => "",
    isInsideCollection: () => false,
    getVariantOptions: () => [],
    getDefaultVariant: () => "",
    normalizeOptions: () => [],
    customComponentClass: () => "",
    safeCustomHtml: () => "",
  });

  assert.match(
    buildMarkup(),
    /class="content-collection-items" style="display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:space-between;gap:12px"/,
  );
  assert.match(
    buildMarkup(),
    /display:flex;flex-direction:row;flex-wrap:nowrap;align-items:stretch;justify-content:flex-start;gap:8px/,
  );
  assert.match(
    buildMarkup(),
    /class="content-layout-children content-scroll-view-children" style="display:flex;width:max-content;flex-direction:row;flex-wrap:nowrap/,
  );
});

test("renders configured default selections for list and radio options", () => {
  const state = {
    elements: [
      {
        id: "list-1",
        pageId: "page-home",
        type: "list",
        fieldName: "list",
        content: "Choose an option",
        styles: {},
        listSource: { type: "static" },
        options: [
          { label: "First", value: 1 },
          { label: "Second", value: 2, selected: true },
        ],
      },
      {
        id: "radio-1",
        pageId: "page-home",
        type: "radio",
        fieldName: "radio",
        content: "Choose one",
        styles: {},
        options: [
          { label: "First", value: 1 },
          { label: "Second", value: 2, selected: true },
        ],
      },
    ],
    pages: [{ id: "page-home", kind: "page", name: "Home" }],
    settings: {
      appLanguage: "en",
      appTopBarType: "none",
      appApiProgressLabel: false,
      appShowErrorMessage: true,
    },
  };
  const buildMarkup = createPreviewRenderer({
    TemplateEngine: { render: () => "" },
    EXPORT_HTML_TEMPLATES: {},
    state,
    escapeHtml: (value) => String(value),
    normalizeClassNames: () => "",
    getLocalizedContent: (element) => element.content,
    getElementThemeColor: () => "#ffffff",
    getExportElementThemeColor: () => "#ffffff",
    getExportThemeColor: () => "#ffffff",
    getElementFontSize: () => 16,
    getScaledSpacingCss: () => "0px",
    getSpacingCss: () => "0px",
    clampNumber: (value, _min, _max, fallback) => value || fallback,
    safeColor: (value, fallback) => value || fallback,
    defaultBorderRadius: () => 0,
    normalizeDimension: () => "",
    getAbsoluteLayoutChildAlignment: () => null,
    getFormName: (element) => element.fieldName,
    inputTypes: [],
    getAsset: () => null,
    safeImageUrl: () => "",
    isInsideCollection: () => false,
    getVariantOptions: () => [],
    getDefaultVariant: () => "",
    normalizeOptions: (options, singleSelection = false) => {
      let selected = false;
      return options.map((option) => {
        const isSelected =
          option.selected === true && (!singleSelection || !selected);
        selected ||= isSelected;
        return { ...option, selected: isSelected };
      });
    },
    customComponentClass: () => "",
    safeCustomHtml: () => "",
  });

  const markup = buildMarkup();

  assert.match(markup, /<option value="1"[^>]* selected>Second<\/option>/);
  assert.match(
    markup,
    /<input type="radio" name="radio" data-form-name="radio" data-form-value="2" checked>/,
  );
});
