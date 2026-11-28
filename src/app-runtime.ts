// @ts-nocheck
export function attachRippleEffectListener(root) {
  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest(".ripple-effect-enabled");
    if (
      !target ||
      target.matches(":disabled") ||
      target.closest("[hidden]")
    )
      return;

    const bounds = target.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    const document = target.ownerDocument;
    const ripple = document.createElement("span");
    const wave = document.createElement("span");
    const targetStyle = document.defaultView.getComputedStyle(target);
    const rippleHost =
      target.closest("#app-preview, .embedded-app, .app-sheet-portal") ||
      (root.nodeType === 9 ? root.body : root);
    const diameter = Math.hypot(bounds.width, bounds.height) * 2;
    const x =
      event.detail === 0
        ? bounds.width / 2
        : Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const y =
      event.detail === 0
        ? bounds.height / 2
        : Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));

    ripple.className = "element-ripple-layer";
    ripple.setAttribute("aria-hidden", "true");
    ripple.style.left = `${bounds.left}px`;
    ripple.style.top = `${bounds.top}px`;
    ripple.style.width = `${bounds.width}px`;
    ripple.style.height = `${bounds.height}px`;
    ripple.style.borderRadius = targetStyle.borderRadius;
    ripple.style.color = targetStyle.color;
    ripple.style.setProperty("--ripple-size", `${diameter}px`);
    ripple.style.setProperty("--ripple-x", `${x}px`);
    ripple.style.setProperty("--ripple-y", `${y}px`);
    wave.className = "element-ripple-wave";
    ripple.append(wave);
    document.defaultView.queueMicrotask(() => {
      rippleHost.append(ripple);
      const cleanupTimer = document.defaultView.setTimeout(
        () => ripple.remove(),
        750,
      );
      wave.addEventListener(
        "animationend",
        () => {
          document.defaultView.clearTimeout(cleanupTimer);
          ripple.remove();
        },
        { once: true },
      );
    });
  });
}

