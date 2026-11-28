// @ts-nocheck

// Populates binding selectors for Tawakkalna fields, API requests, and saved variables.
export function createWorkflowActionOptions(dependencies) {
  const { state, TWK_FIELDS } = dependencies;

  function setSelectOptions(
    select,
    items,
    preferredValue,
    { emptyFallback = "", disableWhenEmpty = false } = {},
  ) {
    if (!select) return "";
    select.replaceChildren(
      ...items.map(({ label, value }) => new Option(label, value)),
    );
    const hasPreferred = items.some((item) => item.value === preferredValue);
    select.value = hasPreferred
      ? preferredValue
      : items[0]?.value ?? emptyFallback;
    if (disableWhenEmpty) {
      select.disabled = items.length === 0;
    }
    return select.value;
  }

  function getArrayTwkFieldItems() {
    return TWK_FIELDS.filter((field) => Array.isArray(field.sample)).map(
      (field) => ({
        label: `${field.label} (${field.key})`,
        value: field.key,
      }),
    );
  }

  function getRequestItems() {
    return state.requests.map((request) => ({
      label: request.name,
      value: request.id,
    }));
  }

  function renderTwkOptions() {
    const select = document.querySelector("#property-twk-field");
    setSelectOptions(
      select,
      TWK_FIELDS.map((field) => ({
        label: `${field.label} ({{twk.${field.key}}})`,
        value: field.key,
      })),
      select?.value ?? "",
    );

    const arrayFieldItems = getArrayTwkFieldItems();
    const listSelect = document.querySelector("#property-list-twk-field");
    setSelectOptions(listSelect, arrayFieldItems, listSelect?.value ?? "");

    const collectionSelect = document.querySelector(
      "#property-collection-twk-field",
    );
    setSelectOptions(
      collectionSelect,
      arrayFieldItems,
      collectionSelect?.value ?? "",
    );
  }

  function renderEndpointOptions() {
    const selectedElementSource = state.elements.find(
      (element) => element.id === state.selectedId,
    )?.listSource;
    const requestItems = getRequestItems();

    const bindingSelect = document.querySelector("#property-binding-endpoint");
    setSelectOptions(bindingSelect, requestItems, bindingSelect?.value ?? "");

    const listSelect = document.querySelector("#property-list-endpoint");
    const preferredListRequest =
      selectedElementSource?.requestId || listSelect?.value || "";
    setSelectOptions(listSelect, requestItems, preferredListRequest, {
      disableWhenEmpty: true,
    });

    // Preserve the request configured for the selected Collection when refreshing its options.
    const collectionSelect = document.querySelector(
      "#property-collection-endpoint",
    );
    const preferredCollectionRequest =
      selectedElementSource?.requestId || collectionSelect?.value || "";
    setSelectOptions(collectionSelect, requestItems, preferredCollectionRequest, {
      disableWhenEmpty: true,
    });
  }

  function renderVariableOptions(selectedId = "") {
    const select = document.querySelector("#property-binding-variable");
    const variableItems = state.variables.map((variable) => ({
      label: `{{var.${variable.name}}}`,
      value: variable.id,
    }));
    setSelectOptions(select, variableItems, selectedId, {
      disableWhenEmpty: true,
    });
  }

  return { renderTwkOptions, renderEndpointOptions, renderVariableOptions };
}