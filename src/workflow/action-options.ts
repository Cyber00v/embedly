// @ts-nocheck
 
// Populates binding selectors for Tawakkalna fields, API requests, and saved variables.
export function createWorkflowActionOptions(dependencies) {
  const {
    state,
    TWK_FIELDS,
  } = dependencies;

function renderTwkOptions() {
  const select = document.querySelector("#property-twk-field");
  select.replaceChildren();
  TWK_FIELDS.forEach((field) => {
    const option = document.createElement("option");
    option.value = field.key;
    option.textContent = `${field.label} ({{twk.${field.key}}})`;
    select.append(option);
  });
  const listSelect = document.querySelector("#property-list-twk-field");
  listSelect.replaceChildren();
  TWK_FIELDS.filter((field) => Array.isArray(field.sample)).forEach((field) => {
    const option = document.createElement("option");
    option.value = field.key;
    option.textContent = `${field.label} (${field.key})`;
    listSelect.append(option);
  });
  const collectionSelect = document.querySelector(
    "#property-collection-twk-field",
  );
  collectionSelect.replaceChildren(
    ...TWK_FIELDS.filter((field) => Array.isArray(field.sample)).map(
      (field) => {
        const option = document.createElement("option");
        option.value = field.key;
        option.textContent = `${field.label} (${field.key})`;
        return option;
      },
    ),
  );
}

function renderEndpointOptions() {
  const bindingSelect = document.querySelector("#property-binding-endpoint");
  const selectedBinding = bindingSelect.value;
  bindingSelect.replaceChildren();
  state.requests.forEach((request) => {
    const option = document.createElement("option");
    option.value = request.id;
    option.textContent = request.name;
    bindingSelect.append(option);
  });
  bindingSelect.value = state.requests.some(
    (request) => request.id === selectedBinding,
  )
    ? selectedBinding
    : state.requests[0]?.id || "";
  const listSelect = document.querySelector("#property-list-endpoint");
  const listSource = state.elements.find(
    (element) => element.id === state.selectedId,
  )?.listSource;
  const selectedListRequest = listSource?.requestId || listSelect.value;
  listSelect.replaceChildren();
  listSelect.disabled = !state.requests.length;
  state.requests.forEach((request) => {
    const option = document.createElement("option");
    option.value = request.id;
    option.textContent = request.name;
    listSelect.append(option);
  });
  listSelect.value = state.requests.some(
    (request) => request.id === selectedListRequest,
  )
    ? selectedListRequest
    : state.requests[0]?.id || "";
  // Preserve the request configured for the selected Collection when refreshing its options.
  const collectionSelect = document.querySelector(
    "#property-collection-endpoint",
  );
  const collectionSource = state.elements.find(
    (element) => element.id === state.selectedId,
  )?.listSource;
  const selectedCollectionRequest =
    collectionSource?.requestId || collectionSelect.value;
  collectionSelect.replaceChildren();
  collectionSelect.disabled = !state.requests.length;
  state.requests.forEach((request) => {
    const option = document.createElement("option");
    option.value = request.id;
    option.textContent = request.name;
    collectionSelect.append(option);
  });
  collectionSelect.value = state.requests.some(
    (request) => request.id === selectedCollectionRequest,
  )
    ? selectedCollectionRequest
    : state.requests[0]?.id || "";
}

function renderVariableOptions(selectedId = "") {
  const select = document.querySelector("#property-binding-variable");
  select.replaceChildren();
  state.variables.forEach((variable) => {
    const option = document.createElement("option");
    option.value = variable.id;
    option.textContent = `{{var.${variable.name}}}`;
    select.append(option);
  });
  select.value = state.variables.some((variable) => variable.id === selectedId)
    ? selectedId
    : state.variables[0]?.id || "";
  select.disabled = state.variables.length === 0;
}

  return { renderTwkOptions, renderEndpointOptions, renderVariableOptions };
}