export function startRuntime(
  runtimeConfig,
  attachRippleEffectListener,
  mountPluginElements,
  unmountPluginElements,
) {
  const {
    TWK_SYSTEM_ACTION_TYPES,
    TWK_PERMISSION_ACTION_TYPES,
    TWK_FIELDS,
    INITIAL_APP_LANGUAGE,
    API_REQUESTS,
    VARIABLES,
    FUNCTION_SCRIPT_PATHS,
    IMAGE_ASSET_URLS,
    APP_LOAD_HANDLERS,
    GLOBAL_ACTIONS,
    ELEMENT_ACTIONS,
    ELEMENT_TYPES,
    COMPONENT_RUNTIME_PROPERTY_REGISTRY,
    ELEMENT_VARIANTS,
    ELEMENT_COLLECTION_IDS,
    ELEMENT_EXTRA_DATA,
    ELEMENT_LOCALIZATIONS,
    LIST_CONFIGS,
    COLLECTION_CONFIGS,
    PLUGIN_DEFINITIONS,
    PLUGIN_ELEMENT_IDS,
    PAGES,
    APP_TITLE,
    APP_TITLE_LOCALIZATIONS,
    APP_ORGANIZATION,
    APP_ORGANIZATION_LOCALIZATIONS,
    INITIAL_PAGE_ID,
    INITIAL_SPLASH_PAGE_ID,
    API_PROGRESS_INDICATOR_ENABLED,
    API_PROGRESS_LABEL_ENABLED,
  } = runtimeConfig;

  const ACTIVE_FORM_CONTROLS_SELECTOR = "[data-form-name]:not(:disabled)";
  const COLLECTION_ITEM_SELECTOR = ".content-collection-item";
  const FORM_CONTROL_SELECTOR =
    "input, select, textarea, [role='progressbar']";
  const INTERACTIVE_DISABLE_SELECTOR =
    "input, select, textarea, button";
  const COLLECTION_ITEMS_CONTAINER_SELECTOR = ".content-collection-items";
  const ACTIVE_SHEET_SELECTOR = "[data-sheet-id][data-sheet-page]";
  const ACTIVE_SHEET_CLASS = "is-active";
  const REQUIRED_FORM_CONTROLS_SELECTOR =
    "[data-form-name][required]:not(:disabled)";

  const TOKEN_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;
  const EXACT_TOKEN_PATTERN = /^\{\{\s*[^{}]+?\s*\}\}$/;
  const VALID_IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  const BASE64_IMAGE_DATA_URL_REGEX =
    /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i;
  const EXTRA_REFERENCE_REGEX = /^(.+)\.extra\.([A-Za-z_][A-Za-z0-9_-]*)$/;
  const EXTRA_TOKEN_REGEX = /^(.+)\.extra\.([A-Za-z_][A-Za-z0-9_-]*)$/;
  const SELF_TOKEN_REGEX = /^(?:self|element)\.(.+)$/i;
  const SINGLE_TOKEN_REGEX = /^\{\{\s*([^{}]+?)\s*\}\}$/;

  const UNSAFE_PATH_KEYS = new Set(["__proto__", "prototype", "constructor"]);
  const SAFE_IMAGE_PROTOCOLS = new Set(["http:", "https:", "file:"]);

  const ALLOWED_REQUEST_PROTOCOLS = new Set(["http:", "https:"]);

  const DEFAULT_RUNTIME_ERROR_MESSAGE =
    "حدث خطأ غير متوقع أثناء تشغيل الخدمة.";

  let appLanguage = INITIAL_APP_LANGUAGE;
  let appAppearance = "1";
  const ACTIVE_COLLECTION_ROWS = new Map();
  const FUNCTION_SCRIPT_PROMISES = new Map();
  let startupSplashPending = Boolean(INITIAL_SPLASH_PAGE_ID);
  let activeApiRequestCount = 0;
  attachRippleEffectListener(document);

  // ---------------------------------------------------------------------
  // Localization helpers
  // ---------------------------------------------------------------------

  const getLanguage = () => (appLanguage === "en" ? "en" : "ar");

  const UI_TEXT = {
    ar: {
      close: "إغلاق",
      loadingData: "جارٍ تحميل البيانات",
      startingApp: "جارٍ بدء التطبيق...",
      breadcrumb: "مسار التنقل",
      dismissToast: "إغلاق الإشعار",
    },
    en: {
      close: "Close",
      loadingData: "Loading data",
      startingApp: "Starting app...",
      breadcrumb: "Breadcrumb",
      dismissToast: "Dismiss notification",
    },
  };

  const t = (key) => UI_TEXT[getLanguage()][key];

  /** Picks the localization for the active language, else any string value, else fallback. */
  function pickLocalized(localizations, fallback) {
    const exact = localizations?.[getLanguage()];
    if (typeof exact === "string") return exact;
    return (
      Object.values(localizations || {}).find((v) => typeof v === "string") ??
      fallback
    );
  }

  const MESSAGE_TRANSLATIONS = new Map([
    ["جارٍ إرسال الطلب...", "Sending request..."],
    ["جارٍ تنفيذ الطلب...", "Sending request..."],
    ["لم يتم إرسال الطلب.", "The request has not been sent."],
    ["تم إرسال الطلب بنجاح.", "Request completed successfully."],
    ["تعذر تنفيذ الإجراء.", "The action could not be completed."],
    ["رسالة", "Message"],
    ["تعذر تحميل بيانات توكلنا.", "Unable to load Tawakkalna data."],
    ["حدث خطأ غير متوقع أثناء تشغيل الخدمة.", "An unexpected error occurred while running the service."],
    ["اختر طلب API صالحاً لهذا العنصر.", "Choose a valid API request for this element."],
    [
      "يتطلب الوصول إلى معرض الصور إذن Gallery. أضف إذن Gallery من فئة Device Information في بوابة توكلنا عند إنشاء الخدمة المضمنة.",
      "Gallery access requires the Gallery permission. Add Gallery under Device Information in the Tawakkalna portal when creating the embedded service.",
    ],
    ["تجاوز حجم الملف الحد الأقصى المسموح به وهو 10 MB.", "The file exceeds the maximum allowed size of 10 MB."],
  ]);

  const MESSAGE_PREFIXES = [
    ["تعذر تحميل خيارات قائمة توكلنا: ", "Unable to load Tawakkalna list options: "],
    ["تعذر تحميل عناصر القائمة المرئية من توكلنا: ", "Unable to load Tawakkalna collection items: "],
    ["تعذر جمع قيم النموذج: ", "Unable to collect form values: "],
    ["تعذر تنفيذ إجراء العنصر: ", "Unable to run the element action: "],
    ["تعذر تغيير خاصية العنصر: ", "Unable to change the element property: "],
    ["تعذر الانتقال إلى الصفحة: ", "Unable to navigate to the page: "],
    ["تعذر فتح خدمة توكلنا: ", "Unable to open the Tawakkalna service: "],
    ["تعذر تعيين المتغير: ", "Unable to set the variable: "],
    ["تعذر تنفيذ الطلب «", "Unable to run request «"],
  ];

  function localizeAppMessage(message) {
    if (appLanguage !== "en") return message;
    const exact = MESSAGE_TRANSLATIONS.get(message);
    if (exact) return exact;
    const match = MESSAGE_PREFIXES.find(([arabic]) => message.startsWith(arabic));
    return match ? match[1] + message.slice(match[0].length) : message;
  }

  // ---------------------------------------------------------------------
  // Startup
  // ---------------------------------------------------------------------

  /** Reads a TWK value, returning `fallback` (and warning) if it fails or is nullish. */
  async function readTwkOrDefault(key, fallback, warning) {
    try {
      return (await getTwkValue(key)) ?? fallback;
    } catch (error) {
      console.warn(warning, error);
      return fallback;
    }
  }

  async function initializeApp() {
    if (document.readyState === "loading") {
      await new Promise((resolve) =>
        document.addEventListener("DOMContentLoaded", resolve, { once: true }),
      );
    }

    appLanguage = await readTwkOrDefault(
      "app_language",
      INITIAL_APP_LANGUAGE,
      "Unable to read TWK app language; using the configured language.",
    );
    applyAppLanguage();
    mountPluginElements(document, PLUGIN_DEFINITIONS);

    appAppearance = String(
      await readTwkOrDefault(
        "appearance",
        "1",
        "Unable to read TWK app appearance; using light mode.",
      ),
    );
    applyAppAppearance();

    await runInitialRequests();
    await Promise.all([twkBindingsReady, staticCollectionsReady]);
    startupSplashPending = false;
    if (activePageId === INITIAL_SPLASH_PAGE_ID && !runtimeErrorShown)
      showPage(INITIAL_PAGE_ID);
    await updateVariableBindings(collectFormValues());
    await runAppLoadHandlers();
  }

  function applyAppAppearance() {
    const theme = appAppearance === "2" ? "dark" : "light";
    const root = document.documentElement;
    root.dataset.appTheme = theme;
    root.style.colorScheme = theme;
  }

  function setText(selector, text) {
    const node = document.querySelector(selector);
    if (node) node.textContent = text;
    return node;
  }

  function applyAppLanguage() {
    const language = getLanguage();
    const direction = language === "ar" ? "rtl" : "ltr";

    const appTitle = pickLocalized(APP_TITLE_LOCALIZATIONS, APP_TITLE);
    const appOrganization = pickLocalized(
      APP_ORGANIZATION_LOCALIZATIONS,
      APP_ORGANIZATION,
    );
    document.title = appTitle;
    setText(".app-header strong", appTitle);
    setText(".app-header small", appOrganization);

    document.documentElement.lang = language;
    document.documentElement.dir = direction;
    document.querySelectorAll(".embedded-app").forEach((app) => {
      app.lang = language;
      app.dir = direction;
    });
    document
      .querySelectorAll(".app-sheet-portal, .content-sheet")
      .forEach((sheet) => {
        sheet.dir = direction;
      });

    applyElementLocalizations();

    setText("#app-message-close", t("close"));
    if (requestStatus)
      requestStatus.textContent = localizeAppMessage(currentStatusMessage);

    const apiProgressLabel = setText(".app-api-progress-label", t("loadingData"));
    if (apiProgressLabel)
      apiProgressLabel.hidden = API_PROGRESS_LABEL_ENABLED === false;

    setText(".app-splash-indicator", t("startingApp"));

    if (runtimeErrorSource)
      setText("#runtime-error-message", localizeAppMessage(runtimeErrorSource));
  }

  // ---------------------------------------------------------------------
  // Element localization (table-driven, keyed by element type)
  // ---------------------------------------------------------------------

  const setAria = (el, value) => el?.setAttribute("aria-label", value);

  /** Types whose label is applied to attributes instead of (or in addition to) text content. */
  const ATTRIBUTE_LOCALIZERS = {
    input: (el, content) => {
      el.placeholder = content;
      setAria(el, content);
    },
    image: (el, content) => {
      el.alt = content;
    },
    icon: setAria,
    radio: setAria,
    list: (el, content) => {
      const select = el.querySelector("select");
      if (!select) return;
      setAria(select, content);
      const placeholder = select.querySelector("option[disabled]");
      if (placeholder) placeholder.textContent = content;
    },
    tabs: (el, content) => {
      setAria(el, content);
      setAria(el.querySelector('[role="tablist"]'), content);
    },
  };

  /** Types that set text content and also need an aria-label somewhere. */
  const TEXT_PLUS_ARIA_TARGETS = {
    loading: (el) => el,
    fab: (el) => el,
    progress: (el) => el.querySelector("[role='progressbar']"),
    layout: (el) => el,
    absoluteLayout: (el) => el,
    grid: (el) => el,
    scrollView: (el) => el,
  };

  function localizeElement(element) {
    const content = pickLocalized(
      ELEMENT_LOCALIZATIONS[element.dataset.elementId],
      undefined,
    );
    if (typeof content !== "string") return;

    const type = ELEMENT_TYPES[element.dataset.elementId];
    const attributeLocalizer = ATTRIBUTE_LOCALIZERS[type];
    if (attributeLocalizer) {
      attributeLocalizer(element, content);
      return;
    }

    const textTarget = element.querySelector("[data-localize-content]");
    if (textTarget) textTarget.textContent = content;

    const ariaTarget = TEXT_PLUS_ARIA_TARGETS[type];
    if (ariaTarget) setAria(ariaTarget(element), content);
    if (type === "breadcrumbs") setAria(element, t("breadcrumb"));
  }

  function applyElementLocalizations(root = document) {
    const elements = [
      ...(root.matches?.("[data-element-id]") ? [root] : []),
      ...root.querySelectorAll("[data-element-id]"),
    ];
    elements.forEach(localizeElement);

    root.querySelectorAll("[data-tab-target]").forEach((button) => {
      const content = pickLocalized(
        ELEMENT_LOCALIZATIONS[button.dataset.tabTarget],
        undefined,
      );
      const target = button.querySelector("[data-localize-content]");
      if (typeof content === "string" && target) target.textContent = content;
    });

    document
      .querySelectorAll("[data-toast-close]")
      .forEach((button) => setAria(button, t("dismissToast")));
  }

  // =====================================================================
  // State & constants
  // =====================================================================

  const TRANSITION_DURATION = 300;
  const TOAST_DURATION = 4000;
  const CANCELLED_CODES = ["cancelled", "canceled", "user_cancelled", "user_canceled"];
  const LAYOUT_TYPES = ["layout", "absoluteLayout", "grid", "scrollView"];

  const requestStatus = document.querySelector("#request-status");
  const API_RESPONSES = Object.create(null);
  const VARIABLE_OVERRIDES = Object.create(null);
  const pageHistory = [];
  let activePageId = INITIAL_SPLASH_PAGE_ID || INITIAL_PAGE_ID;
  let runtimeErrorShown = false;
  let collectionInstanceId = 0;
  let currentStatusMessage = "";
  let activeToastTimer = null;
  let runtimeErrorSource = "تعذر تنفيذ الإجراء.";

  // =====================================================================
  // Small utilities
  // =====================================================================

  /** Shows the error page and notifies listeners. (Not named `reportError`: that shadows a browser global.) */
  function raiseRuntimeError(message, detail = {}) {
    showErrorPage(message);
    document.dispatchEvent(
      new CustomEvent("embedded-app:error", { detail: { message, ...detail } }),
    );
  }

  const attrSelector = (attr, value) => `[${attr}="${CSS.escape(String(value))}"]`;

  /** Returns `value` or throws `message` when it is falsy. */
  function need(value, message) {
    if (!value) throw new Error(message);
    return value;
  }

  /** Accepts true/false/"true"/"false"; throws `message` for anything else. */
  function toBoolean(value, message) {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    throw new Error(message);
  }

  function setStatus(message) {
    currentStatusMessage = message;
    if (requestStatus)
      requestStatus.textContent = localizeAppMessage(currentStatusMessage);
  }

  // =====================================================================
  // Pages
  // =====================================================================

  function showPage(pageId, recordHistory = false) {
    if (!PAGES[pageId])
      throw new Error("Configured page is unavailable: " + pageId);
    const previousPageId = activePageId;
    if (recordHistory && previousPageId !== pageId)
      pageHistory.push(previousPageId);
    activePageId = pageId;
    runtimeErrorShown = PAGES[pageId].kind === "error";
    updateApiProgressIndicator();

    document.querySelectorAll("[data-app-page]").forEach((page) => {
      const isTarget = page.dataset.appPage === pageId;
      page.hidden = !isTarget;
      page.classList.remove("is-entering");
      if (isTarget && previousPageId !== pageId) {
        page.classList.add("is-entering");
        page.addEventListener(
          "animationend",
          () => page.classList.remove("is-entering"),
          { once: true },
        );
      }
    });
    closeSheet();
  }

  function goBackPage() {
    const previousPageId = pageHistory.pop();
    if (previousPageId) showPage(previousPageId);
    return activePageId;
  }

  // =====================================================================
  // Sheets
  // =====================================================================

  const getSheets = () => [...document.querySelectorAll("[data-sheet-id]")];
  const getSheetBackdrop = () => document.querySelector("[data-sheet-backdrop]");
  const isAnySheetActive = (except = null) =>
    getSheets().some((s) => s !== except && s.classList.contains("is-active"));

  /** After the CSS transition: hide whatever is no longer active. */
  function finishSheetTransition(target = null) {
    setTimeout(() => {
      if (target) {
        if (!target.classList.contains("is-active")) target.hidden = true;
      } else {
        getSheets().forEach((sheet) => {
          if (!sheet.classList.contains("is-active")) sheet.hidden = true;
        });
      }
      const backdrop = getSheetBackdrop();
      if (backdrop && !isAnySheetActive()) backdrop.hidden = true;
      updateElementPropertyBindings();
    }, TRANSITION_DURATION);
  }

  function closeSheet() {
    getSheets().forEach((sheet) => sheet.classList.remove("is-active"));
    getSheetBackdrop()?.classList.remove("is-active");
    finishSheetTransition();
  }

  function findSheetTarget(sheetId, elementContext = null) {
    const selector = attrSelector("data-sheet-id", sheetId);
    const row = elementContext?.closest(".content-collection-item");
    return row?.querySelector(selector) || document.querySelector(selector);
  }

  function showSheet(sheetId, elementContext = null) {
    if (!sheetId) throw new Error("Select a sheet to show.");
    const target = findSheetTarget(sheetId, elementContext);
    const backdrop = getSheetBackdrop();
    if (!target || !backdrop)
      throw new Error("The selected sheet is unavailable.");

    const page = target.closest("[data-app-page]");
    if (page?.hidden) showPage(page.dataset.appPage);

    getSheets().forEach((sheet) => {
      sheet.classList.remove("is-active");
      sheet.hidden = true;
    });
    target.hidden = false;
    backdrop.hidden = false;
    requestAnimationFrame(() => {
      target.classList.add("is-active");
      backdrop.classList.add("is-active");
    });

    target.querySelector(".content-sheet-close")?.focus();
    updateElementPropertyBindings();
    return { type: "showSheet", sheetId };
  }

  function hideSheet(sheetId, elementContext = null) {
    if (!sheetId || ELEMENT_TYPES[sheetId] !== "sheet")
      throw new Error("Select an existing sheet to hide.");
    const target = need(
      findSheetTarget(sheetId, elementContext),
      "The selected sheet is unavailable.",
    );
    target.classList.remove("is-active");
    if (!isAnySheetActive(target))
      getSheetBackdrop()?.classList.remove("is-active");
    finishSheetTransition(target);
    return { type: "hideSheet", sheetId };
  }

  // =====================================================================
  // Toasts
  // =====================================================================

  function dismissToasts(targets) {
    targets.forEach((target) => {
      target.hidden = true;
    });
  }

  function showToastElement(toastId) {
    if (!toastId || ELEMENT_TYPES[toastId] !== "toast")
      throw new Error("Select an existing toast element.");
    const targets = [
      ...document.querySelectorAll(attrSelector("data-element-id", toastId)),
    ].filter((target) => target.classList.contains("content-toast"));
    if (!targets.length) throw new Error("The selected toast is unavailable.");

    const page = targets[0].closest("[data-app-page]");
    if (page?.hidden) showPage(page.dataset.appPage);

    dismissToasts(document.querySelectorAll(".content-toast"));
    targets.forEach((target) => {
      target.hidden = false;
    });
    clearTimeout(activeToastTimer);
    activeToastTimer = setTimeout(() => {
      dismissToasts(targets);
      activeToastTimer = null;
    }, TOAST_DURATION);
    return { type: "showToast", toastId };
  }

  // =====================================================================
  // File picker (Tawakkalna gallery)
  // =====================================================================

  function parseJsonOrThrow(value, message) {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(message);
    }
  }

  /** Throws a localized-message Error for known gallery error payloads. */
  function assertNoGalleryError(result) {
    const payloads = [result, result.result, result.error, result.result?.error]
      .filter((p) => p && typeof p === "object");
    const code = payloads.map((p) => Number(p.code)).find(Number.isInteger);
    const status = payloads.map((p) => String(p.status ?? "")).find(Boolean);

    if (code === 1000006 || status === "401")
      throw new Error(
        "يتطلب الوصول إلى معرض الصور إذن Gallery. أضف إذن Gallery من فئة Device Information في بوابة توكلنا عند إنشاء الخدمة المضمنة.",
      );
    if (code === 1000007 || status === "400")
      throw new Error("تجاوز حجم الملف الحد الأقصى المسموح به وهو 10 MB.");
  }

  function validateGalleryFile(file) {
    const valid =
      file &&
      typeof file === "object" &&
      file.type === "image" &&
      typeof file.mime_type === "string" && file.mime_type.trim() &&
      typeof file.data === "string" && file.data.trim();
    if (!valid)
      throw new Error(
        'Each Tawakkalna gallery image must include type "image", a MIME type, and base64 data.',
      );
    return { type: "image", mime_type: file.mime_type.trim(), data: file.data };
  }

  function normalizeGalleryResponse(response, mode) {
    let result = response;
    for (let depth = 0; depth < 4; depth += 1) {
      if (typeof result === "string")
        result = parseJsonOrThrow(result, "The Tawakkalna gallery returned invalid JSON.");
      if (!result || typeof result !== "object" || Array.isArray(result)) break;

      assertNoGalleryError(result);

      if (result.success === false) {
        const error = result.result?.error || result.error || result.result?.message;
        if (CANCELLED_CODES.includes(String(error || "").toLowerCase()))
          return null;
        throw new Error(
          "Tawakkalna gallery selection failed" + (error ? ": " + String(error) : "."),
        );
      }
      if (!Object.hasOwn(result, "result")) break;
      result = result.result;
    }

    if (result == null) return null;
    if (!Array.isArray(result))
      throw new Error(
        "The Tawakkalna gallery response must be an array of image records.",
      );
    const files = result.map(validateGalleryFile);
    return mode === "multiple" ? files : files.slice(0, 1);
  }

  async function openFilePicker(picker) {
    const mode = picker.dataset.filePickerMode === "multiple" ? "multiple" : "single";
    const method = mode === "multiple" ? "getGalleryMulti" : "getGallerySingle";
    const helper = window.TWK?.[method];
    if (typeof helper !== "function")
      throw new Error("TWK." + method + " is unavailable.");

    const files = normalizeGalleryResponse(await helper.call(window.TWK), mode);
    if (!files?.length) return;

    picker.dataset.filePickerValue = JSON.stringify(files);
    picker.dispatchEvent(new Event("input", { bubbles: true }));
    picker.dispatchEvent(
      new CustomEvent("onFilesSelected", { bubbles: true, detail: { files } }),
    );
  }

  function launchFilePicker(picker) {
    if (!picker || picker.disabled) return;
    openFilePicker(picker).catch((error) =>
      raiseRuntimeError("Unable to choose files: " + error.message),
    );
  }

  const DROPZONE_SELECTOR = "[data-file-picker-appearance='dropzone']";

  document.addEventListener("click", (event) =>
    launchFilePicker(event.target.closest("[data-file-picker]")),
  );
  document.addEventListener("dragover", (event) => {
    if (event.target.closest(DROPZONE_SELECTOR)) event.preventDefault();
  });
  document.addEventListener("drop", (event) => {
    const dropzone = event.target.closest(DROPZONE_SELECTOR);
    if (!dropzone || dropzone.disabled) return;
    event.preventDefault();
    launchFilePicker(dropzone);
  });

  // =====================================================================
  // Global click / change / keyboard handling
  // =====================================================================

  function trackActiveCollectionRow(event) {
    const row = event.target.closest(".content-collection-item");
    const collectionId = getCollectionIdFromContext(row);
    if (!collectionId) return false;
    ACTIVE_COLLECTION_ROWS.set(collectionId, row);
    updateExtraBindings(collectFormValues()).catch((error) =>
      raiseRuntimeError("Unable to update extra data bindings: " + error.message),
    );
    return false;
  }

  function closeSheetOnBackdropClick(event) {
    if (event.target.closest("[data-sheet-backdrop], [data-sheet-close]"))
      closeSheet();
    return false;
  }

  /** @returns {boolean} true when the click was fully handled. */
  function handleTabClick(event) {
    const tabButton = event.target.closest("[data-tab-target]");
    if (!tabButton) return false;
    const tabs = tabButton.closest(".content-tabs");
    const panelId = tabButton.dataset.tabTarget;
    if (!tabs || !panelId) throw new Error("The selected tab is unavailable.");

    tabs.querySelectorAll("[data-tab-target]").forEach((button) => {
      const selected = button === tabButton;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    tabs.querySelectorAll("[data-tab-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== panelId;
    });
    return true;
  }

  function handleAccordionClick(event) {
    const toggle = event.target.closest("[data-accordion-toggle]");
    if (!toggle) return false;
    const accordion = toggle.closest(".content-accordion");
    const panel = accordion?.querySelector(".content-accordion-panel");
    if (!accordion || !panel)
      throw new Error("The selected accordion is unavailable.");

    const isOpen = accordion.dataset.accordionOpen !== "true";
    accordion.dataset.accordionOpen = String(isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
    panel.hidden = !isOpen;
    updateElementPropertyBindings();
    return true;
  }

  function handleChipClick(event) {
    const chip = event.target.closest("[data-chip-toggle]");
    if (!chip) return false;
    const selected = chip.getAttribute("aria-pressed") !== "true";
    chip.setAttribute("aria-pressed", String(selected));
    chip.classList.toggle("is-selected", selected);
    updateElementPropertyBindings();
    return false;
  }

  function handleToastCloseClick(event) {
    const close = event.target.closest("[data-toast-close]");
    if (!close) return false;
    const toast = need(
      close.closest(".content-toast"),
      "The toast notification is unavailable.",
    );
    toast.hidden = true;
    clearTimeout(activeToastTimer);
    activeToastTimer = null;
    updateElementPropertyBindings();
    return false;
  }

  const CLICK_HANDLERS = [
    trackActiveCollectionRow,
    closeSheetOnBackdropClick,
    handleTabClick,
    handleAccordionClick,
    handleChipClick,
    handleToastCloseClick,
  ];

  document.addEventListener("click", (event) => {
    for (const handler of CLICK_HANDLERS) if (handler(event)) return;
  });

  document.addEventListener("change", () => updateElementPropertyBindings());

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const dialog = document.querySelector("#app-message-dialog");
    if (dialog && !dialog.hidden) return closeMessageDialog();
    if (!getSheetBackdrop()?.hidden) closeSheet();
  });

  // =====================================================================
  // changeElementProperty
  // =====================================================================

  // ---- plugin properties ----------------------------------------------

  function normalizePluginValue(definition, value) {
    switch (definition.type) {
      case "boolean":
        return toBoolean(value, "Plugin boolean properties require true or false.");
      case "number": {
        const number =
          typeof value === "number"
            ? value
            : typeof value === "string" && value.trim()
              ? Number(value)
              : Number.NaN;
        if (!Number.isFinite(number))
          throw new Error("Plugin number properties require a finite number.");
        return number;
      }
      default: {
        const text = String(value ?? "");
        if (definition.type === "select" && !definition.options?.includes(text))
          throw new Error("Choose an available option for this plugin property.");
        if (definition.type === "color" && !/^#[\da-f]{6}$/i.test(text))
          throw new Error("Plugin color properties require a six-digit hex color.");
        return definition.type === "text" ? text.slice(0, 1000) : text;
      }
    }
  }

  function readPluginProperties(target) {
    if (!target.dataset.pluginProperties) return {};
    let values;
    try {
      values = JSON.parse(target.dataset.pluginProperties);
    } catch {
      throw new Error("The target plugin properties are invalid.");
    }
    if (!values || typeof values !== "object" || Array.isArray(values))
      throw new Error("The target plugin properties must be an object.");
    return values;
  }

  function setPluginProperty({ type, targetId, targets, property, value }) {
    if (type !== "custom")
      throw new Error("Plugin properties are only available for plugin elements.");
    const key = property.slice("plugin.".length);
    const plugin = PLUGIN_DEFINITIONS[PLUGIN_ELEMENT_IDS[targetId]];
    const definition = plugin?.properties.find((item) => item.key === key);
    if (!plugin || !definition)
      throw new Error("The selected plugin property is unavailable.");

    const normalized = normalizePluginValue(definition, value);
    targets.forEach((target) => {
      const values = readPluginProperties(target);
      if (Object.is(values[key], normalized)) return;
      target.dataset.pluginProperties = JSON.stringify({ ...values, [key]: normalized });
      mountPluginElements(target, PLUGIN_DEFINITIONS);
    });
  }

  // ---- individual property handlers -----------------------------------
  // Each receives: { type, targetId, targets, property, value }

  const DISABLEABLE_TYPES = [
    "button", "input", "textarea", "list", "checkbox", "radio",
    "chip", "fab", "switch", "toast", "filePicker",
  ];

  function tabTriggerFor(tabPanel) {
    return tabPanel
      .closest(".content-tabs")
      ?.querySelector(attrSelector("data-tab-target", tabPanel.dataset.tabPanel || ""));
  }

  function setVisibility({ type, targets, value }) {
    if (!["show", "hide"].includes(value))
      throw new Error("Choose whether to show or hide the target element.");
    const hide = value === "hide";
    targets.forEach((target) => {
      target.hidden = hide;
      if (type === "tab") {
        const trigger = tabTriggerFor(target);
        if (trigger) trigger.hidden = hide;
      }
    });
    if (type === "tab" && hide) {
      const tabs = targets[0]?.closest(".content-tabs");
      const nextTab = tabs?.querySelector("[data-tab-target]:not([hidden])");
      const hasSelected = tabs?.querySelector(
        '[data-tab-target][aria-selected="true"]:not([hidden])',
      );
      if (nextTab && !hasSelected) nextTab.click();
    }
  }

  function setDisabled({ type, targetId, targets, value }) {
    const isPlugin = type === "custom" && PLUGIN_ELEMENT_IDS[targetId];
    if (!DISABLEABLE_TYPES.includes(type) && !isPlugin)
      throw new Error("Disabling is not supported for this element type.");
    const disabled = toBoolean(value, "Choose whether the target element is disabled.");

    targets.forEach((target) => {
      target.setAttribute("aria-disabled", String(disabled));
      if (isPlugin) {
        target.inert = disabled;
        return;
      }
      const controls = target.matches("button, input, select, textarea")
        ? [target]
        : [...target.querySelectorAll("button, input, select, textarea")];
      if (!controls.length)
        throw new Error("The target element has no disableable control.");
      controls.forEach((control) => {
        control.disabled = disabled;
      });
    });
  }

  function setInputBound({ type, targets, property, value }) {
    if (type !== "input")
      throw new Error("Minimum and maximum are only supported for inputs.");
    targets.forEach((target) => {
      if (value === "") target.removeAttribute(property);
      else target.setAttribute(property, String(value));
    });
  }

  function setChecked({ type, targets, value }) {
    if (type !== "switch")
      throw new Error("The checked property is only supported for switches.");
    const checked = toBoolean(value, "Choose whether the switch is checked.");
    targets.forEach((target) => {
      need(
        target.querySelector('input[type="checkbox"]'),
        "The target switch is unavailable.",
      ).checked = checked;
    });
  }

  function setProgress({ targets, property, value }) {
    const number = Number(value);
    const invalid =
      !Number.isFinite(number) || (property === "max" ? number <= 0 : number < 0);
    if (invalid)
      throw new Error(
        property === "max"
          ? "Progress maximum must be greater than zero."
          : "Progress value must be zero or greater.",
      );

    targets.forEach((target) => {
      const bar = need(
        target.querySelector("[role='progressbar']"),
        "The target progress bar is unavailable.",
      );
      const previousValue = Number(bar.getAttribute("aria-valuenow")) || 0;
      const max =
        property === "max" ? number : Number(bar.getAttribute("aria-valuemax")) || 100;
      bar.setAttribute("aria-valuemax", String(max));
      const fill = need(
        bar.querySelector(".content-progress-fill"),
        "The target progress fill is unavailable.",
      );
      if (property !== "value" && !bar.hasAttribute("aria-valuenow")) return;

      const next = Math.min(property === "value" ? number : previousValue, max);
      bar.dataset.indeterminate = "false";
      bar.setAttribute("aria-valuenow", String(next));
      fill.style.width = `${Math.max(0, Math.min(100, (next / max) * 100))}%`;
    });
  }

  /** `max` serves both inputs and progress bars. */
  function setMax(context) {
    return context.type === "progress" ? setProgress(context) : setInputBound(context);
  }

  const variantColors = (target) => ({
    primary: ["var(--theme-primary)", "var(--primary-foreground)"],
    secondary: ["var(--theme-secondary)", "var(--secondary-foreground)"],
    destructive: ["var(--destructive)", "var(--primary-foreground)"],
    ghost: ["transparent", "var(--theme-primary)"],
    outline: ["transparent", "var(--theme-primary)"],
    custom: [
      target.dataset.variantBackground || "var(--theme-primary)",
      target.dataset.variantColor || "var(--primary-foreground)",
    ],
  });

  function setVariant({ type, targets, value }) {
    const variants = ELEMENT_VARIANTS[type];
    if (!Array.isArray(variants) || !variants.includes(value))
      throw new Error("Choose a supported variant for the target element.");

    targets.forEach((target) => {
      [...target.classList]
        .filter((name) => name.startsWith("variant-"))
        .forEach((name) => target.classList.remove(name));
      target.classList.add("variant-" + value);

      if (type !== "button" && type !== "fab") return;
      const [background, color] = variantColors(target)[value];
      target.style.backgroundColor = background;
      target.style.color = color;
      if (value === "outline") {
        target.style.borderWidth ||= "1px";
        target.style.borderColor = "var(--theme-primary)";
      }
    });
  }

  function setIconClass({ type, targets, value }) {
    if (type !== "icon")
      throw new Error("The icon class property is only supported for icons.");
    if (!/^fa-[a-z0-9-]+$/.test(String(value)))
      throw new Error("Enter a valid Font Awesome icon class, such as fa-star.");
    targets.forEach((target) => {
      const icon = need(
        target.querySelector(":scope > i.fa-solid"),
        "The target icon is unavailable.",
      );
      [...icon.classList]
        .filter((name) => name.startsWith("fa-") && name !== "fa-solid")
        .forEach((name) => icon.classList.remove(name));
      icon.classList.add(value);
    });
  }

  function setImageSource({ type, targets, property, value }) {
    if (type !== "image")
      throw new Error("Image sources are only supported for Image elements.");
    const isAsset = property === "assetId";
    const source = isAsset
      ? (Object.hasOwn(IMAGE_ASSET_URLS, String(value)) ? IMAGE_ASSET_URLS[String(value)] : "")
      : String(value || "").trim();
    if (isAsset && !source) throw new Error("Choose an existing image asset.");
    if (source && safeImageUrl(source) !== source)
      throw new Error("Enter a valid image URL.");

    targets.forEach((target) => {
      if (!(target instanceof HTMLImageElement))
        throw new Error("The target Image element is unavailable.");
      if (source) target.setAttribute("src", source);
      else target.removeAttribute("src");
      target.classList.toggle("preview-image-empty", !source);
    });
  }

  // ---- `content` setters, keyed by element type -----------------------

  const textLikeSetter = (type) => (target, value) => {
    const content = target.querySelector("[data-localize-content]") || target;
    content.textContent = value;
    if (type === "fab" || type === "loading") setAria(target, value);
    if (type === "progress")
      setAria(target.querySelector("progress, [role='progressbar']"), value);
  };

  const ariaSetter = (target, value) => setAria(target, value);

  const controlLabelSetter = (target, value) => {
    need(
      target.querySelector(".control-label span"),
      "The target control label is unavailable.",
    ).textContent = value;
  };

  const layoutSetter = (target, value) => {
    let title = target.querySelector(":scope > .layout-title");
    if (!title) {
      title = document.createElement("strong");
      title.className = "layout-title";
      target.insertBefore(title, target.querySelector(".content-layout-children"));
    }
    title.textContent = value;
    setAria(target, value);
  };

  const CONTENT_SETTERS = {
    textarea(target, value) {
      const label = target.matches(".content-textarea-label")
        ? target.querySelector(":scope > [data-localize-content]")
        : target.querySelector(":scope > .content-textarea-label > [data-localize-content]");
      need(label, "The target Textarea element is unavailable.").textContent = value;
      setAria(target, value);
    },
    input(target, value) {
      target.placeholder = value;
    },
    list(target, value) {
      const select = need(target.querySelector("select"), "The target list is unavailable.");
      setAria(select, value);
      const placeholder = select.querySelector("option[disabled]");
      if (placeholder) placeholder.textContent = value;
    },
    checkbox: controlLabelSetter,
    switch: controlLabelSetter,
    radio: ariaSetter,
    icon: ariaSetter,
    collection: ariaSetter,
    card(target, value) {
      need(
        target.querySelector(".card-text"),
        "The target card content is unavailable.",
      ).textContent = value;
    },
    image(target, value) {
      target.setAttribute("alt", value);
    },
    accordion(target, value) {
      need(
        target.querySelector("[data-accordion-toggle] [data-localize-content]"),
        "The target accordion is unavailable.",
      ).textContent = value;
    },
    tab(target, value) {
      need(
        target.querySelector("[data-localize-content]"),
        "The target tab is unavailable.",
      ).textContent = value;
      const buttonLabel = tabTriggerFor(target)?.querySelector("[data-localize-content]");
      if (buttonLabel) buttonLabel.textContent = value;
    },
    tabs(target, value) {
      setAria(target, value);
      setAria(target.querySelector('[role="tablist"]'), value);
    },
  };
  LAYOUT_TYPES.forEach((type) => {
    CONTENT_SETTERS[type] = layoutSetter;
  });
  [
    "text", "heading", "button", "chip", "breadcrumbs",
    "badge", "fab", "toast", "loading", "progress",
  ].forEach((type) => {
    CONTENT_SETTERS[type] = textLikeSetter(type);
  });

  function setContent({ type, targets, value }) {
    const setter = CONTENT_SETTERS[type];
    if (!setter)
      throw new Error("Changing content is not supported for this element type.");
    targets.forEach((target) => setter(target, value));
  }

  // ---- dispatcher ------------------------------------------------------

  const PROPERTY_HANDLERS = {
    visibility: setVisibility,
    disabled: setDisabled,
    min: setInputBound,
    max: (context) =>
      context.type === "progress" || context.type === "input"
        ? setMax(context)
        : (() => {
          throw new Error("Unsupported target property: max");
        })(),
    checked: setChecked,
    value: (context) => {
      if (context.type !== "progress")
        throw new Error("Unsupported target property: value");
      setProgress(context);
    },
    variant: setVariant,
    iconClass: setIconClass,
    src: setImageSource,
    assetId: setImageSource,
    content: setContent,
  };

  function changeElementProperty(targetId, property, value, elementContext = null) {
    const type = need(ELEMENT_TYPES[targetId], "Select an existing target element.");
    const targets = getRuntimeElementTargets(targetId, elementContext);
    if (!targets.length) throw new Error("The target element is unavailable.");

    const context = { type, targetId, targets, property, value };

    if (typeof property === "string" && property.startsWith("plugin."))
      return setPluginProperty(context);

    const handler = Object.hasOwn(PROPERTY_HANDLERS, property)
      ? PROPERTY_HANDLERS[property]
      : null;
    if (!handler) throw new Error("Unsupported target property: " + property);
    handler(context);
  }

  function getRuntimeElementTargets(targetId, elementContext = null) {
    const selector = `[data-element-id="${CSS.escape(targetId)}"]`;
    const collectionId = ELEMENT_COLLECTION_IDS[targetId];
    const contextRow =
      collectionId &&
        elementContext instanceof Element &&
        getCollectionIdFromContext(elementContext) === collectionId
        ? elementContext.closest(COLLECTION_ITEM_SELECTOR)
        : null;

    if (contextRow) {
      const target = contextRow.querySelector(selector);
      return target ? [target] : [];
    }

    return [...document.querySelectorAll(selector)];
  }

  function applyTargetState(
    elementId,
    elementContext,
    missingIdMessage,
    applyFn,
    resultType,
  ) {
    if (!elementId) throw new Error(missingIdMessage);
    const targets = getRuntimeElementTargets(elementId, elementContext);
    if (!targets.length) throw new Error("Target element is unavailable.");

    targets.forEach(applyFn);
    return { type: resultType, elementId };
  }

  function setElementVisibility(elementId, visible, elementContext = null) {
    return applyTargetState(
      elementId,
      elementContext,
      "Select an element to show or hide.",
      (target) => {
        target.hidden = !visible;
      },
      visible ? "showElement" : "hideElement",
    );
  }

  function setElementEnabled(elementId, enabled, elementContext = null) {
    return applyTargetState(
      elementId,
      elementContext,
      "Select an element to enable or disable.",
      (target) => {
        target.disabled = !enabled;
      },
      enabled ? "enableElement" : "disableElement",
    );
  }

  function showMessageDialog(title, message) {
    const dialog = document.querySelector("#app-message-dialog");
    const heading = document.querySelector("#app-message-title");
    const content = document.querySelector("#app-message-content");
    if (!dialog || !heading || !content) {
      throw new Error("Message dialog is unavailable.");
    }

    heading.textContent = String(
      title || (appLanguage === "en" ? "Message" : "رسالة"),
    );
    content.textContent = String(message ?? "");
    dialog.hidden = false;
    document.querySelector("#app-message-close")?.focus();
  }

  function closeMessageDialog() {
    const dialog = document.querySelector("#app-message-dialog");
    if (dialog) dialog.hidden = true;
  }

  document.querySelector("#app-message-close")?.addEventListener("click", () => {
    closeMessageDialog();
  });

  function updateApiProgressIndicator() {
    const indicator = document.querySelector("#app-api-progress");
    if (!indicator) return;
    indicator.hidden =
      !API_PROGRESS_INDICATOR_ENABLED ||
      activeApiRequestCount === 0 ||
      PAGES[activePageId]?.kind === "splash";
  }

  function showApiProgress() {
    activeApiRequestCount += 1;
    updateApiProgressIndicator();
  }

  function hideApiProgress() {
    activeApiRequestCount = Math.max(0, activeApiRequestCount - 1);
    updateApiProgressIndicator();
  }

  function showErrorPage(message) {
    runtimeErrorSource = message;
    const localizedMessage = localizeAppMessage(runtimeErrorSource);
    setStatus("");

    const errorPageId = Object.keys(PAGES).find(
      (id) => PAGES[id].kind === "error",
    );
    if (errorPageId) {
      const errorMessage = document.querySelector("#runtime-error-message");
      if (errorMessage) errorMessage.textContent = localizedMessage;
      showPage(errorPageId);
    }

    runtimeErrorShown = true;
  }

  function dispatchEmbeddedAppError(detail) {
    document.dispatchEvent(
      new CustomEvent("embedded-app:error", { detail }),
    );
  }

  function extractRejectionMessage(reason) {
    if (reason instanceof Error && reason.message) return reason.message;
    if (typeof reason === "string" && reason.trim()) return reason;
    if (reason !== undefined && reason !== null) return String(reason);
    return DEFAULT_RUNTIME_ERROR_MESSAGE;
  }

  window.addEventListener("error", (event) => {
    const message = event.message || DEFAULT_RUNTIME_ERROR_MESSAGE;
    showErrorPage(message);
    dispatchEmbeddedAppError({
      message,
      source: event.filename || "",
      line: event.lineno || 0,
      column: event.colno || 0,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const message = extractRejectionMessage(event.reason);
    showErrorPage(message);
    dispatchEmbeddedAppError({
      message,
      type: "unhandledrejection",
    });
  });

  function readApiResponsePath(requestId, path, missingResponseMessage, missingPathMessage) {
    if (!Object.hasOwn(API_RESPONSES, requestId)) {
      throw new Error(missingResponseMessage);
    }
    const value = readPath(API_RESPONSES[requestId], path || "");
    if (value === undefined) {
      throw new Error(missingPathMessage);
    }
    return value;
  }

  function parseHelperValue(result, responseKey) {
    let data = result;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return data;
      }
    }

    const originalData = data;
    while (data && typeof data === "object") {
      if (Object.hasOwn(data, responseKey)) return data[responseKey];
      const nested = data.results ?? data.data;
      if (nested === undefined || nested === data) break;
      data = nested;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return originalData;
        }
      }
    }
    return originalData;
  }

  async function getTwkValue(key) {
    const fieldKey = String(key).toLowerCase();
    const field = TWK_FIELDS[fieldKey];
    if (!field) {
      throw new Error(`TWK field is not configured: ${fieldKey}`);
    }
    const method = window.TWK && window.TWK[field.method];
    if (typeof method !== "function") {
      throw new Error(
        `TWK.${field.method} is unavailable for field ${fieldKey}.`,
      );
    }
    return parseHelperValue(await method.call(window.TWK), field.responseKey);
  }

  const VARIABLE_SOURCE_RESOLVERS = {
    static: async (variable) => variable.value,
    twk: async (variable) => getTwkValue(variable.fieldKey),
    form: async (variable, { formValues }) => {
      if (!Object.hasOwn(formValues, variable.fieldName)) {
        throw new Error(`Form field not found: ${variable.fieldName}`);
      }
      return formValues[variable.fieldName];
    },
    variable: async (variable, { formValues, elementContext, nextVisited }) => {
      const source = VARIABLES.find((item) => item.id === variable.path);
      if (!source) {
        throw new Error(`Variable source is unavailable: ${variable.name}`);
      }
      return resolveVariableValue(
        source.name,
        formValues,
        elementContext,
        nextVisited,
      );
    },
    item: async (variable, { formValues, elementContext, nextVisited }) =>
      resolveActionValue(
        `{{item.${variable.path}}}`,
        formValues,
        elementContext,
        new Set(),
        nextVisited,
      ),
    extra: async (variable, { formValues, elementContext, nextVisited }) =>
      resolveActionValue(
        `{{${variable.path}}}`,
        formValues,
        elementContext,
        new Set(),
        nextVisited,
      ),
    element: async (variable, { elementContext }) =>
      getRuntimeElementPropertyValue(
        variable.elementId,
        variable.property,
        elementContext,
      ),
    api: async (variable) =>
      readApiResponsePath(
        variable.requestId,
        variable.path || "",
        `API response is not available for variable: ${variable.name}`,
        `API response path is unavailable for variable: ${variable.name}`,
      ),
  };

  async function resolveVariableValue(
    name,
    formValues = {},
    elementContext = null,
    visited = new Set(),
  ) {
    const variable = VARIABLES.find((item) => item.name === name);
    if (!variable) {
      throw new Error(`Unknown variable: ${name}`);
    }
    if (Object.hasOwn(VARIABLE_OVERRIDES, variable.id)) {
      return readValuePath(
        VARIABLE_OVERRIDES[variable.id],
        variable.propertyPath,
      );
    }
    if (visited.has(variable.id)) {
      throw new Error(`Circular variable reference: ${name}`);
    }

    const nextVisited = new Set(visited);
    nextVisited.add(variable.id);
    const resolver =
      VARIABLE_SOURCE_RESOLVERS[variable.source] || VARIABLE_SOURCE_RESOLVERS.api;

    const rawValue = await resolver(variable, {
      formValues,
      elementContext,
      nextVisited,
    });

    return readValuePath(rawValue, variable.propertyPath);
  }

  async function resolveApiValue(key) {
    const separator = key.indexOf(".");
    if (separator < 1) {
      throw new Error(
        "API value tokens require a request ID and response path.",
      );
    }
    const requestId = key.slice(0, separator).trim();
    const path = key.slice(separator + 1).trim();
    return readApiResponsePath(
      requestId,
      path,
      `API response is not available for request: ${requestId}`,
      `API response path is unavailable: ${path}`,
    );
  }

  function formatTokenReplacement(result, encodeTokens, isCompleteToken) {
    const tokenValue =
      result && typeof result === "object"
        ? JSON.stringify(result)
        : String(result ?? "");
    return encodeTokens && !isCompleteToken
      ? encodeURIComponent(tokenValue)
      : tokenValue;
  }

  async function resolveString(
    value,
    encodeTokens,
    formValues = {},
    elementContext = null,
  ) {
    const text = String(value ?? "");
    const matches = [...text.matchAll(TOKEN_PATTERN)];
    if (!matches.length) return text;

    const isCompleteToken = EXACT_TOKEN_PATTERN.test(text);
    const replacements = await Promise.all(
      matches.map(async (match) => {
        const result = await resolveActionValue(
          match[0],
          formValues,
          elementContext,
        );
        return formatTokenReplacement(result, encodeTokens, isCompleteToken);
      }),
    );

    let index = 0;
    return text.replace(TOKEN_PATTERN, () => replacements[index++]);
  }

  function readPath(value, path) {
    return path
      .split(".")
      .filter(Boolean)
      .reduce((current, key) => {
        if (UNSAFE_PATH_KEYS.has(key)) return undefined;
        if (Array.isArray(current) && /^\d+$/.test(key)) {
          return current[Number(key)];
        }
        return current && typeof current === "object" ? current[key] : undefined;
      }, value);
  }

  function readValuePath(value, path) {
    const valuePath = String(path || "").trim();
    let source = value;
    if (
      typeof source === "string" &&
      (source.trim().startsWith("{") || source.trim().startsWith("["))
    ) {
      try {
        source = JSON.parse(source);
      } catch {
        if (valuePath) return undefined;
      }
    }
    return valuePath ? readPath(source, valuePath) : source;
  }

  function createPlaceholderOption(placeholderText) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = placeholderText;
    return placeholder;
  }

  function buildSelectOption(item, index, config, selectedValues) {
    const itemValue = config.valuePath ? readPath(item, config.valuePath) : item;
    const itemLabel = config.labelPath ? readPath(item, config.labelPath) : item;
    const value = itemValue === undefined ? item : itemValue;
    const label =
      itemLabel === undefined || itemLabel === null
        ? displayValue(item)
        : displayValue(itemLabel);

    const option = document.createElement("option");
    option.value = String(index);
    option.dataset.formValue = JSON.stringify(value);
    option.textContent = label;
    option.selected = selectedValues.has(option.dataset.formValue);
    return option;
  }

  function populateList(select, data, config) {
    if (!Array.isArray(data)) {
      throw new Error("List data source must resolve to an array.");
    }

    const selectedValues = new Set(
      [...select.selectedOptions].map((option) => option.dataset.formValue),
    );
    const placeholderText = select.getAttribute("aria-label") || "اختر عنصراً";

    select.replaceChildren();
    if (!select.multiple) {
      select.append(createPlaceholderOption(placeholderText));
    }

    const options = data.map((item, index) =>
      buildSelectOption(item, index, config, selectedValues),
    );
    select.append(...options);

    if (
      !select.multiple &&
      ![...select.options].some((option) => option.selected && !option.disabled)
    ) {
      select.selectedIndex = 0;
    }
  }

  function emitRuntimeError(message, extraDetail = {}) {
    showErrorPage(message);
    document.dispatchEvent(
      new CustomEvent("embedded-app:error", {
        detail: { message, ...extraDetail },
      }),
    );
  }

  function hydrateCollectionItemTemplate(templateContent, record) {
    const container = document.createElement("div");
    container.innerHTML = templateContent;
    applyElementLocalizations(container);

    container.querySelectorAll("[data-element-id]").forEach((element) => {
      collectionInstanceId += 1;
      element.id = `${element.dataset.elementId}--instance-${collectionInstanceId}`;
    });

    container
      .querySelectorAll("[data-item-label-path], [data-item-value-path]")
      .forEach((element) => {
        const labelPath = element.dataset.itemLabelPath || "";
        const valuePath = element.dataset.itemValuePath || "";
        const label = labelPath ? readPath(record, labelPath) : undefined;
        const value = valuePath
          ? readPath(record, valuePath)
          : element.classList.contains("content-radio")
            ? record
            : undefined;

        if (label !== undefined) {
          const labelNode = element.querySelector(".control-label span:last-child");
          if (labelNode) labelNode.textContent = displayValue(label);
        }

        if (value !== undefined) {
          const serializedValue = JSON.stringify(value);
          element
            .querySelectorAll('input[type="checkbox"], input[type="radio"]')
            .forEach((control) => {
              control.dataset.formValue = serializedValue;
            });
        }
      });

    return container;
  }

  async function renderCollectionItem(templateContent, record, target) {
    const item = document.createElement("div");
    item.className = "content-collection-item";
    item.dataset.collectionRecord = JSON.stringify(record);

    const hydrated = hydrateCollectionItemTemplate(templateContent, record);
    while (hydrated.firstChild) {
      item.append(hydrated.firstChild);
    }
    target.append(item);

    mountPluginElements(item, PLUGIN_DEFINITIONS);
    await runCollectionItemActions(item, "onItemRender");

    item.querySelectorAll("[data-bind-item]").forEach((element) => {
      const value = readPath(record, element.dataset.bindItem);
      if (value === undefined) return;
      applyDataBoundValue(element, value);
    });

    await updateExtraBindings(collectFormValues(), item);
    updateElementPropertyBindings(item);
    await runCollectionItemActions(item, "onItemDidRender");
  }

  async function populateCollection(collection, items) {
    if (!Array.isArray(items)) {
      throw new Error("Custom list data source must resolve to an array.");
    }

    const collectionId = collection.dataset.collectionId;
    const template = document.querySelector(
      `[data-collection-template="${CSS.escape(collectionId)}"]`,
    );
    const target = collection.querySelector(COLLECTION_ITEMS_CONTAINER_SELECTOR);
    if (!template || !target) {
      throw new Error("Custom list template is unavailable.");
    }

    ACTIVE_COLLECTION_ROWS.delete(collectionId);
    unmountPluginElements(target);
    target.replaceChildren();

    for (const record of items) {
      await renderCollectionItem(template.textContent, record, target);
    }
  }

  async function populateRequestLists(requestId, data) {
    document
      .querySelectorAll("[data-list-source='endpoint']")
      .forEach((select) => {
        if (select.dataset.listRequest !== requestId) return;
        const config = LIST_CONFIGS[select.dataset.listId] || {};
        const items = readPath(data, select.dataset.listPath || "");
        populateList(select, items, config);
      });

    const collections = [
      ...document.querySelectorAll("[data-collection-source='endpoint']"),
    ];
    for (const collection of collections) {
      if (collection.dataset.collectionRequest !== requestId) continue;
      const items = readPath(data, collection.dataset.collectionPath || "");
      await populateCollection(collection, items);
    }
  }

  async function runCollectionItemActions(item, eventName) {
    const lifecycleEvent = new Event(eventName);
    const nodes = [...item.querySelectorAll("[data-element-id]")].filter(
      (element) => element.closest(COLLECTION_ITEM_SELECTOR) === item,
    );

    for (const element of nodes) {
      const action = ELEMENT_ACTIONS[element.dataset.elementId];
      const hasMatchingAction =
        action?.event === eventName ||
        action?.handlers?.some((handler) => handler.event === eventName);
      if (!hasMatchingAction) continue;

      try {
        await handleComponentEventForElement(lifecycleEvent, element);
      } catch (error) {
        emitRuntimeError(
          `Unable to run Collection item lifecycle action: ${error.message}`,
          {
            elementId: element.dataset.elementId,
            event: eventName,
          },
        );
      }
    }
  }

  async function initializeStaticCollections() {
    const collections = [
      ...document.querySelectorAll("[data-collection-source='static']"),
    ];
    for (const collection of collections) {
      const config = COLLECTION_CONFIGS[collection.dataset.collectionId] || {};
      await populateCollection(collection, config.items || []);
    }
    updateElementPropertyBindings();
  }

  const staticCollectionsReady = initializeStaticCollections().catch((error) => {
    emitRuntimeError(`Unable to initialize collection items: ${error.message}`);
  });

  function displayValue(value) {
    if (value === undefined || value === null) return "";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  }

  function loadFunctionScript(assetId) {
    const path = FUNCTION_SCRIPT_PATHS[assetId];
    if (!path) {
      throw new Error("The selected JavaScript asset is unavailable.");
    }
    if (FUNCTION_SCRIPT_PROMISES.has(assetId)) {
      return FUNCTION_SCRIPT_PROMISES.get(assetId);
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL(path, document.baseURI).href;
      script.async = true;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener(
        "error",
        () => reject(new Error(`Unable to load JavaScript asset: ${path}`)),
        { once: true },
      );
      document.head.append(script);
    }).catch((error) => {
      FUNCTION_SCRIPT_PROMISES.delete(assetId);
      throw error;
    });

    FUNCTION_SCRIPT_PROMISES.set(assetId, promise);
    return promise;
  }

  function getNamedGlobalFunction(name) {
    const parts = String(name || "").trim().split(".");
    if (
      !parts.length ||
      parts.some(
        (part) =>
          !VALID_IDENTIFIER_PATTERN.test(part) || UNSAFE_PATH_KEYS.has(part),
      )
    ) {
      throw new Error("Enter a valid global function name.");
    }

    let value = globalThis;
    for (const part of parts) {
      value = value?.[part];
    }
    if (typeof value !== "function") {
      throw new Error(`Global function is unavailable: ${name}`);
    }
    return value;
  }

  async function resolveFunctionCallable(action, elementContext) {
    if (action.functionSource === "asset") {
      await loadFunctionScript(action.scriptAssetId);
      return {
        fn: getNamedGlobalFunction(action.functionName),
        thisArg: globalThis,
      };
    }

    if (action.functionSource === "plugin") {
      if (!action.pluginElementId) {
        throw new Error("Select a plugin element with an exported function.");
      }
      const pluginHost = getRuntimeElementTargets(
        action.pluginElementId,
        elementContext,
      ).find((target) => target.matches("[data-plugin-id]"));
      if (!pluginHost) {
        throw new Error("The selected plugin element is unavailable.");
      }

      const fn = pluginHost.__embedlyPluginFunctions?.get(action.functionName);
      if (typeof fn !== "function") {
        throw new Error(
          `The selected plugin does not export function: ${action.functionName}`,
        );
      }
      return { fn, thisArg: pluginHost };
    }

    if (action.functionSource === "global") {
      return {
        fn: getNamedGlobalFunction(action.functionName),
        thisArg: globalThis,
      };
    }

    throw new Error("Select a valid JavaScript function source.");
  }

  async function parseAndResolveFunctionParameters(
    rawParameters,
    formValues,
    elementContext,
  ) {
    let parsed;
    try {
      parsed = JSON.parse(rawParameters || "[]");
    } catch {
      throw new Error("Function parameters must be a valid JSON array.");
    }
    if (!Array.isArray(parsed)) {
      throw new Error("Function parameters must be a JSON array.");
    }

    const resolved = await resolveActionValue(
      parsed,
      formValues,
      elementContext,
    );
    if (!Array.isArray(resolved)) {
      throw new Error("Resolved function parameters must be a JSON array.");
    }
    return resolved;
  }

  async function runFunctionAction(action, formValues, elementContext) {
    const { fn, thisArg } = await resolveFunctionCallable(action, elementContext);
    const resolvedParameters = await parseAndResolveFunctionParameters(
      action.parameters,
      formValues,
      elementContext,
    );
    const result = await fn.apply(thisArg, resolvedParameters);

    const resultVariable = VARIABLES.find(
      (variable) =>
        variable.id === action.resultVariableId && variable.source === "static",
    );
    if (action.resultVariableId && !resultVariable) {
      throw new Error(
        "Select an existing static variable for the function result.",
      );
    }
    if (resultVariable) {
      VARIABLE_OVERRIDES[resultVariable.id] = result;
      await updateVariableBindings(formValues);
    }

    return {
      type: "function",
      functionName: action.functionName,
      functionSource: action.functionSource || "global",
      parameters: resolvedParameters,
      result,
      resultVariable: resultVariable?.name || "",
    };
  }

  function valuesAreEqual(left, right) {
    if (Object.is(left, right)) return true;
    if (
      left &&
      right &&
      typeof left === "object" &&
      typeof right === "object"
    ) {
      return JSON.stringify(left) === JSON.stringify(right);
    }
    return false;
  }

  function normalizeFilePickerValue(value) {
    let files = value;
    if (typeof files === "string") {
      try {
        files = JSON.parse(files);
      } catch {
        throw new Error("File picker value must be a JSON array.");
      }
    }
    if (files == null) return [];
    if (!Array.isArray(files)) {
      throw new Error("File picker value must be a JSON array.");
    }

    return files.map((file) => {
      if (
        !file ||
        typeof file !== "object" ||
        typeof file.mime_type !== "string" ||
        typeof file.data !== "string"
      ) {
        throw new Error("Each file must include a MIME type and base64 data.");
      }
      return {
        type: "image",
        mime_type: file.mime_type,
        data: file.data,
      };
    });
  }

  function applyCheckboxBoundValue(element, value) {
    const control = element.matches('input[type="checkbox"]')
      ? element
      : element.querySelector('input[type="checkbox"]');
    if (!control) return;

    let fieldValue = true;
    try {
      fieldValue = JSON.parse(control.dataset.formValue || "true");
    } catch {
      throw new Error("Invalid checkbox binding value.");
    }

    control.checked =
      typeof value === "boolean" ? value : valuesAreEqual(value, fieldValue);
  }

  function applyRadioBoundValue(element, value) {
    const controls = element.matches('input[type="radio"]')
      ? [element]
      : [...element.querySelectorAll('input[type="radio"]')];

    controls.forEach((control) => {
      let optionValue;
      try {
        optionValue = JSON.parse(control.dataset.formValue || "null");
      } catch {
        throw new Error("Invalid radio option value.");
      }
      control.checked = valuesAreEqual(value, optionValue);
    });
  }

  function applyLocalizedContentValue(element, contentNode, value) {
    const text = displayValue(value);
    contentNode.textContent = text;
    if (element.classList.contains("content-loading")) {
      element.setAttribute("aria-label", text);
    }
    if (element.classList.contains("content-progress")) {
      element
        .querySelector("[role='progressbar']")
        ?.setAttribute("aria-label", text);
    }
    if (element.classList.contains("content-fab")) {
      element.setAttribute("aria-label", text);
    }
  }

  function applyBoundValue(element, value) {
    const kind = element.dataset.bindKind;
    if (kind === "checkbox") {
      applyCheckboxBoundValue(element, value);
      return;
    }
    if (kind === "radio") {
      applyRadioBoundValue(element, value);
      return;
    }
    if (ELEMENT_TYPES[element.dataset.elementId] === "filePicker") {
      const files = normalizeFilePickerValue(value);
      element.dataset.filePickerValue = JSON.stringify(files);
      return;
    }

    const localizedContent = element.querySelector("[data-localize-content]");
    if (localizedContent) {
      applyLocalizedContentValue(element, localizedContent, value);
      return;
    }

    if (element instanceof HTMLInputElement) {
      if (element.hidden || element.type === "range") {
        element.value = displayValue(value);
      } else {
        element.placeholder = displayValue(value);
      }
    } else {
      element.textContent = displayValue(value);
    }
  }

  function applyDataBoundValue(element, value) {
    applyBoundValue(
      element,
      readValuePath(value, element.dataset.bindObjectPath),
    );
  }

  function resolvePropertyTarget(elementId, elementContext) {
    const collectionId = ELEMENT_COLLECTION_IDS[elementId];
    const contextRow =
      collectionId && getCollectionIdFromContext(elementContext) === collectionId
        ? elementContext.closest(".content-collection-item")
        : null;

    const targets = getRuntimeElementTargets(elementId, elementContext);
    const fallbackRowTarget =
      !contextRow && collectionId
        ? ACTIVE_COLLECTION_ROWS.get(collectionId)?.querySelector(
          `[data-element-id="${CSS.escape(elementId)}"]`,
        )
        : null;

    const target = targets[0] || fallbackRowTarget || null;
    if (!target) {
      throw new Error(`Element property source is unavailable: ${elementId}`);
    }
    return target;
  }

  function resolvePluginPropertyValue(elementId, target, property) {
    const pluginId = PLUGIN_ELEMENT_IDS[elementId];
    const plugin = PLUGIN_DEFINITIONS[pluginId];
    if (ELEMENT_TYPES[elementId] !== "custom" || !plugin) {
      throw new Error("Plugin properties are unavailable for this element.");
    }

    let values = {};
    if (target.dataset.pluginProperties) {
      try {
        values = JSON.parse(target.dataset.pluginProperties);
      } catch {
        throw new Error("Plugin property data is invalid.");
      }
    }

    if (!values || typeof values !== "object" || Array.isArray(values)) {
      throw new Error("Plugin property data must be an object.");
    }
    if (property === "plugin") return values;

    const key = property.slice("plugin.".length);
    if (!plugin.properties.some((item) => item.key === key)) {
      throw new Error(`Plugin property is unavailable: ${key}`);
    }
    return values[key];
  }

  function getRadioLabelText(radioInput) {
    const label = radioInput.closest("label");
    if (!label) return "";
    return (
      label.querySelector("span")?.textContent || label.textContent.trim() || ""
    );
  }

  function resolveElementValueProperty(target, control, elementType) {
    if (elementType === "filePicker" || target.hasAttribute("data-file-picker")) {
      throw new Error(
        "File Picker selected images are available through the files property.",
      );
    }
    if (elementType === "radio") {
      const selected = target.querySelector('input[type="radio"]:checked');
      return selected ? readFormValue(selected) : "";
    }
    if (
      (elementType === "checkbox" || elementType === "switch") &&
      control instanceof HTMLInputElement
    ) {
      return readFormValue(control);
    }
    if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement
    ) {
      return control.value;
    }
    if (control instanceof HTMLSelectElement) {
      const values = [...control.selectedOptions]
        .filter((option) => !option.disabled)
        .map(readFormValue);
      return control.multiple ? values : values[0] ?? "";
    }
    if (elementType === "progress" && control) {
      return Number(control.getAttribute("aria-valuenow")) || 0;
    }
    throw new Error("Value is unavailable for this element.");
  }

  function resolveSelectedLabelProperty(target, control, elementType, registeredProperties) {
    if (!registeredProperties.includes("selectedLabel")) {
      throw new Error("Selected label is unavailable for this element.");
    }
    if (control instanceof HTMLSelectElement) {
      const labels = [...control.selectedOptions]
        .filter((option) => !option.disabled)
        .map((option) => option.textContent || "");
      return control.multiple ? labels : labels[0] ?? "";
    }
    if (elementType === "radio") {
      const selected = target.querySelector('input[type="radio"]:checked');
      return selected ? getRadioLabelText(selected) : "";
    }
    throw new Error("Selected label is unavailable for this element.");
  }

  function resolveOptionsProperty(target, control, elementType, registeredProperties) {
    if (!registeredProperties.includes("options")) {
      throw new Error("Options are unavailable for this element.");
    }
    if (control instanceof HTMLSelectElement) {
      return [...control.options].map((option) => ({
        label: option.textContent || "",
        value: readFormValue(option),
        selected: option.selected,
        disabled: option.disabled,
      }));
    }
    if (elementType === "radio") {
      return [...target.querySelectorAll('input[type="radio"]')].map(
        (option) => ({
          label: getRadioLabelText(option),
          value: readFormValue(option),
          selected: option.checked,
          disabled: option.disabled,
        }),
      );
    }
    throw new Error("Options are unavailable for this element.");
  }

  function getRuntimeElementPropertyValue(elementId, property, elementContext) {
    const target = resolvePropertyTarget(elementId, elementContext);
    const control = target.matches(FORM_CONTROL_SELECTOR)
      ? target
      : target.querySelector(FORM_CONTROL_SELECTOR);
    const elementType = ELEMENT_TYPES[elementId];
    const registeredProperties =
      COMPONENT_RUNTIME_PROPERTY_REGISTRY[elementType] || [];

    if (
      typeof property === "string" &&
      (property === "plugin" || property.startsWith("plugin."))
    ) {
      return resolvePluginPropertyValue(elementId, target, property);
    }

    switch (property) {
      case "id":
        return target.dataset.elementId || elementId;
      case "src":
        if (!(target instanceof HTMLImageElement)) {
          throw new Error("Image URL is only available for image elements.");
        }
        return target.getAttribute("src") || "";
      case "checked":
        if (!(control instanceof HTMLInputElement)) {
          throw new Error("Checked state is unavailable for this element.");
        }
        return control.checked;
      case "value":
        return resolveElementValueProperty(target, control, elementType);
      case "files":
        if (
          !registeredProperties.includes("files") &&
          !target.hasAttribute("data-file-picker")
        ) {
          throw new Error("Selected files are only available for file pickers.");
        }
        try {
          return normalizeFilePickerValue(target.dataset.filePickerValue || "[]");
        } catch (error) {
          throw new Error(`File picker value is invalid: ${error.message}`);
        }
      case "mode":
        if (
          !registeredProperties.includes("mode") &&
          !target.hasAttribute("data-file-picker")
        ) {
          throw new Error("File picker mode is only available for file pickers.");
        }
        return target.dataset.filePickerMode || "single";
      case "min":
        if (!registeredProperties.includes("min")) {
          throw new Error("Minimum is unavailable for this element.");
        }
        if (control instanceof HTMLInputElement) return control.min;
        if (elementType === "progress") return 0;
        throw new Error("Minimum is unavailable for this element.");
      case "max":
        if (!registeredProperties.includes("max")) {
          throw new Error("Maximum is unavailable for this element.");
        }
        if (elementType === "progress") {
          return Number(control?.getAttribute("aria-valuemax")) || 100;
        }
        if (control instanceof HTMLInputElement) return control.max;
        throw new Error("Maximum is unavailable for this element.");
      case "isValid":
        if (
          !registeredProperties.includes("isValid") &&
          !(control instanceof HTMLTextAreaElement)
        ) {
          throw new Error("Validity is unavailable for this element.");
        }
        if (
          control instanceof HTMLInputElement ||
          control instanceof HTMLSelectElement ||
          control instanceof HTMLTextAreaElement
        ) {
          return control.checkValidity();
        }
        throw new Error("Validity is unavailable for this element.");
      case "characterCount":
        if (
          !registeredProperties.includes("characterCount") &&
          !(control instanceof HTMLTextAreaElement)
        ) {
          throw new Error("Character count is unavailable for this element.");
        }
        if (
          control instanceof HTMLInputElement ||
          control instanceof HTMLTextAreaElement
        ) {
          return control.value.length;
        }
        throw new Error("Character count is unavailable for this element.");
      case "selectedLabel":
        return resolveSelectedLabelProperty(
          target,
          control,
          elementType,
          registeredProperties,
        );
      case "options":
        return resolveOptionsProperty(
          target,
          control,
          elementType,
          registeredProperties,
        );
      case "dataset":
      case "data":
      case "dataAttributes": {
        const dataset = { ...target.dataset };
        if (control && control !== target) {
          Object.assign(dataset, control.dataset);
        }
        return dataset;
      }
      case "open":
        if (elementType !== "accordion") {
          throw new Error("Open state is only available for accordion elements.");
        }
        return target.dataset.accordionOpen === "true";
      case "selected":
        if (!target.classList.contains("content-chip")) {
          throw new Error("Selected state is only available for chip elements.");
        }
        return target.getAttribute("aria-pressed") === "true";
      case "disabled":
        return control?.matches(INTERACTIVE_DISABLE_SELECTOR)
          ? control.disabled
          : target.getAttribute("aria-disabled") === "true";
      case "visible":
        return !target.hidden;
      case "content":
        if (target instanceof HTMLInputElement) {
          return target.getAttribute("placeholder") || "";
        }
        return (
          target.querySelector("[data-localize-content]")?.textContent ||
          target.textContent.trim()
        );
      default:
        throw new Error(`Unsupported element property: ${property}`);
    }
  }

  function safeImageUrl(value) {
    const url = String(value || "").trim();
    if (!url || url.slice(0, 11).toLowerCase() === "javascript:") {
      return "";
    }
    if (BASE64_IMAGE_DATA_URL_REGEX.test(url)) {
      return url;
    }
    try {
      const parsed = new URL(url, location.href);
      return SAFE_IMAGE_PROTOCOLS.has(parsed.protocol) ? url : "";
    } catch {
      return "";
    }
  }

  function getRuntimeContextElementId(elementContext) {
    return (
      elementContext?.closest?.("[data-element-id]")?.dataset.elementId || ""
    );
  }

  function collectMatchingNodes(root, selector) {
    if (!root) return [];
    return [
      ...(root.matches?.(selector) ? [root] : []),
      ...root.querySelectorAll(selector),
    ];
  }

  function updateElementPropertyBindings(root = document) {
    const bindings = collectMatchingNodes(root, "[data-bind-element-id]");

    bindings.forEach((element) => {
      try {
        const value = getRuntimeElementPropertyValue(
          element.dataset.bindElementId,
          element.dataset.bindElementProperty,
          element,
        );
        if (value !== undefined) {
          applyDataBoundValue(element, value);
        }
      } catch (error) {
        emitRuntimeError(
          `Unable to resolve element property binding: ${error.message}`,
          {
            elementId: element.dataset.elementId,
            sourceElementId: element.dataset.bindElementId,
            property: element.dataset.bindElementProperty,
          },
        );
      }
    });
  }

  function updateFormBindings(formValues = collectFormValues(), root = document) {
    const bindings = collectMatchingNodes(root, "[data-bind-form]");

    bindings.forEach((element) => {
      const fieldName = element.dataset.bindForm;
      if (Object.hasOwn(formValues, fieldName)) {
        applyDataBoundValue(element, formValues[fieldName]);
      }
    });
  }

  function getCollectionIdFromContext(elementContext) {
    const row = elementContext?.closest(".content-collection-item");
    return (
      row
        ?.closest(".content-collection-items")
        ?.closest("[data-collection-id]")?.dataset.collectionId || ""
    );
  }

  function getExtraDataContext(elementId, elementContext) {
    const collectionId = ELEMENT_COLLECTION_IDS[elementId];
    if (!collectionId) return elementContext;
    if (getCollectionIdFromContext(elementContext) === collectionId) {
      return elementContext.closest(".content-collection-item");
    }
    const activeRow = ACTIVE_COLLECTION_ROWS.get(collectionId);
    return activeRow?.isConnected ? activeRow : null;
  }

  function isExtraReferenceUnavailable(
    reference,
    formValues,
    elementContext,
    visited,
    collectionContextId,
  ) {
    const extraMatch = reference.match(EXTRA_REFERENCE_REGEX);
    if (!extraMatch) return { matched: false, unavailable: false };

    const [, sourceElementId, extraKey] = extraMatch;
    const identity = `${sourceElementId}.extra.${extraKey}`;
    if (visited.has(identity)) {
      return { matched: true, unavailable: false };
    }

    const entry = ELEMENT_EXTRA_DATA[sourceElementId]?.find(
      (item) => item.key === extraKey,
    );
    if (!entry) {
      return { matched: true, unavailable: false };
    }

    const nextVisited = new Set(visited);
    nextVisited.add(identity);
    const sourceCollectionId =
      ELEMENT_COLLECTION_IDS[sourceElementId] || collectionContextId;
    const sourceContext = getExtraDataContext(sourceElementId, elementContext);

    return {
      matched: true,
      unavailable: hasUnavailableExtraDataDependency(
        entry.value,
        formValues,
        sourceContext,
        nextVisited,
        sourceCollectionId,
      ),
    };
  }

  function isTokenSourceUnavailable(
    reference,
    formValues,
    elementContext,
    collectionContextId,
  ) {
    const separator = reference.indexOf(".");
    if (separator < 1) return false;

    const source = reference.slice(0, separator).toLowerCase();
    const key = reference.slice(separator + 1).trim();

    if (
      source === "item" &&
      !elementContext?.closest(".content-collection-item") &&
      collectionContextId
    ) {
      return true;
    }
    if (source === "api") {
      const requestSeparator = key.indexOf(".");
      if (
        requestSeparator > 0 &&
        !Object.hasOwn(API_RESPONSES, key.slice(0, requestSeparator))
      ) {
        return true;
      }
    }
    if (source === "form" && !Object.hasOwn(formValues, key)) {
      return true;
    }
    if (source === "var") {
      const variable = VARIABLES.find((item) => item.name === key);
      if (
        variable?.source === "form" &&
        !Object.hasOwn(formValues, variable.fieldName)
      ) {
        return true;
      }
      if (
        variable?.source === "endpoint" &&
        !Object.hasOwn(API_RESPONSES, variable.requestId)
      ) {
        return true;
      }
    }
    return false;
  }

  function hasUnavailableExtraDataDependency(
    value,
    formValues,
    elementContext,
    visited = new Set(),
    collectionContextId = "",
  ) {
    if (typeof value !== "string") return false;

    for (const match of value.matchAll(TOKEN_PATTERN)) {
      const reference = match[1].trim();
      const extraCheck = isExtraReferenceUnavailable(
        reference,
        formValues,
        elementContext,
        visited,
        collectionContextId,
      );
      if (extraCheck.matched) {
        if (extraCheck.unavailable) return true;
        continue;
      }

      if (
        isTokenSourceUnavailable(
          reference,
          formValues,
          elementContext,
          collectionContextId,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  async function updateExtraBindings(formValues = {}, root = document) {
    const bindings = collectMatchingNodes(root, "[data-bind-extra]");

    for (const element of bindings) {
      const tokenExpression = `{{${element.dataset.bindExtra}}}`;
      try {
        if (
          hasUnavailableExtraDataDependency(tokenExpression, formValues, element)
        ) {
          continue;
        }
        const value = await resolveActionValue(
          tokenExpression,
          formValues,
          element,
        );
        applyDataBoundValue(element, value);
      } catch (error) {
        emitRuntimeError(
          `Unable to resolve extra data binding: ${error.message}`,
          {
            elementId: element.dataset.elementId,
            reference: element.dataset.bindExtra,
          },
        );
      }
    }

    updateElementPropertyBindings(root);
  }

  function isVariableDataReady(variable, visited = new Set()) {
    if (!variable || visited.has(variable.id)) return true;
    const nextVisited = new Set(visited);
    nextVisited.add(variable.id);

    if (variable.source === "endpoint") {
      return Object.hasOwn(API_RESPONSES, variable.requestId);
    }
    if (variable.source === "variable") {
      const source = VARIABLES.find((item) => item.id === variable.path);
      return Boolean(source) && isVariableDataReady(source, nextVisited);
    }
    return true;
  }

  async function updateVariableBindings(formValues = {}) {
    const bindings = [...document.querySelectorAll("[data-bind-variable]")];
    await Promise.all(
      bindings.map(async (element) => {
        const variable = VARIABLES.find(
          (item) => item.id === element.dataset.bindVariable,
        );
        if (!variable) return;
        if (
          (variable.source === "form" &&
            !Object.hasOwn(formValues, variable.fieldName)) ||
          !isVariableDataReady(variable)
        )
          return;
        try {
          const value = await resolveVariableValue(
            variable.name,
            formValues,
            element,
          );
          if (value === undefined) return;
          applyDataBoundValue(element, value);
        } catch (error) {
          const message = "Unable to resolve variable " + variable.name + ": " + error.message;
          showErrorPage(message);
          document.dispatchEvent(
            new CustomEvent("embedded-app:error", {
              detail: { variable: variable.name, message },
            }),
          );
        }
      }),
    );
    await updateExtraBindings(formValues);
    updateFormBindings(formValues);
  }

  function isFormFieldEventTarget(target) {
    return target instanceof Element && Boolean(target.closest(REQUIRED_FORM_CONTROLS_SELECTOR));
  }

  function reportBindingError(error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "An unexpected error occurred while updating bindings.";

    showErrorPage(message);
    document.dispatchEvent(
      new CustomEvent("embedded-app:error", {
        detail: { message },
      }),
    );
  }

  async function refreshFormBindings() {
    const formValues = collectFormValues();
    await Promise.all([
      updateVariableBindings(formValues),
      updateExtraBindings(formValues),
      updateFormBindings(formValues),
      updateElementPropertyBindings(),
    ]);
  }

  document.addEventListener("input", (event) => {
    if (!isFormFieldEventTarget(event.target)) return;

    refreshFormBindings().catch(reportBindingError);
  });

  function getFieldIdentifier(control) {
    return control.dataset.formName || control.name || control.id || "unknown";
  }

  function readFormValue(control) {
    const raw = control?.dataset?.formValue;
    if (raw === undefined) {
      return control?.value;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      const fieldName = getFieldIdentifier(control);
      throw new Error(`Invalid JSON value configured for form field ${fieldName}.`, {
        cause: error,
      });
    }
  }

  function getActivePageSheets(pageId) {
    return [...document.querySelectorAll(ACTIVE_SHEET_SELECTOR)].filter(
      (sheet) =>
        sheet.dataset.sheetPage === pageId &&
        !sheet.hidden &&
        sheet.classList.contains(ACTIVE_SHEET_CLASS),
    );
  }

  function getActivePageFormControls(selector, elementContext) {
    const contextElement =
      elementContext instanceof Element ? elementContext : null;
    const contextPage = contextElement?.closest("[data-app-page]");
    const contextSheet = contextElement?.closest(ACTIVE_SHEET_SELECTOR);
    const pageId =
      contextPage?.dataset.appPage ||
      contextSheet?.dataset.sheetPage ||
      activePageId;
    const activePage =
      contextPage ||
      document.querySelector(`[data-app-page="${CSS.escape(pageId)}"]`);
    if (!activePage) return [];

    const activeSheets = getActivePageSheets(pageId);
    const sheetControls = activeSheets.flatMap((sheet) =>
      collectMatchingNodes(sheet, selector),
    );

    return Array.from(
      new Set([...activePage.querySelectorAll(selector), ...sheetControls]),
    );
  }

  function groupFormControls(controls) {
    const groups = new Map();
    if (!Array.isArray(controls)) return groups;

    for (const control of new Set(controls)) {
      const name = control?.dataset?.formName;
      if (!name || !control.isConnected) continue;

      let bucket = groups.get(name);
      if (!bucket) {
        bucket = [];
        groups.set(name, bucket);
      }
      bucket.push(control);
    }

    return groups;
  }

  function getSelectValue(select) {
    const selectedValues = [...select.selectedOptions]
      .filter((option) => !option.disabled)
      .map(readFormValue);

    if (select.multiple) return selectedValues;
    return selectedValues[0] ?? "";
  }

  function getCheckboxGroupValue(checkboxes) {
    if (checkboxes.length === 1) {
      return checkboxes[0].checked;
    }
    return checkboxes
      .filter((checkbox) => checkbox.checked)
      .map(readFormValue);
  }

  function getRadioGroupValue(connectedControls) {
    const selected = connectedControls.find(
      (control) => control instanceof HTMLInputElement && control.checked,
    );
    return selected ? readFormValue(selected) : "";
  }

  function getConnectedControls(controls) {
    return Array.isArray(controls)
      ? controls.filter((control) => Boolean(control?.isConnected))
      : [];
  }

  function getFormGroupValue(controls) {
    const connected = getConnectedControls(controls);
    const first = connected[0];
    if (!first) return undefined;

    if (first.dataset.filePicker !== undefined) {
      return normalizeFilePickerValue(first.dataset.filePickerValue || "[]");
    }

    if (first instanceof HTMLSelectElement) {
      return getSelectValue(first);
    }

    if (first instanceof HTMLInputElement && first.type === "radio") {
      return getRadioGroupValue(connected);
    }

    const allCheckboxes = connected.every(
      (control) =>
        control instanceof HTMLInputElement && control.type === "checkbox",
    );
    if (allCheckboxes) {
      return getCheckboxGroupValue(connected);
    }

    if (
      first instanceof HTMLInputElement ||
      first instanceof HTMLTextAreaElement
    ) {
      return first.value;
    }

    return undefined;
  }

  function setFormValue(values, name, value) {
    Object.defineProperty(values, name, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  function collectFormValues(elementContext) {
    const activeControls = getActivePageFormControls(
      ACTIVE_FORM_CONTROLS_SELECTOR,
      elementContext,
    );
    const groupedControls = groupFormControls(activeControls);
    const values = {};

    groupedControls.forEach((groupControls, fieldName) => {
      const value = getFormGroupValue(groupControls);
      if (value !== undefined) {
        setFormValue(values, fieldName, value);
      }
    });

    return values;
  }

  function validateRequiredFormFields(elementContext) {
    const controls = getActivePageFormControls(
      REQUIRED_FORM_CONTROLS_SELECTOR,
      elementContext,
    );
    const invalid = controls.find(
      (control) =>
        !control.closest("[hidden]") &&
        typeof control.checkValidity === "function" &&
        !control.checkValidity(),
    );

    if (!invalid) return true;
    if (typeof invalid.reportValidity === "function") {
      invalid.reportValidity();
    }
    return false;
  }

  function formatResolvedTokenString(value) {
    if (value && typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value ?? "");
  }

  async function resolveSelfOrElementToken(
    selfPath,
    elementContext,
  ) {
    const elementId = getRuntimeContextElementId(elementContext);
    if (!elementId) {
      throw new Error("The self token requires an element action context.");
    }
    if (selfPath.startsWith("extra.")) {
      return `${elementId}.${selfPath}`;
    }

    const [property, ...path] = selfPath.split(".");
    const propertyValue = getRuntimeElementPropertyValue(
      elementId,
      property,
      elementContext,
    );
    if (!path.length) return propertyValue;

    const nestedValue = readPath(propertyValue, path.join("."));
    if (nestedValue === undefined) {
      throw new Error(`Self element property path is unavailable: ${selfPath}`);
    }
    return nestedValue;
  }

  async function resolveExtraToken(
    elementId,
    key,
    formValues,
    elementContext,
    resolvingExtras,
    resolvingVariables,
  ) {
    const identity = `${elementId}.extra.${key}`;
    if (resolvingExtras.has(identity)) {
      throw new Error(`Circular extra data reference: ${identity}`);
    }
    const entry = ELEMENT_EXTRA_DATA[elementId]?.find(
      (item) => item.key === key,
    );
    if (!entry) {
      throw new Error(`Extra data value not found: ${identity}`);
    }

    const nextExtras = new Set(resolvingExtras);
    nextExtras.add(identity);
    const extraElementContext = getExtraDataContext(elementId, elementContext);
    return resolveActionValue(
      entry.value,
      formValues,
      extraElementContext,
      nextExtras,
      resolvingVariables,
    );
  }

  async function resolveCollectionItemToken(key, elementContext) {
    const row = elementContext?.closest(".content-collection-item");
    if (!row) {
      throw new Error(`Collection item data is unavailable: ${key}`);
    }

    let record;
    try {
      record = JSON.parse(row.dataset.collectionRecord || "null");
    } catch {
      throw new Error("Collection item data is invalid.");
    }

    const itemValue = readPath(record, key);
    if (itemValue === undefined) {
      throw new Error(`Collection item field not found: ${key}`);
    }
    return itemValue;
  }

  async function resolveTokenReference(
    token,
    formValues,
    elementContext,
    resolvingExtras,
    resolvingVariables,
  ) {
    let reference = token.trim();
    const selfMatch = reference.match(SELF_TOKEN_REGEX);
    if (selfMatch) {
      const resolvedSelf = await resolveSelfOrElementToken(
        selfMatch[1],
        elementContext,
      );
      if (!selfMatch[1].startsWith("extra.")) {
        return resolvedSelf;
      }
      reference = resolvedSelf;
    }

    const extraMatch = reference.match(EXTRA_TOKEN_REGEX);
    if (extraMatch) {
      return resolveExtraToken(
        extraMatch[1],
        extraMatch[2],
        formValues,
        elementContext,
        resolvingExtras,
        resolvingVariables,
      );
    }

    const separator = reference.indexOf(".");
    if (separator < 1) {
      throw new Error(`Invalid data token: ${reference}`);
    }

    const source = reference.slice(0, separator).toLowerCase();
    const key = reference.slice(separator + 1).trim();

    if (source === "api") return resolveApiValue(key);
    if (source === "twk") return getTwkValue(key);
    if (source === "var") {
      const [name, ...path] = key.split(".");
      const value = await resolveVariableValue(
        name,
        formValues,
        elementContext,
        resolvingVariables,
      );
      if (!path.length) return value;
      const nestedValue = readValuePath(value, path.join("."));
      if (nestedValue === undefined) {
        throw new Error(`Variable path is unavailable: ${name}.${path.join(".")}`);
      }
      return nestedValue;
    }
    if (source === "form") {
      if (!Object.hasOwn(formValues, key)) {
        throw new Error(`Form field not found: ${key}`);
      }
      return formValues[key];
    }
    if (source === "item") {
      return resolveCollectionItemToken(key, elementContext);
    }

    throw new Error(`Unsupported data token: ${reference}`);
  }

  async function resolveActionValue(
    value,
    formValues = {},
    elementContext = null,
    resolvingExtras = new Set(),
    resolvingVariables = new Set(),
  ) {
    if (Array.isArray(value)) {
      return Promise.all(
        value.map((item) =>
          resolveActionValue(
            item,
            formValues,
            elementContext,
            resolvingExtras,
            resolvingVariables,
          ),
        ),
      );
    }

    if (value && typeof value === "object") {
      const entries = await Promise.all(
        Object.entries(value).map(async ([key, item]) => [
          key,
          await resolveActionValue(
            item,
            formValues,
            elementContext,
            resolvingExtras,
            resolvingVariables,
          ),
        ]),
      );
      return Object.fromEntries(entries);
    }

    if (typeof value !== "string") return value;

    const exactMatch = value.match(SINGLE_TOKEN_REGEX);
    if (exactMatch) {
      return resolveTokenReference(
        exactMatch[1],
        formValues,
        elementContext,
        resolvingExtras,
        resolvingVariables,
      );
    }

    const matches = [...value.matchAll(TOKEN_PATTERN)];
    if (!matches.length) return value;

    const resolved = await Promise.all(
      matches.map((match) =>
        resolveTokenReference(
          match[1],
          formValues,
          elementContext,
          resolvingExtras,
          resolvingVariables,
        ),
      ),
    );

    let index = 0;
    return value.replace(TOKEN_PATTERN, () =>
      formatResolvedTokenString(resolved[index++]),
    );
  }

  async function resolveConfiguredActionValue(
    value,
    formValues,
    elementContext = null,
  ) {
    const source = String(value ?? "null").trim();
    if (SINGLE_TOKEN_REGEX.test(source)) {
      return resolveActionValue(source, formValues, elementContext);
    }

    try {
      return await resolveActionValue(
        JSON.parse(source),
        formValues,
        elementContext,
      );
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          "Enter a valid JSON value or a complete {{form.name}}, {{twk.field}}, {{var.name}}, or {{api.requestId.path}} token.",
        );
      }
      throw error;
    }
  }

  async function resolveRequestValue(
    value,
    formValues = {},
    elementContext = null,
  ) {
    return resolveActionValue(value, formValues, elementContext);
  }

  async function buildFetchRequestInit(request, formValues, elementContext) {
    const headers = await resolveRequestValue(
      JSON.parse(request.headers || "{}"),
      formValues,
      elementContext,
    );
    if (!headers || Array.isArray(headers) || typeof headers !== "object") {
      throw new Error("Request headers must be a JSON object.");
    }

    const normalizedHeaders = Object.fromEntries(
      Object.entries(headers).map(([key, headerValue]) => [
        key,
        String(headerValue),
      ]),
    );

    const options = {
      method: request.method,
      headers: normalizedHeaders,
    };

    if (request.body && request.method !== "GET") {
      options.body = JSON.stringify(
        await resolveRequestValue(
          JSON.parse(request.body),
          formValues,
          elementContext,
        ),
      );
      const hasContentType = Object.keys(normalizedHeaders).some(
        (key) => key.toLowerCase() === "content-type",
      );
      if (!hasContentType) {
        normalizedHeaders["Content-Type"] = "application/json";
      }
    }

    return options;
  }

  async function applyRequestResponseBindings(requestId, data, formValues) {
    API_RESPONSES[requestId] = data;
    await populateRequestLists(requestId, data);
    await updateExtraBindings(formValues);

    document.querySelectorAll("[data-bind-request]").forEach((element) => {
      if (element.dataset.bindRequest !== requestId) return;
      const boundValue = readPath(data, element.dataset.bindPath || "");
      if (boundValue === undefined) return;
      applyDataBoundValue(element, boundValue);
    });

    await updateVariableBindings(formValues);
    document.dispatchEvent(
      new CustomEvent("embedded-app:response", {
        detail: { requestId, data },
      }),
    );
    setStatus("");
  }

  async function runRequest(request, formValues = {}, elementContext = null) {
    showApiProgress();
    try {
      const resolvedUrl = await resolveString(
        request.url,
        true,
        formValues,
        elementContext,
      );
      const url = new URL(resolvedUrl);
      if (!ALLOWED_REQUEST_PROTOCOLS.has(url.protocol)) {
        throw new Error("Only HTTP and HTTPS request URLs are supported.");
      }

      const options = await buildFetchRequestInit(
        request,
        formValues,
        elementContext,
      );
      const response = await fetch(url, options);
      const text = await response.text();
      let data = text;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}${text ? `: ${text.slice(0, 240)}` : ""}`,
        );
      }

      await applyRequestResponseBindings(request.id, data, formValues);
      return data;
    } catch (error) {
      const message = `تعذر تنفيذ الطلب «${request.name}»: ${error.message}`;
      emitRuntimeError(message, { requestId: request.id });
      return undefined;
    } finally {
      hideApiProgress();
    }
  }

  async function loadTwkElementBindings(elements) {
    await Promise.all(
      elements.map(async (element) => {
        try {
          const value = await getTwkValue(element.dataset.bindTwk);
          applyDataBoundValue(element, value);
        } catch (error) {
          const message = `تعذر تحميل بيانات توكلنا: ${error.message}`;
          emitRuntimeError(message, { message: error.message });
        }
      }),
    );
  }

  async function loadTwkListBindings(lists) {
    await Promise.all(
      lists.map(async (select) => {
        const config = LIST_CONFIGS[select.dataset.listId] || {};
        try {
          const items = await getTwkValue(
            config.field || select.dataset.listField,
          );
          populateList(select, items, config);
        } catch (error) {
          const message = `تعذر تحميل خيارات قائمة توكلنا: ${error.message}`;
          emitRuntimeError(message, { elementId: select.dataset.listId });
        }
      }),
    );
  }

  async function loadTwkCollectionBindings(collections) {
    await Promise.all(
      collections.map(async (collection) => {
        const config =
          COLLECTION_CONFIGS[collection.dataset.collectionId] || {};
        try {
          const items = await getTwkValue(
            config.field || collection.dataset.collectionField,
          );
          await populateCollection(collection, items);
        } catch (error) {
          const message = `تعذر تحميل عناصر القائمة المرئية من توكلنا: ${error.message}`;
          emitRuntimeError(message, {
            elementId: collection.dataset.collectionId,
            message: error.message,
          });
        }
      }),
    );
  }

  async function loadTwkBindings() {
    const elements = [...document.querySelectorAll("[data-bind-twk]")];
    const lists = [...document.querySelectorAll("[data-list-source='twk']")];
    const collections = [
      ...document.querySelectorAll("[data-collection-source='twk']"),
    ];
    if (!elements.length && !lists.length && !collections.length) return;

    await loadTwkElementBindings(elements);
    await loadTwkListBindings(lists);
    await loadTwkCollectionBindings(collections);
    await updateExtraBindings(collectFormValues());
  }

  function isEmptyConditionValue(value) {
    if (value === undefined || value === null) return true;
    if (typeof value === "string" && value.trim() === "") return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (value && typeof value === "object" && Object.keys(value).length === 0) {
      return true;
    }
    return false;
  }

  function conditionValuesEqual(left, right) {
    return valuesAreEqual(left, right);
  }
  const NUMERIC_COMPARISON_OPERATORS = new Set(["greaterThan", "lessThan"]);
  const FORM_REQUIRED_ACTION_TYPES = new Set([
    "request",
    "openService",
    "setVariable",
    "changeProperty",
    "condition",
    "switch",
    "message",
    "function",
    "globalAction",
  ]);

  function dispatchActionEvent(detail) {
    document.dispatchEvent(
      new CustomEvent("embedded-app:action", { detail }),
    );
  }

  async function resolveApiRequestData(
    requestId,
    path,
    formValues,
    elementContext,
    missingRequestMessage,
    loadFailedMessage,
  ) {
    const request = API_REQUESTS.find((item) => item.id === requestId);
    if (!request) throw new Error(missingRequestMessage);

    if (!Object.hasOwn(API_RESPONSES, request.id)) {
      const response = await runRequest(request, formValues, elementContext);
      if (response === undefined) {
        throw new Error(loadFailedMessage);
      }
    }
    return readPath(API_RESPONSES[request.id], path || "");
  }

  function toFiniteConditionNumber(value) {
    if (
      typeof value !== "number" &&
      !(typeof value === "string" && value.trim() !== "")
    ) {
      return Number.NaN;
    }
    return Number(value);
  }

  function evaluateConditionOperator(operator, actual, expected) {
    if (operator === "empty") return isEmptyConditionValue(actual);
    if (operator === "notEmpty") return !isEmptyConditionValue(actual);
    if (operator === "equals") return conditionValuesEqual(actual, expected);
    if (operator === "notEquals") {
      return !conditionValuesEqual(actual, expected);
    }

    if (NUMERIC_COMPARISON_OPERATORS.has(operator)) {
      const leftNumber = toFiniteConditionNumber(actual);
      const rightNumber = toFiniteConditionNumber(expected);
      if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
        throw new Error("Greater/less comparisons require numeric values.");
      }
      return operator === "greaterThan"
        ? leftNumber > rightNumber
        : leftNumber < rightNumber;
    }

    if (operator === "contains") {
      if (Array.isArray(actual)) {
        return actual.some((item) => conditionValuesEqual(item, expected));
      }
      if (typeof actual === "string") {
        return actual.includes(String(expected ?? ""));
      }
      if (actual && typeof actual === "object") {
        return Object.hasOwn(actual, String(expected));
      }
      throw new Error(
        "Contains comparison requires a string, array, or object.",
      );
    }

    throw new Error(`Unsupported condition operator: ${operator}`);
  }

  async function resolveConditionActualValue(condition, formValues, elementContext) {
    switch (condition.source) {
      case "static":
        return resolveConfiguredActionValue(
          condition.sourceValue ?? "null",
          formValues,
          elementContext,
        );
      case "api":
      case "endpoint":
        return resolveApiRequestData(
          condition.requestId,
          condition.path,
          formValues,
          elementContext,
          "Select a valid API request for the condition.",
          "The API response required by the condition could not be loaded.",
        );
      case "variable":
        if (!condition.variableName) {
          throw new Error("Select a variable for the condition.");
        }
        return resolveVariableValue(
          condition.variableName,
          formValues,
          elementContext,
        );
      case "twk":
        return getTwkValue(condition.fieldKey || "user_id");
      case "form":
        if (!condition.fieldName) {
          throw new Error("Enter a form field name for the condition.");
        }
        if (!Object.hasOwn(formValues, condition.fieldName)) {
          throw new Error(`Form field not found: ${condition.fieldName}`);
        }
        return formValues[condition.fieldName];
      case "item":
        return resolveActionValue(
          `{{item.${condition.itemPath || ""}}}`,
          formValues,
          elementContext,
        );
      case "extra":
        return resolveActionValue(
          `{{${condition.extraPath || ""}}}`,
          formValues,
          elementContext,
        );
      case "element":
        return getRuntimeElementPropertyValue(
          condition.elementId,
          condition.property,
          elementContext,
        );
      default:
        throw new Error("Select a valid condition data source.");
    }
  }

  async function evaluateCondition(condition, formValues, elementContext = null) {
    const rawActual = await resolveConditionActualValue(
      condition,
      formValues,
      elementContext,
    );
    const actual = readValuePath(rawActual, condition.objectPath);
    const operator = condition.operator || "equals";

    if (operator === "empty" || operator === "notEmpty") {
      return evaluateConditionOperator(operator, actual, undefined);
    }

    const expected = await resolveConfiguredActionValue(
      condition.value ?? "null",
      formValues,
      elementContext,
    );
    return evaluateConditionOperator(operator, actual, expected);
  }

  async function evaluateSwitchSource(action, formValues, elementContext) {
    switch (action.switchSource) {
      case "element":
        if (!action.switchElementId) {
          throw new Error("Select an element for the Switch action.");
        }
        return getRuntimeElementPropertyValue(
          action.switchElementId,
          action.switchProperty || "value",
          elementContext,
        );
      case "variable": {
        const variable = VARIABLES.find(
          (item) => item.id === action.switchVariableId,
        );
        if (!variable) {
          throw new Error("Select a variable for the Switch action.");
        }
        return resolveVariableValue(
          variable.name,
          formValues,
          elementContext,
        );
      }
      case "form": {
        const fieldName = action.switchFormField;
        if (!fieldName || !Object.hasOwn(formValues, fieldName)) {
          throw new Error(
            "Select an available form field for the Switch action.",
          );
        }
        return formValues[fieldName];
      }
      case "api":
        return resolveApiRequestData(
          action.switchRequestId,
          action.switchPath,
          formValues,
          elementContext,
          "Select a valid API request for the Switch action.",
          "The API response required by the Switch action could not be loaded.",
        );
      case "static":
        return resolveConfiguredActionValue(
          action.switchStaticValue ?? "null",
          formValues,
          elementContext,
        );
      default:
        throw new Error("Select a valid Switch value source.");
    }
  }

  async function runSwitchEffect(
    action,
    formValues,
    elementContext,
    globalActionStack,
  ) {
    const actual = await evaluateSwitchSource(
      action,
      formValues,
      elementContext,
    );
    let selectedCase = null;

    for (const candidate of action.cases || []) {
      const expected = await resolveConfiguredActionValue(
        candidate.value ?? "null",
        formValues,
        elementContext,
      );
      if (conditionValuesEqual(actual, expected)) {
        selectedCase = candidate;
        break;
      }
    }

    const selectedActions = selectedCase
      ? selectedCase.actions || []
      : action.defaultEnabled
        ? action.defaultActions || []
        : [];

    const effects = [];
    for (const nestedAction of selectedActions) {
      effects.push(
        await runConditionalEffect(
          nestedAction,
          formValues,
          elementContext,
          globalActionStack,
        ),
      );
    }

    return {
      type: "switch",
      value: actual,
      matchedCaseId: selectedCase?.id || "",
      effects,
    };
  }

  function unwrapPermissionResponse(response) {
    let current = response;
    for (let depth = 0; depth < 3; depth += 1) {
      if (
        current &&
        typeof current === "object" &&
        !Array.isArray(current) &&
        Object.hasOwn(current, "result")
      ) {
        current = current.result;
        continue;
      }
      break;
    }
    return current;
  }

  async function runTwkSystemAction(action) {
    const helper = window.TWK && window.TWK[action.type];
    if (typeof helper !== "function") {
      throw new Error(`TWK.${action.type} is unavailable.`);
    }

    const response = await helper.call(window.TWK);
    if (response && typeof response === "object" && response.success === false) {
      const error =
        response.result?.error ||
        response.result?.message ||
        response.error ||
        response.message;
      throw new Error(
        `TWK.${action.type} failed${error ? `: ${String(error)}` : "."}`,
      );
    }

    if (action.type === "shareScreenShot") {
      const result =
        response &&
          typeof response === "object" &&
          response.success === true &&
          Object.hasOwn(response, "result")
          ? response.result
          : response;
      return { type: action.type, result };
    }

    const permissionResponse = unwrapPermissionResponse(response);
    if (typeof permissionResponse === "boolean") {
      return { granted: permissionResponse };
    }
    if (
      permissionResponse &&
      typeof permissionResponse === "object" &&
      typeof permissionResponse.granted === "boolean"
    ) {
      return { granted: permissionResponse.granted };
    }

    throw new Error(
      `TWK.${action.type} must return a boolean granted value.`,
    );
  }

  function getConditionActionLists(action = {}) {
    return {
      actions: Array.isArray(action.actions)
        ? action.actions
        : action.effect
          ? [action.effect]
          : [],
      elseActions: Array.isArray(action.elseActions) ? action.elseActions : [],
    };
  }

  async function runActionSequence(
    actions,
    formValues,
    elementContext,
    globalActionStack,
  ) {
    const effects = [];
    for (const action of actions) {
      effects.push(
        await runConditionalEffect(
          action,
          formValues,
          elementContext,
          globalActionStack,
        ),
      );
    }
    return effects;
  }

  async function applyStaticVariableOverride(
    variableId,
    rawValue,
    formValues,
    elementContext,
  ) {
    const resolvedId =
      variableId || VARIABLES.find((item) => item.source === "static")?.id || "";
    const variable = VARIABLES.find(
      (item) => item.id === resolvedId && item.source === "static",
    );
    if (!variable) {
      throw new Error("Select an existing static variable.");
    }

    const value = await resolveConfiguredActionValue(
      rawValue,
      formValues,
      elementContext,
    );
    VARIABLE_OVERRIDES[variable.id] = value;
    await updateVariableBindings(formValues);
    return { variableName: variable.name, value };
  }

  async function resolvePropertyChangeValue(
    property,
    rawValue,
    formValues,
    elementContext,
  ) {
    const resolvedValue = ["visibility", "disabled"].includes(property)
      ? rawValue
      : await resolveActionValue(rawValue ?? "", formValues, elementContext);
    return property.startsWith("plugin.")
      ? resolvedValue
      : displayValue(resolvedValue);
  }

  async function executeOpenServiceAction(
    serviceIdInput,
    rawValues,
    formValues,
    elementContext,
  ) {
    const helper = window.TWK && window.TWK.openService;
    if (typeof helper !== "function") {
      throw new Error("TWK.openService is unavailable.");
    }

    const serviceId = String(serviceIdInput || "").trim();
    if (!serviceId) {
      throw new Error("A Tawakkalna service ID is required.");
    }

    let template;
    try {
      template = JSON.parse(rawValues || "{}");
    } catch {
      throw new Error("Action values must be valid JSON.");
    }

    const values = await resolveActionValue(
      template,
      formValues,
      elementContext,
    );
    const result = await helper.call(window.TWK, serviceId, values);
    return { serviceId, values, result };
  }

  async function runConditionalEffect(
    effect,
    formValues,
    elementContext = null,
    globalActionStack = new Set(),
  ) {
    switch (effect.type) {
      case "switch":
        return runSwitchEffect(
          effect,
          formValues,
          elementContext,
          globalActionStack,
        );
      case "condition": {
        const matched = await evaluateCondition(
          effect.condition || {},
          formValues,
          elementContext,
        );
        const selectedActions = getConditionActionLists(effect)[
          matched ? "actions" : "elseActions"
        ];
        const effects = await runActionSequence(
          selectedActions,
          formValues,
          elementContext,
          globalActionStack,
        );
        return { type: effect.type, matched, effects };
      }
      case "globalAction": {
        const globalActionId =
          effect.globalActionId || GLOBAL_ACTIONS[0]?.id || "";
        const globalAction = GLOBAL_ACTIONS.find(
          (action) => action.id === globalActionId,
        );
        if (!globalAction) {
          throw new Error("Select an existing global action.");
        }
        if (globalActionStack.has(globalAction.id)) {
          throw new Error(`Recursive global action call: ${globalAction.name}`);
        }
        const nextStack = new Set(globalActionStack);
        nextStack.add(globalAction.id);
        const globalActionFormValues = {
          ...collectFormValues(elementContext),
          ...formValues,
        };
        const effects = await runActionSequence(
          globalAction.actions,
          globalActionFormValues,
          elementContext,
          nextStack,
        );
        return {
          type: effect.type,
          globalActionId: globalAction.id,
          name: globalAction.name,
          effects,
        };
      }
      case "showElement":
      case "hideElement":
        return setElementVisibility(
          effect.elementId,
          effect.type === "showElement",
          elementContext,
        );
      case "navigate":
        showPage(effect.pageId, true);
        return { type: effect.type, pageId: effect.pageId };
      case "back":
        return { type: effect.type, pageId: goBackPage() };
      case "showSheet":
        return showSheet(effect.sheetId, elementContext);
      case "hideSheet":
        return hideSheet(effect.sheetId, elementContext);
      case "showToast":
        return showToastElement(effect.toastId);
      case "request": {
        const request = API_REQUESTS.find(
          (item) => item.id === effect.requestId,
        );
        if (!request) {
          throw new Error("Select a valid API request.");
        }
        const data = await runRequest(request, formValues, elementContext);
        if (data === undefined) {
          throw new Error("The API request failed.");
        }
        return { type: effect.type, requestId: request.id, data };
      }
      case "function":
        return runFunctionAction(effect, formValues, elementContext);
      case "setVariable": {
        const { variableName, value } = await applyStaticVariableOverride(
          effect.variableId,
          effect.value,
          formValues,
          elementContext,
        );
        return { type: effect.type, variable: variableName, value };
      }
      case "changeProperty": {
        if (!effect.targetElementId) {
          throw new Error("Select an element to change.");
        }
        const value = await resolvePropertyChangeValue(
          effect.property,
          effect.value,
          formValues,
          elementContext,
        );
        changeElementProperty(
          effect.targetElementId,
          effect.property,
          value,
          elementContext,
        );
        return {
          type: effect.type,
          targetElementId: effect.targetElementId,
          property: effect.property,
          value,
        };
      }
      case "openService": {
        const { serviceId, values, result } = await executeOpenServiceAction(
          effect.serviceId,
          effect.values,
          formValues,
          elementContext,
        );
        return { type: effect.type, serviceId, values, result };
      }
      case "message": {
        const title = await resolveActionValue(
          effect.title || "رسالة",
          formValues,
          elementContext,
        );
        const message = await resolveActionValue(
          effect.message || "",
          formValues,
          elementContext,
        );
        const formattedTitle = displayValue(title);
        const formattedMessage = displayValue(message);
        showMessageDialog(formattedTitle, formattedMessage);
        return {
          type: effect.type,
          title: formattedTitle,
          message: formattedMessage,
        };
      }
      default: {
        if (TWK_SYSTEM_ACTION_TYPES.includes(effect.type)) {
          const result = await runTwkSystemAction(effect);
          if (TWK_PERMISSION_ACTION_TYPES.includes(effect.type)) {
            const selectedActions = getConditionActionLists(effect)[
              result.granted ? "actions" : "elseActions"
            ];
            await runActionSequence(
              selectedActions,
              formValues,
              elementContext,
              globalActionStack,
            );
          }
          return result;
        }
        throw new Error(`Unsupported conditional action: ${effect.type}`);
      }
    }
  }

  async function handleComponentEventForElement(event, elementNode) {
    const {
      elementId,
      appAction: action = "",
      appUrl: url = "",
    } = elementNode.dataset;
    const configured = ELEMENT_ACTIONS[elementId] || {};
    const primaryEventMatches = (configured.event || "click") === event.type;

    const additionalHandlers = Array.isArray(configured.handlers)
      ? configured.handlers.filter(
        (handler) =>
          handler &&
          typeof handler === "object" &&
          handler.event === event.type &&
          handler.type &&
          handler.type !== "none",
      )
      : [];

    const handlerRequestIds = new Set(
      additionalHandlers
        .filter((handler) => handler.type === "request")
        .map((handler) => handler.requestId),
    );

    const linkedRequests =
      primaryEventMatches && event.type === "click"
        ? API_REQUESTS.filter(
          (request) =>
            request.trigger === "button" &&
            request.buttonId === elementId &&
            !handlerRequestIds.has(request.id),
        )
        : [];

    const hasPrimaryAction =
      primaryEventMatches && configured.type && configured.type !== "none";

    if (!hasPrimaryAction && !linkedRequests.length && !additionalHandlers.length) {
      return;
    }

    let formValues = {};
    const needsFormCollection =
      FORM_REQUIRED_ACTION_TYPES.has(configured.type) ||
      TWK_PERMISSION_ACTION_TYPES.includes(configured.type) ||
      Boolean(linkedRequests.length) ||
      Boolean(additionalHandlers.length);

    if (needsFormCollection) {
      try {
        if (!validateRequiredFormFields(elementNode)) return;
        formValues = collectFormValues(elementNode);
      } catch (error) {
        emitRuntimeError(`تعذر جمع قيم النموذج: ${error.message}`, {
          elementId,
        });
        return;
      }
    }

    const runAdditionalHandlers = async () => {
      for (const handler of additionalHandlers) {
        const result = await runConditionalEffect(
          handler,
          formValues,
          elementNode,
        );
        dispatchActionEvent({
          action,
          elementId,
          handler,
          result,
        });
      }
    };

    if (!hasPrimaryAction) {
      await runAdditionalHandlers();
      return;
    }

    if (configured.type === "request") {
      const actionRequest = API_REQUESTS.find(
        (request) => request.id === configured.requestId,
      );
      if (!actionRequest) {
        await Promise.all(
          linkedRequests.map((request) =>
            runRequest(request, formValues, elementNode),
          ),
        );
        emitRuntimeError("اختر طلب API صالحاً لهذا العنصر.", {
          elementId,
          message: "No API request is configured for this component.",
        });
        return;
      }

      const requests = [
        ...new Map(
          [...linkedRequests, actionRequest].map((request) => [
            request.id,
            request,
          ]),
        ).values(),
      ];
      const results = await Promise.all(
        requests.map((request) => runRequest(request, formValues, elementNode)),
      );
      if (results.some((result) => result === undefined)) return;

      const data =
        results[requests.findIndex((request) => request.id === actionRequest.id)];
      dispatchActionEvent({
        action,
        elementId,
        requestId: configured.requestId,
        data,
      });
      await runAdditionalHandlers();
      return;
    }

    if (linkedRequests.length) {
      const results = await Promise.all(
        linkedRequests.map((request) =>
          runRequest(request, formValues, elementNode),
        ),
      );
      if (results.some((result) => result === undefined)) return;
    }

    switch (configured.type) {
      case "function":
      case "globalAction": {
        const result = await runConditionalEffect(
          configured,
          formValues,
          elementNode,
        );
        dispatchActionEvent({ action, elementId, ...result });
        await runAdditionalHandlers();
        return;
      }
      case "condition": {
        const matched = await evaluateCondition(
          configured.condition || {},
          formValues,
          elementNode,
        );
        const selectedActions = getConditionActionLists(configured)[
          matched ? "actions" : "elseActions"
        ];
        const effects = await runActionSequence(
          selectedActions,
          formValues,
          elementNode,
        );
        dispatchActionEvent({
          action,
          elementId,
          matched,
          effects,
          effect: effects[effects.length - 1],
        });
        await runAdditionalHandlers();
        return;
      }
      case "switch": {
        const result = await runSwitchEffect(
          configured,
          formValues,
          elementNode,
          new Set(),
        );
        dispatchActionEvent({ action, elementId, ...result });
        await runAdditionalHandlers();
        return;
      }
      case "message": {
        const title = await resolveActionValue(
          configured.title || "رسالة",
          formValues,
          elementNode,
        );
        const message = await resolveActionValue(
          configured.message || "",
          formValues,
          elementNode,
        );
        const formattedTitle = displayValue(title);
        const formattedMessage = displayValue(message);
        showMessageDialog(formattedTitle, formattedMessage);
        dispatchActionEvent({
          action,
          elementId,
          title: formattedTitle,
          message: formattedMessage,
        });
        await runAdditionalHandlers();
        return;
      }
      case "showSheet": {
        const result = showSheet(configured.sheetId, elementNode);
        dispatchActionEvent({
          action,
          elementId,
          sheetId: configured.sheetId,
          result,
        });
        await runAdditionalHandlers();
        return;
      }
      case "hideSheet": {
        const result = hideSheet(configured.sheetId, elementNode);
        dispatchActionEvent({
          action,
          elementId,
          sheetId: configured.sheetId,
          result,
        });
        await runAdditionalHandlers();
        return;
      }
      case "showToast": {
        const result = showToastElement(configured.toastId);
        updateElementPropertyBindings();
        dispatchActionEvent({
          action,
          elementId,
          toastId: configured.toastId,
          result,
        });
        await runAdditionalHandlers();
        return;
      }
      case "setVariable": {
        try {
          const { variableName, value } = await applyStaticVariableOverride(
            configured.variableId,
            configured.value,
            formValues,
            elementNode,
          );
          dispatchActionEvent({
            action,
            elementId,
            variable: variableName,
            value,
          });
        } catch (error) {
          emitRuntimeError(`تعذر تعيين المتغير: ${error.message}`, {
            elementId,
            variableId: configured.variableId,
          });
        }
        await runAdditionalHandlers();
        return;
      }
      case "changeProperty": {
        try {
          const targetElementId = configured.targetElementId;
          const property = configured.property;
          const value = await resolvePropertyChangeValue(
            property,
            configured.value,
            formValues,
            elementNode,
          );
          changeElementProperty(
            targetElementId,
            property,
            value,
            elementNode,
          );
          updateElementPropertyBindings();
          dispatchActionEvent({
            action,
            elementId,
            targetElementId,
            property,
            value,
          });
        } catch (error) {
          emitRuntimeError(`تعذر تغيير خاصية العنصر: ${error.message}`, {
            elementId,
            targetElementId: configured.targetElementId,
          });
        }
        await runAdditionalHandlers();
        return;
      }
      case "navigate": {
        try {
          showPage(configured.pageId, true);
        } catch (error) {
          emitRuntimeError(`تعذر الانتقال إلى الصفحة: ${error.message}`, {
            elementId,
            pageId: configured.pageId,
            message: error.message,
          });
        }
        await runAdditionalHandlers();
        return;
      }
      case "back": {
        const pageId = goBackPage();
        dispatchActionEvent({ action, elementId, pageId });
        await runAdditionalHandlers();
        return;
      }
      case "openService": {
        try {
          const { serviceId, values, result } = await executeOpenServiceAction(
            configured.serviceId,
            configured.values,
            formValues,
            elementNode,
          );
          setStatus("");
          dispatchActionEvent({
            action,
            url,
            elementId,
            serviceId,
            values,
            result,
          });
        } catch (error) {
          emitRuntimeError(`تعذر فتح خدمة توكلنا: ${error.message}`, {
            elementId,
            serviceId: configured.serviceId || "",
          });
        }
        await runAdditionalHandlers();
        return;
      }
      default: {
        if (TWK_SYSTEM_ACTION_TYPES.includes(configured.type)) {
          const result = await runConditionalEffect(
            configured,
            formValues,
            elementNode,
          );
          dispatchActionEvent({ action, elementId, result });
        } else {
          dispatchActionEvent({ action, url, elementId });
        }
        await runAdditionalHandlers();
      }
    }
  }

  const ELEMENT_NODE_SELECTOR = "[data-element-id]";
  const WORKFLOW_EVENT_NAMES = new Set([
    "click",
    "change",
    "input",
    "onFilesSelected",
    ...Object.values(PLUGIN_DEFINITIONS).flatMap(
      (plugin) => plugin.events || [],
    ),
  ]);

  async function handleComponentEvent(event) {
    const elementNodes = event
      .composedPath()
      .filter(
        (node) => node instanceof Element && node.matches(ELEMENT_NODE_SELECTOR),
      );

    for (const elementNode of elementNodes) {
      await handleComponentEventForElement(event, elementNode);
    }
  }

  WORKFLOW_EVENT_NAMES.forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      handleComponentEvent(event).catch((error) => {
        emitRuntimeError(`تعذر تنفيذ إجراء العنصر: ${error.message}`, {
          type: eventName,
        });
      });
    });
  });

  const twkBindingsReady = loadTwkBindings();

  async function runInitialRequests() {
    try {
      const loadRequests = API_REQUESTS.filter(
        (item) => item.trigger === "load" && item.url.trim(),
      );
      for (const request of loadRequests) {
        await runRequest(request, collectFormValues());
      }
    } catch (error) {
      emitRuntimeError(error.message);
    }
  }

  async function runAppLoadHandlers() {
    const formValues = collectFormValues();
    for (const handler of APP_LOAD_HANDLERS) {
      if (!handler.type || handler.type === "none") continue;
      try {
        const result = await runConditionalEffect(handler, formValues);
        dispatchActionEvent({
          event: "load",
          handler,
          result,
        });
      } catch (error) {
        emitRuntimeError(`Unable to run app load action: ${error.message}`, {
          event: "load",
          handler,
        });
        return;
      }
    }
  }

  window.embedly = Object.freeze({
    showMessage: showMessageDialog,
    navigateToPage(pageId) {
      showPage(pageId, true);
      return activePageId;
    },
    goBack: goBackPage,
    showSheet: (sheetId) => showSheet(sheetId),
    hideSheet: (sheetId) => hideSheet(sheetId),
    showToast: showToastElement,
    enableElement: (elementId) => setElementEnabled(elementId, true),
    disableElement: (elementId) => setElementEnabled(elementId, false),
    showElement: (elementId) => setElementVisibility(elementId, true),
    hideElement: (elementId) => setElementVisibility(elementId, false),
  });

  initializeApp();

}
