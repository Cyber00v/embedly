const properties = pluginContext.properties;
const locale =
  properties.locale === "ar" || properties.locale === "en"
    ? properties.locale
    : pluginContext.language;
const defaultLabels =
  locale === "ar"
    ? ["الحساب", "التفاصيل", "المراجعة"]
    : ["Account", "Details", "Review"];
const rawLabels = String(properties.steps || "").trim();
const labels = (rawLabels === "Account|Details|Review"
  ? defaultLabels.join("|")
  : rawLabels
)
  .split("|")
  .map((label) => label.trim())
  .filter(Boolean)
  .slice(0, 12);
const configuredLabels = labels.length ? labels : defaultLabels;
const stepsSlot = root.querySelector("[data-stepper-steps]");
const stepElements = stepsSlot
  ? stepsSlot
    .assignedElements()
    .filter((element) => element.dataset.pluginId === "step")
  : [];
const steps = stepElements.length
  ? stepElements.map((element, index) => {
    const stepProperties = JSON.parse(
      element.dataset.pluginProperties || "{}",
    );
    const label =
      typeof stepProperties.label === "string"
        ? stepProperties.label.trim()
        : "";
    return label || configuredLabels[index] || `Step ${index + 1}`;
  })
  : configuredLabels;
let currentStep = Math.max(
  1,
  Math.min(steps.length, Math.floor(Number(properties.currentStep) || 1)),
);
const stepper = root.querySelector("[data-stepper]");
const list = root.querySelector("[data-stepper-list]");
const status = root.querySelector("[data-stepper-status]");
const controls = root.querySelector("[data-stepper-controls]");
const backButton = root.querySelector("[data-stepper-back]");
const nextButton = root.querySelector("[data-stepper-next]");

stepper.dataset.orientation =
  properties.orientation === "vertical" ? "vertical" : "horizontal";
stepper.lang = locale;

if (controls) controls.hidden = properties.showControls === false;
if (status) status.hidden = properties.showStatus === false;
function render() {
  list.replaceChildren();
  stepElements.forEach((element, index) => {
    element.hidden = index !== currentStep - 1;
  });
  steps.forEach((label, index) => {
    const stepNumber = index + 1;
    const item = document.createElement("li");
    const marker = document.createElement("span");
    const text = document.createElement("span");
    item.className = "stepper-item";
    if (stepNumber === currentStep) {
      item.classList.add("is-current");
      item.setAttribute("aria-current", "step");
    } else if (stepNumber < currentStep) {
      item.classList.add("is-complete");
    }
    marker.className = "stepper-marker";
    marker.textContent = stepNumber < currentStep ? "✓" : String(stepNumber);
    text.className = "stepper-label";
    text.textContent = label;
    item.append(marker, text);
    list.append(item);
  });

  status.textContent =
    locale === "ar"
      ? `الخطوة ${currentStep} من ${steps.length}: ${steps[currentStep - 1]}`
      : `Step ${currentStep} of ${steps.length}: ${steps[currentStep - 1]}`;
  backButton.textContent = locale === "ar" ? "السابق" : "Back";
  nextButton.textContent =
    currentStep === steps.length
      ? locale === "ar"
        ? "إنهاء"
        : "Finish"
      : locale === "ar"
        ? "التالي"
        : "Next";
  backButton.disabled = currentStep === 1;
}

function emitStepChange(previousStep, currentStep) {
  pluginContext.setProperty("currentStep", currentStep);
  pluginContext.emit("onStepChanged", {
    step: currentStep,
    previousStep,
    title: steps[currentStep - 1],
  });
}

function onClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const previousStep = currentStep;
  if (target.closest("[data-stepper-back]")) {
    if (currentStep <= 1) return;
    currentStep -= 1;
  } else if (target.closest("[data-stepper-next]")) {
    if (currentStep === steps.length) {
      pluginContext.emit("onCompleted", {
        step: currentStep,
        title: steps[currentStep - 1],
      });
      return;
    }
    currentStep += 1;
  }

  render();
  emitStepChange(previousStep, currentStep)
}

function next() {
  if (currentStep === steps.length) {
    pluginContext.emit("onCompleted", {
      step: currentStep,
      title: steps[currentStep - 1],
    });
    return;
  }

  const previousStep = currentStep;
  currentStep += 1;
  render();
  emitStepChange(previousStep, currentStep)
}

function previous() {
  if (currentStep <= 1) return;
  const previousStep = currentStep;
  currentStep -= 1;
  render();
  emitStepChange(previousStep, currentStep)
}

pluginContext.exposeFunction("next", next);
pluginContext.exposeFunction("previous", previous);

root.addEventListener("click", onClick);
render();

return () => root.removeEventListener("click", onClick);
