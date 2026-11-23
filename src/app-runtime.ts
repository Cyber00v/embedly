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
  let appLanguage = INITIAL_APP_LANGUAGE;
  let appAppearance = "1";
  const ACTIVE_COLLECTION_ROWS = new Map();
  const FUNCTION_SCRIPT_PROMISES = new Map();
  let startupSplashPending = Boolean(INITIAL_SPLASH_PAGE_ID);
  let activeApiRequestCount = 0;
  attachRippleEffectListener(document);

  async function initializeApp() {
    if (document.readyState === "loading") {
      await new Promise((resolve) =>
        document.addEventListener("DOMContentLoaded", resolve, { once: true }),
      );
    }
    try {
      const langFromTwk = await getTwkValue("app_language");
      appLanguage = langFromTwk ?? INITIAL_APP_LANGUAGE;
    } catch (error) {
      appLanguage = INITIAL_APP_LANGUAGE;
      console.warn("Unable to read TWK app language; using the configured language.", error);
    }

    applyAppLanguage();
    mountPluginElements(document, PLUGIN_DEFINITIONS);
    try {
      const appearanceFromTwk = await getTwkValue("appearance");
      appAppearance = String(appearanceFromTwk ?? "1");
    } catch (error) {
      appAppearance = "1";
      console.warn(
        "Unable to read TWK app appearance; using light mode.",
        error,
      );
    }
    applyAppAppearance();
    await runInitialRequests();
    await Promise.all([twkBindingsReady, staticCollectionsReady]);
    startupSplashPending = false;
    if (
      activePageId === INITIAL_SPLASH_PAGE_ID &&
      !runtimeErrorShown
    )
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

  function applyAppLanguage() {
    const language = appLanguage === "en" ? "en" : "ar";
    const direction = language === "ar" ? "rtl" : "ltr";
    const resolveAppSetting = (localizations, fallback) => {
      const localized = localizations?.[language];
      if (typeof localized === "string") return localized;
      return (
        Object.values(localizations || {}).find(
          (value) => typeof value === "string",
        ) ?? fallback
      );
    };
    const appTitle = resolveAppSetting(
      APP_TITLE_LOCALIZATIONS,
      APP_TITLE,
    );
    const appOrganization = resolveAppSetting(
      APP_ORGANIZATION_LOCALIZATIONS,
      APP_ORGANIZATION,
    );
    document.title = appTitle;
    const headerTitle = document.querySelector(".app-header strong");
    if (headerTitle) headerTitle.textContent = appTitle;
    const headerOrganization = document.querySelector(".app-header small");
    if (headerOrganization)
      headerOrganization.textContent = appOrganization;
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
    document.querySelectorAll(".embedded-app").forEach((app) => {
      app.lang = language;
      app.dir = direction;
    });
    document.querySelectorAll(".app-sheet-portal, .content-sheet").forEach(
      (sheet) => {
        sheet.dir = direction;
      },
    );
    applyElementLocalizations();

    const closeButton = document.querySelector("#app-message-close");
    if (closeButton) closeButton.textContent = language === "ar" ? "إغلاق" : "Close";
    if (requestStatus)
      requestStatus.textContent = localizeAppMessage(currentStatusMessage);
    const apiProgressLabel = document.querySelector(".app-api-progress-label");
    if (apiProgressLabel) {
      apiProgressLabel.hidden = API_PROGRESS_LABEL_ENABLED === false;
      apiProgressLabel.textContent =
        language === "ar" ? "جارٍ تحميل البيانات" : "Loading data";
    }
    const splashIndicator = document.querySelector(".app-splash-indicator");
    if (splashIndicator)
      splashIndicator.textContent =
        language === "ar" ? "جارٍ بدء التطبيق..." : "Starting app...";
    const errorMessage = document.querySelector("#runtime-error-message");
    if (errorMessage && runtimeErrorSource)
      errorMessage.textContent = localizeAppMessage(runtimeErrorSource);
  }

  function applyElementLocalizations(root = document) {
    const elements = [
      ...(root.matches?.("[data-element-id]") ? [root] : []),
      ...root.querySelectorAll("[data-element-id]"),
    ];
    elements.forEach((element) => {
      const localizations =
        ELEMENT_LOCALIZATIONS[element.dataset.elementId] || {};
      const content =
        localizations[appLanguage === "en" ? "en" : "ar"] ??
        Object.values(localizations).find((value) => typeof value === "string");
      if (typeof content !== "string") return;
      const type = ELEMENT_TYPES[element.dataset.elementId];
      if (type === "input") {
        element.placeholder = content;
        element.setAttribute("aria-label", content);
      } else if (type === "image") {
        element.alt = content;
      } else if (type === "icon" || type === "radio") {
        element.setAttribute("aria-label", content);
      } else if (type === "list") {
        const select = element.querySelector("select");
        if (!select) return;
        select.setAttribute("aria-label", content);
        const placeholder = select.querySelector("option[disabled]");
        if (placeholder) placeholder.textContent = content;
      } else if (type === "tabs") {
        element.setAttribute("aria-label", content);
        element
          .querySelector('[role="tablist"]')
          ?.setAttribute("aria-label", content);
      } else {
        const target = element.querySelector("[data-localize-content]");
        if (target) target.textContent = content;
        if (type === "loading") element.setAttribute("aria-label", content);
        if (type === "progress")
          element
            .querySelector("[role='progressbar']")
            ?.setAttribute("aria-label", content);
        if (type === "fab") element.setAttribute("aria-label", content);
        if (type === "breadcrumbs")
          element.setAttribute(
            "aria-label",
            appLanguage === "ar" ? "مسار التنقل" : "Breadcrumb",
          );
        if (["layout", "absoluteLayout", "grid", "scrollView"].includes(type))
          element.setAttribute("aria-label", content);
      }
    });
    root.querySelectorAll("[data-tab-target]").forEach((button) => {
      const localizations =
        ELEMENT_LOCALIZATIONS[button.dataset.tabTarget] || {};
      const content =
        localizations[appLanguage === "en" ? "en" : "ar"] ??
        Object.values(localizations).find((value) => typeof value === "string");
      const target = button.querySelector("[data-localize-content]");
      if (typeof content === "string" && target) target.textContent = content;
    });
    document.querySelectorAll("[data-toast-close]").forEach((button) => {
      button.setAttribute(
        "aria-label",
        appLanguage === "ar" ? "إغلاق الإشعار" : "Dismiss notification",
      );
    });
  }

  function localizeAppMessage(message) {
    if (appLanguage !== "en") return message;
    const translations = {
      "جارٍ إرسال الطلب...": "Sending request...",
      "لم يتم إرسال الطلب.": "The request has not been sent.",
      "تم إرسال الطلب بنجاح.": "Request completed successfully.",
      "تعذر تنفيذ الإجراء.": "The action could not be completed.",
      "رسالة": "Message",
      "تعذر تحميل بيانات توكلنا.": "Unable to load Tawakkalna data.",
      "تعذر تحميل خيارات قائمة توكلنا: ": "Unable to load Tawakkalna list options: ",
      "تعذر جمع قيم النموذج: ": "Unable to collect form values: ",
      "تعذر تنفيذ إجراء العنصر: ": "Unable to run the element action: ",
      "تعذر تغيير خاصية العنصر: ": "Unable to change the element property: ",
      "تعذر الانتقال إلى الصفحة: ": "Unable to navigate to the page: ",
      "تعذر فتح خدمة توكلنا: ": "Unable to open the Tawakkalna service: ",
      "تعذر تعيين المتغير: ": "Unable to set the variable: ",
      "حدث خطأ غير متوقع أثناء تشغيل الخدمة.": "An unexpected error occurred while running the service.",
      "اختر طلب API صالحاً لهذا العنصر.": "Choose a valid API request for this element.",
      "يتطلب الوصول إلى معرض الصور إذن Gallery. أضف إذن Gallery من فئة Device Information في بوابة توكلنا عند إنشاء الخدمة المضمنة.":
        "Gallery access requires the Gallery permission. Add Gallery under Device Information in the Tawakkalna portal when creating the embedded service.",
      "تجاوز حجم الملف الحد الأقصى المسموح به وهو 10 MB.":
        "The file exceeds the maximum allowed size of 10 MB.",
      "جارٍ تنفيذ الطلب...": "Sending request...",
    };
    if (translations[message]) return translations[message];
    const prefixes = [
      ["تعذر تحميل خيارات قائمة توكلنا: ", "Unable to load Tawakkalna list options: "],
      ["تعذر جمع قيم النموذج: ", "Unable to collect form values: "],
      ["تعذر تنفيذ إجراء العنصر: ", "Unable to run the element action: "],
      ["تعذر تغيير خاصية العنصر: ", "Unable to change the element property: "],
      ["تعذر الانتقال إلى الصفحة: ", "Unable to navigate to the page: "],
      ["تعذر فتح خدمة توكلنا: ", "Unable to open the Tawakkalna service: "],
      ["تعذر تعيين المتغير: ", "Unable to set the variable: "],
    ];
    const prefix = prefixes.find(([arabic]) => message.startsWith(arabic));
    return prefix ? prefix[1] + message.slice(prefix[0].length) : message;
  }
  const requestStatus = document.querySelector("#request-status");
  const API_RESPONSES = Object.create(null);
  const VARIABLE_OVERRIDES = Object.create(null);
  let activePageId = INITIAL_SPLASH_PAGE_ID || INITIAL_PAGE_ID;
  const pageHistory = [];
  let runtimeErrorShown = false;
  let collectionInstanceId = 0;
  let currentStatusMessage = "";
  let activeToastTimer = null;
  let runtimeErrorSource = "تعذر تنفيذ الإجراء.";

  function setStatus(message) {
    currentStatusMessage = message;
    if (requestStatus)
      requestStatus.textContent = localizeAppMessage(currentStatusMessage);
  }

  function showPage(pageId, recordHistory = false) {
    if (!PAGES[pageId]) throw new Error("Configured page is unavailable: " + pageId);
    const previousPageId = activePageId;
    if (recordHistory && previousPageId !== pageId)
      pageHistory.push(previousPageId);
    activePageId = pageId;
    runtimeErrorShown = PAGES[pageId].kind === "error";
    updateApiProgressIndicator();
    document.querySelectorAll("[data-app-page]").forEach((page) => {
      page.hidden = page.dataset.appPage !== pageId;
      page.classList.remove("is-entering");
      if (previousPageId !== pageId && page.dataset.appPage === pageId) {
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
    if (!previousPageId) return activePageId;
    showPage(previousPageId);
    return activePageId;
  }

  const TRANSITION_DURATION = 300;

  function closeSheet() {
    document.querySelectorAll("[data-sheet-id]").forEach((sheet) => {
      sheet.classList.remove("is-active");
    });
    const backdrop = document.querySelector("[data-sheet-backdrop]");
    if (backdrop) {
      backdrop.classList.remove("is-active");
    }

    setTimeout(() => {
      document.querySelectorAll("[data-sheet-id]").forEach((sheet) => {
        if (!sheet.classList.contains("is-active")) {
          sheet.hidden = true;
        }
      });
      if (backdrop && !backdrop.classList.contains("is-active")) {
        backdrop.hidden = true;
      }
      updateElementPropertyBindings();
    }, TRANSITION_DURATION);
  }

  function findSheetTarget(sheetId, elementContext = null) {
    const selector = '[data-sheet-id="' + CSS.escape(sheetId) + '"]';
    const row = elementContext?.closest(".content-collection-item");
    return (
      [...(row?.querySelectorAll(selector) || [])][0] ||
      document.querySelector(selector)
    );
  }

  function showSheet(sheetId, elementContext = null) {
    if (!sheetId) throw new Error("Select a sheet to show.");
    const target = findSheetTarget(sheetId, elementContext);
    const backdrop = document.querySelector("[data-sheet-backdrop]");
    if (!target || !backdrop) throw new Error("The selected sheet is unavailable.");

    const page = target.closest("[data-app-page]");
    if (page && page.hidden) showPage(page.dataset.appPage);

    document.querySelectorAll("[data-sheet-id]").forEach((sheet) => {
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
    const target = findSheetTarget(sheetId, elementContext);
    if (!target) throw new Error("The selected sheet is unavailable.");

    const backdrop = document.querySelector("[data-sheet-backdrop]");
    const otherActiveSheets = [...document.querySelectorAll("[data-sheet-id]")]
      .some((sheet) => sheet !== target && sheet.classList.contains("is-active"));
    target.classList.remove("is-active");
    if (!otherActiveSheets) backdrop?.classList.remove("is-active");

    setTimeout(() => {
      if (!target.classList.contains("is-active")) target.hidden = true;
      const hasActiveSheet = [...document.querySelectorAll("[data-sheet-id]")]
        .some((sheet) => sheet.classList.contains("is-active"));
      if (backdrop && !hasActiveSheet) backdrop.hidden = true;
      updateElementPropertyBindings();
    }, TRANSITION_DURATION);

    return { type: "hideSheet", sheetId };
  }

  function showToastElement(toastId) {
    if (!toastId || ELEMENT_TYPES[toastId] !== "toast")
      throw new Error("Select an existing toast element.");
    const targets = [
      ...document.querySelectorAll(
        '[data-element-id="' + CSS.escape(toastId) + '"]',
      ),
    ].filter((target) => target.classList.contains("content-toast"));
    if (!targets.length) throw new Error("The selected toast is unavailable.");

    const page = targets[0].closest("[data-app-page]");
    if (page && page.hidden) showPage(page.dataset.appPage);
    document.querySelectorAll(".content-toast").forEach((target) => {
      target.hidden = true;
    });
    targets.forEach((target) => {
      target.hidden = false;
    });
    clearTimeout(activeToastTimer);
    activeToastTimer = setTimeout(() => {
      targets.forEach((target) => {
        target.hidden = true;
      });
      activeToastTimer = null;
    }, 4000);
    return { type: "showToast", toastId };
  }

  function normalizeGalleryResponse(response, mode) {
    let result = response;
    for (let depth = 0; depth < 4; depth += 1) {
      if (typeof result === "string") {
        try {
          result = JSON.parse(result);
        } catch {
          throw new Error("The Tawakkalna gallery returned invalid JSON.");
        }
      }
      if (!result || typeof result !== "object" || Array.isArray(result)) break;
      const errorPayloads = [
        result,
        result.result,
        result.error,
        result.result?.error,
      ].filter((payload) => payload && typeof payload === "object");
      const errorCode = errorPayloads
        .map((payload) => Number(payload.code))
        .find((code) => Number.isInteger(code));
      const status = errorPayloads
        .map((payload) => String(payload.status ?? ""))
        .find(Boolean);
      if (errorCode === 1000006 || status === "401") {
        throw new Error(
          "يتطلب الوصول إلى معرض الصور إذن Gallery. أضف إذن Gallery من فئة Device Information في بوابة توكلنا عند إنشاء الخدمة المضمنة.",
        );
      }
      if (errorCode === 1000007 || status === "400") {
        throw new Error(
          "تجاوز حجم الملف الحد الأقصى المسموح به وهو 10 MB.",
        );
      }
      if (result.success === false) {
        const error =
          result.result?.error || result.error || result.result?.message;
        if (
          ["cancelled", "canceled", "user_cancelled", "user_canceled"].includes(
            String(error || "").toLowerCase(),
          )
        )
          return null;
        throw new Error(
          "Tawakkalna gallery selection failed" +
          (error ? ": " + String(error) : "."),
        );
      }
      if (Object.prototype.hasOwnProperty.call(result, "result")) {
        result = result.result;
        continue;
      }
      break;
    }
    if (result == null) return null;
    if (!Array.isArray(result))
      throw new Error(
        "The Tawakkalna gallery response must be an array of image records.",
      );
    const selected = result;
    const files = selected.map((file) => {
      if (
        !file ||
        typeof file !== "object" ||
        file.type !== "image" ||
        typeof file.mime_type !== "string" ||
        !file.mime_type.trim() ||
        typeof file.data !== "string" ||
        !file.data.trim()
      )
        throw new Error(
          "Each Tawakkalna gallery image must include type \\\"image\\\", a MIME type, and base64 data.",
        );
      return {
        type: "image",
        mime_type: file.mime_type.trim(),
        data: file.data,
      };
    });
    return mode === "multiple" ? files : files.slice(0, 1);
  }

  async function openFilePicker(picker) {
    const mode =
      picker.dataset.filePickerMode === "multiple" ? "multiple" : "single";
    const method = mode === "multiple" ? "getGalleryMulti" : "getGallerySingle";
    const helper = window.TWK && window.TWK[method];
    if (typeof helper !== "function")
      throw new Error("TWK." + method + " is unavailable.");
    const result = normalizeGalleryResponse(await helper.call(window.TWK), mode);
    if (!result?.length) return;
    picker.dataset.filePickerValue = JSON.stringify(result);
    picker.dispatchEvent(new Event("input", { bubbles: true }));
    picker.dispatchEvent(
      new CustomEvent("onFilesSelected", {
        bubbles: true,
        detail: { files: result },
      }),
    );
  }

  document.addEventListener("click", (event) => {
    const picker = event.target.closest("[data-file-picker]");
    if (!picker || picker.disabled) return;
    openFilePicker(picker).catch((error) => {
      const message = "Unable to choose files: " + error.message;
      showErrorPage(message);
      document.dispatchEvent(
        new CustomEvent("embedded-app:error", { detail: { message } }),
      );
    });
  });

  document.addEventListener("dragover", (event) => {
    if (!event.target.closest("[data-file-picker-appearance='dropzone']")) return;
    event.preventDefault();
  });

  document.addEventListener("drop", (event) => {
    const picker = event.target.closest(
      "[data-file-picker-appearance='dropzone']",
    );
    if (!picker || picker.disabled) return;
    event.preventDefault();
    openFilePicker(picker).catch((error) => {
      const message = "Unable to choose files: " + error.message;
      showErrorPage(message);
      document.dispatchEvent(
        new CustomEvent("embedded-app:error", { detail: { message } }),
      );
    });
  });

  document.addEventListener("click", (event) => {
    const collectionRow = event.target.closest(".content-collection-item");
    const collectionId = getCollectionIdFromContext(collectionRow);
    if (collectionId) {
      ACTIVE_COLLECTION_ROWS.set(collectionId, collectionRow);
      updateExtraBindings(collectFormValues()).catch((error) => {
        const message = "Unable to update extra data bindings: " + error.message;
        showErrorPage(message);
        document.dispatchEvent(
          new CustomEvent("embedded-app:error", { detail: { message } }),
        );
      });
    }
    if (
      event.target.closest("[data-sheet-backdrop]") ||
      event.target.closest("[data-sheet-close]")
    )
      closeSheet();
    const tabButton = event.target.closest("[data-tab-target]");
    if (tabButton) {
      const tabs = tabButton.closest(".content-tabs");
      const panelId = tabButton.dataset.tabTarget;
      if (!tabs || !panelId)
        throw new Error("The selected tab is unavailable.");
      tabs.querySelectorAll("[data-tab-target]").forEach((button) => {
        const selected = button === tabButton;
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
      tabs.querySelectorAll("[data-tab-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.tabPanel !== panelId;
      });
      return;
    }
    const accordionToggle = event.target.closest("[data-accordion-toggle]");
    if (accordionToggle) {
      const accordion = accordionToggle.closest(".content-accordion");
      const panel = accordion?.querySelector(".content-accordion-panel");
      if (!accordion || !panel)
        throw new Error("The selected accordion is unavailable.");
      const isOpen = accordion.dataset.accordionOpen !== "true";
      accordion.dataset.accordionOpen = String(isOpen);
      accordionToggle.setAttribute("aria-expanded", String(isOpen));
      panel.hidden = !isOpen;
      updateElementPropertyBindings();
      return;
    }
    const chip = event.target.closest("[data-chip-toggle]");
    if (chip) {
      const selected = chip.getAttribute("aria-pressed") !== "true";
      chip.setAttribute("aria-pressed", String(selected));
      chip.classList.toggle("is-selected", selected);
      updateElementPropertyBindings();
    }
    const toastClose = event.target.closest("[data-toast-close]");
    if (toastClose) {
      const toast = toastClose.closest(".content-toast");
      if (!toast) throw new Error("The toast notification is unavailable.");
      toast.hidden = true;
      clearTimeout(activeToastTimer);
      activeToastTimer = null;
      updateElementPropertyBindings();
    }
  });

  document.addEventListener("change", () => updateElementPropertyBindings());
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const messageDialog = document.querySelector("#app-message-dialog");
    if (messageDialog && !messageDialog.hidden) {
      closeMessageDialog();
      return;
    }
    if (!document.querySelector("[data-sheet-backdrop]")?.hidden) closeSheet();
  });

  function changeElementProperty(
    targetId,
    property,
    value,
    elementContext = null,
  ) {
    const type = ELEMENT_TYPES[targetId];
    if (!type) throw new Error("Select an existing target element.");
    const targets = getRuntimeElementTargets(targetId, elementContext);
    if (!targets.length) throw new Error("The target element is unavailable.");
    if (typeof property === "string" && property.startsWith("plugin.")) {
      if (type !== "custom")
        throw new Error("Plugin properties are only available for plugin elements.");
      const propertyKey = property.slice("plugin.".length);
      const pluginId = PLUGIN_ELEMENT_IDS[targetId];
      const plugin = PLUGIN_DEFINITIONS[pluginId];
      const pluginProperty = plugin?.properties.find(
        (item) => item.key === propertyKey,
      );
      if (!plugin || !pluginProperty)
        throw new Error("The selected plugin property is unavailable.");
      let normalizedValue = value;
      if (pluginProperty.type === "boolean") {
        if (value === true || value === "true") normalizedValue = true;
        else if (value === false || value === "false") normalizedValue = false;
        else throw new Error("Plugin boolean properties require true or false.");
      } else if (pluginProperty.type === "number") {
        normalizedValue =
          typeof value === "number"
            ? value
            : typeof value === "string" && value.trim()
              ? Number(value)
              : Number.NaN;
        if (!Number.isFinite(normalizedValue))
          throw new Error("Plugin number properties require a finite number.");
      } else {
        normalizedValue = String(value ?? "");
        if (pluginProperty.type === "select" &&
          !pluginProperty.options?.includes(normalizedValue))
          throw new Error("Choose an available option for this plugin property.");
        if (pluginProperty.type === "color" &&
          !/^#[\da-f]{6}$/i.test(normalizedValue))
          throw new Error("Plugin color properties require a six-digit hex color.");
        if (pluginProperty.type === "text")
          normalizedValue = normalizedValue.slice(0, 1000);
      }
      targets.forEach((target) => {
        let values = {};
        if (target.dataset.pluginProperties) {
          try {
            values = JSON.parse(target.dataset.pluginProperties);
          } catch {
            throw new Error("The target plugin properties are invalid.");
          }
        }
        if (!values || typeof values !== "object" || Array.isArray(values))
          throw new Error("The target plugin properties must be an object.");
        if (Object.is(values[propertyKey], normalizedValue)) return;
        target.dataset.pluginProperties = JSON.stringify({
          ...values,
          [propertyKey]: normalizedValue,
        });
        mountPluginElements(target, PLUGIN_DEFINITIONS);
      });
      return;
    }
    if (property === "visibility") {
      if (!["show", "hide"].includes(value))
        throw new Error("Choose whether to show or hide the target element.");
      targets.forEach((target) => {
        target.hidden = value === "hide";
        if (type === "tab") {
          const trigger = target
            .closest(".content-tabs")
            ?.querySelector(
              '[data-tab-target="' + CSS.escape(target.dataset.tabPanel || "") + '"]',
            );
          if (trigger) trigger.hidden = value === "hide";
        }
      });
      if (type === "tab" && value === "hide") {
        const tabs = targets[0]?.closest(".content-tabs");
        const nextTab = tabs?.querySelector(
          '[data-tab-target]:not([hidden])',
        );
        if (
          nextTab &&
          !tabs.querySelector('[data-tab-target][aria-selected="true"]:not([hidden])')
        )
          nextTab.click();
      }
      return;
    }
    if (property === "disabled") {
      if (
        ![
          "button",
          "input",
          "list",
          "checkbox",
          "radio",
          "chip",
          "fab",
          "switch",
          "toast",
          "filePicker",
        ].includes(type) &&
        !(type === "custom" && PLUGIN_ELEMENT_IDS[targetId])
      )
        throw new Error("Disabling is not supported for this element type.");
      const disabled = value === true || value === "true";
      if (!(disabled || value === false || value === "false"))
        throw new Error("Choose whether the target element is disabled.");
      targets.forEach((target) => {
        target.setAttribute("aria-disabled", String(disabled));
        if (type === "custom" && PLUGIN_ELEMENT_IDS[targetId]) {
          target.inert = disabled;
          return;
        }
        const controls = target.matches("button, input, select")
          ? [target]
          : [...target.querySelectorAll("button, input, select")];
        if (!controls.length)
          throw new Error("The target element has no disableable control.");
        controls.forEach((control) => {
          control.disabled = disabled;
        });
      });
      return;
    }
    if (property === "min" || (property === "max" && type === "input")) {
      if (type !== "input")
        throw new Error("Minimum and maximum are only supported for inputs.");
      targets.forEach((target) => {
        if (value === "") target.removeAttribute(property);
        else target.setAttribute(property, String(value));
      });
      return;
    }
    if (property === "checked") {
      if (type !== "switch")
        throw new Error("The checked property is only supported for switches.");
      const checked = value === true || value === "true";
      if (!(checked || value === false || value === "false"))
        throw new Error("Choose whether the switch is checked.");
      targets.forEach((target) => {
        const control = target.querySelector('input[type="checkbox"]');
        if (!control) throw new Error("The target switch is unavailable.");
        control.checked = checked;
      });
      return;
    }
    if (type === "progress" && (property === "value" || property === "max")) {
      const number = Number(value);
      if (!Number.isFinite(number) || (property === "max" ? number <= 0 : number < 0))
        throw new Error(
          property === "max"
            ? "Progress maximum must be greater than zero."
            : "Progress value must be zero or greater.",
        );
      targets.forEach((target) => {
        const progress = target.querySelector("[role='progressbar']");
        if (!progress) throw new Error("The target progress bar is unavailable.");
        const max =
          property === "max"
            ? number
            : Number(progress.getAttribute("aria-valuemax")) || 100;
        const previousValue = Number(progress.getAttribute("aria-valuenow")) || 0;
        progress.setAttribute("aria-valuemax", String(max));
        const fill = progress.querySelector(".content-progress-fill");
        if (!fill) throw new Error("The target progress fill is unavailable.");
        if (property === "value" || progress.hasAttribute("aria-valuenow")) {
          const nextValue =
            property === "value"
              ? Math.min(number, max)
              : Math.min(previousValue, max);
          progress.dataset.indeterminate = "false";
          progress.setAttribute("aria-valuenow", String(nextValue));
          fill.style.width = `${Math.max(0, Math.min(100, (nextValue / max) * 100))}%`;
        }
      });
      return;
    }
    if (property === "variant") {
      const variants = ELEMENT_VARIANTS[type];
      if (!Array.isArray(variants) || !variants.includes(value))
        throw new Error("Choose a supported variant for the target element.");
      targets.forEach((target) => {
        [...target.classList]
          .filter((className) => className.startsWith("variant-"))
          .forEach((className) => target.classList.remove(className));
        target.classList.add("variant-" + value);
        if (type === "button" || type === "fab") {
          const colors = {
            primary: ["var(--theme-primary)", "var(--primary-foreground)"],
            secondary: ["var(--theme-secondary)", "var(--secondary-foreground)"],
            destructive: ["var(--destructive)", "var(--primary-foreground)"],
            ghost: ["transparent", "var(--theme-primary)"],
            outline: ["transparent", "var(--theme-primary)"],
            custom: [
              target.dataset.variantBackground || "var(--theme-primary)",
              target.dataset.variantColor || "var(--primary-foreground)",
            ],
          };
          const [background, color] = colors[value];
          target.style.backgroundColor = background;
          target.style.color = color;
          if (value === "outline") {
            target.style.borderWidth ||= "1px";
            target.style.borderColor = "var(--theme-primary)";
          }
        }
      });
      return;
    }
    if (property === "iconClass") {
      if (type !== "icon")
        throw new Error("The icon class property is only supported for icons.");
      if (!/^fa-[a-z0-9-]+$/.test(String(value)))
        throw new Error("Enter a valid Font Awesome icon class, such as fa-star.");
      targets.forEach((target) => {
        const icon = target.querySelector(":scope > i.fa-solid");
        if (!icon) throw new Error("The target icon is unavailable.");
        [...icon.classList]
          .filter(
            (className) =>
              className.startsWith("fa-") && className !== "fa-solid",
          )
          .forEach((className) => icon.classList.remove(className));
        icon.classList.add(value);
      });
      return;
    }
    if (property === "src" || property === "assetId") {
      if (type !== "image")
        throw new Error("Image sources are only supported for Image elements.");
      const assetId = String(value);
      const source =
        property === "assetId"
          ? Object.prototype.hasOwnProperty.call(IMAGE_ASSET_URLS, assetId)
            ? IMAGE_ASSET_URLS[assetId]
            : ""
          : String(value || "").trim();
      if (property === "assetId" && !source)
        throw new Error("Choose an existing image asset.");
      if (source && safeImageUrl(source) !== source)
        throw new Error("Enter a valid image URL.");
      targets.forEach((target) => {
        if (!(target instanceof HTMLImageElement))
          throw new Error("The target Image element is unavailable.");
        if (source) target.setAttribute("src", source);
        else target.removeAttribute("src");
        target.classList.toggle("preview-image-empty", !source);
      });
      return;
    }
    if (property !== "content")
      throw new Error("Unsupported target property: " + property);

    targets.forEach((target) => {
      if (type === "input") {
        target.placeholder = value;
      } else if (type === "list") {
        const select = target.querySelector("select");
        if (!select) throw new Error("The target list is unavailable.");
        select.setAttribute("aria-label", value);
        const placeholder = select.querySelector("option[disabled]");
        if (placeholder) placeholder.textContent = value;
      } else if (type === "checkbox" || type === "switch") {
        const label = target.querySelector(".control-label span");
        if (!label) throw new Error("The target control label is unavailable.");
        label.textContent = value;
      } else if (type === "radio") {
        target.setAttribute("aria-label", value);
      } else if (type === "card") {
        const content = target.querySelector(".card-text");
        if (!content) throw new Error("The target card content is unavailable.");
        content.textContent = value;
      } else if (type === "image") {
        target.setAttribute("alt", value);
      } else if (type === "icon") {
        target.setAttribute("aria-label", value);
      } else if (
        type === "layout" ||
        type === "absoluteLayout" ||
        type === "grid" ||
        type === "scrollView"
      ) {
        let title = target.querySelector(":scope > .layout-title");
        if (!title) {
          title = document.createElement("strong");
          title.className = "layout-title";
          target.insertBefore(title, target.querySelector(".content-layout-children"));
        }
        title.textContent = value;
        target.setAttribute("aria-label", value);
      } else if (type === "collection") {
        target.setAttribute("aria-label", value);
      } else if (type === "accordion") {
        const toggle = target.querySelector(
          "[data-accordion-toggle] [data-localize-content]",
        );
        if (!toggle) throw new Error("The target accordion is unavailable.");
        toggle.textContent = value;
      } else if (type === "tab") {
        const content = target.querySelector("[data-localize-content]");
        if (!content) throw new Error("The target tab is unavailable.");
        content.textContent = value;
        const tabButton = target
          .closest(".content-tabs")
          ?.querySelector('[data-tab-target="' + CSS.escape(target.dataset.tabPanel || "") + '"]');
        const buttonContent = tabButton?.querySelector("[data-localize-content]");
        if (buttonContent) buttonContent.textContent = value;
      } else if (type === "tabs") {
        target.setAttribute("aria-label", value);
        target
          .querySelector('[role="tablist"]')
          ?.setAttribute("aria-label", value);
      } else if (
        [
          "text",
          "heading",
          "button",
          "chip",
          "breadcrumbs",
          "badge",
          "fab",
          "toast",
          "loading",
          "progress",
        ].includes(type)
      ) {
        const content = target.querySelector("[data-localize-content]") || target;
        content.textContent = value;
        if (type === "fab") target.setAttribute("aria-label", value);
        if (type === "loading") target.setAttribute("aria-label", value);
        if (type === "progress")
          target.querySelector("progress")?.setAttribute("aria-label", value);
      } else {
        throw new Error("Changing content is not supported for this element type.");
      }
    });
  }

  function getRuntimeElementTargets(targetId, elementContext = null) {
    const selector = '[data-element-id="' + CSS.escape(targetId) + '"]';
    const collectionId = ELEMENT_COLLECTION_IDS[targetId];
    const contextRow =
      collectionId &&
        getCollectionIdFromContext(elementContext) === collectionId
        ? elementContext.closest(".content-collection-item")
        : null;
    if (contextRow) {
      const target = contextRow.querySelector(selector);
      return target ? [target] : [];
    }
    return [...document.querySelectorAll(selector)];
  }

  function setElementVisibility(elementId, visible, elementContext = null) {
    if (!elementId) throw new Error("Select an element to show or hide.");
    const targets = getRuntimeElementTargets(elementId, elementContext);
    if (!targets.length) throw new Error("Target element is unavailable.");
    targets.forEach((target) => {
      target.hidden = !visible;
    });
    return { type: visible ? "showElement" : "hideElement", elementId };
  }

  function showMessageDialog(title, message) {
    const dialog = document.querySelector("#app-message-dialog");
    const heading = document.querySelector("#app-message-title");
    const content = document.querySelector("#app-message-content");
    if (!dialog || !heading || !content)
      throw new Error("Message dialog is unavailable.");
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
    message = localizeAppMessage(runtimeErrorSource);
    setStatus("");
    const errorPageId = Object.keys(PAGES).find((id) => PAGES[id].kind === "error");
    if (errorPageId) {
      const errorMessage = document.querySelector("#runtime-error-message");
      if (errorMessage) errorMessage.textContent = message;
      showPage(errorPageId);
    }
    runtimeErrorShown = true;
  }

  window.addEventListener("error", (event) => {
    const message = event.message || "حدث خطأ غير متوقع أثناء تشغيل الخدمة.";
    showErrorPage(message);
    document.dispatchEvent(new CustomEvent("embedded-app:error", {
      detail: {
        message,
        source: event.filename || "",
        line: event.lineno || 0,
        column: event.colno || 0,
      },
    }));
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    showErrorPage(message || "حدث خطأ غير متوقع أثناء تشغيل الخدمة.");
    document.dispatchEvent(new CustomEvent("embedded-app:error", {
      detail: { message, type: "unhandledrejection" },
    }));
  });

  function parseHelperValue(value, responseKey) {
    let data = value;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch { return data; }
    }
    if (data && typeof data === "object" && Object.hasOwn(data, responseKey))
      return data[responseKey];
    const originalData = data;
    const result = data.result;
    while (result && typeof result === "object") {
      if (Object.hasOwn(result, responseKey)) return result[responseKey];
      const nested = data.results ?? data.data;
      if (nested === undefined || nested === data) break;
      data = nested;
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { return originalData; }
      }
    }
    return originalData;
  }

  async function getTwkValue(key) {
    const fieldKey = String(key).toLowerCase();
    const field = TWK_FIELDS[fieldKey];
    if (!field)
      throw new Error("TWK field is not configured: " + fieldKey);
    const method = window.TWK && window.TWK[field.method];
    if (typeof method !== "function")
      throw new Error(
        "TWK." + field.method + " is unavailable for field " + fieldKey + ".",
      );
    return parseHelperValue(await method.call(window.TWK), field.responseKey);
  }

  async function resolveVariableValue(
    name,
    formValues = {},
    elementContext = null,
    visited = new Set(),
  ) {
    const variable = VARIABLES.find((item) => item.name === name);
    if (!variable) throw new Error("Unknown variable: " + name);
    if (Object.hasOwn(VARIABLE_OVERRIDES, variable.id))
      return readValuePath(
        VARIABLE_OVERRIDES[variable.id],
        variable.propertyPath,
      );
    if (visited.has(variable.id))
      throw new Error("Circular variable reference: " + name);
    const nextVisited = new Set(visited);
    nextVisited.add(variable.id);
    let value;
    if (variable.source === "static") value = variable.value;
    else if (variable.source === "twk") value = await getTwkValue(variable.fieldKey);
    else if (variable.source === "form") {
      if (!Object.hasOwn(formValues, variable.fieldName))
        throw new Error("Form field not found: " + variable.fieldName);
      value = formValues[variable.fieldName];
    }
    else if (variable.source === "variable") {
      const source = VARIABLES.find((item) => item.id === variable.path);
      if (!source) throw new Error("Variable source is unavailable: " + name);
      value = await resolveVariableValue(
        source.name,
        formValues,
        elementContext,
        nextVisited,
      );
    }
    else if (variable.source === "item")
      value = await resolveActionValue(
        "{{item." + variable.path + "}}",
        formValues,
        elementContext,
        new Set(),
        nextVisited,
      );
    else if (variable.source === "extra")
      value = await resolveActionValue(
        "{{" + variable.path + "}}",
        formValues,
        elementContext,
        new Set(),
        nextVisited,
      );
    else if (variable.source === "element")
      value = getRuntimeElementPropertyValue(
        variable.elementId,
        variable.property,
        elementContext,
      );
    else {
      if (!Object.hasOwn(API_RESPONSES, variable.requestId))
        throw new Error("API response is not available for variable: " + name);
      value = readPath(
        API_RESPONSES[variable.requestId],
        variable.path || "",
      );
      if (value === undefined)
        throw new Error("API response path is unavailable for variable: " + name);
    }
    return readValuePath(value, variable.propertyPath);
  }

  async function resolveApiValue(key) {
    const separator = key.indexOf(".");
    if (separator < 1) throw new Error("API value tokens require a request ID and response path.");
    const requestId = key.slice(0, separator).trim();
    const path = key.slice(separator + 1).trim();
    if (!Object.hasOwn(API_RESPONSES, requestId))
      throw new Error("API response is not available for request: " + requestId);
    const value = readPath(API_RESPONSES[requestId], path);
    if (value === undefined)
      throw new Error("API response path is unavailable: " + path);
    return value;
  }

  async function resolveString(
    value,
    encodeTokens,
    formValues = {},
    elementContext = null,
  ) {
    const text = String(value ?? "");
    const tokenPattern = /\{\{\s*([^{}]+?)\s*\}\}/g;
    const matches = [...text.matchAll(tokenPattern)];
    if (!matches.length) return text;
    const isCompleteToken = /^\{\{\s*[^{}]+?\s*\}\}$/.test(text);
    const replacements = await Promise.all(
      matches.map(async (match) => {
        const result = await resolveActionValue(
          match[0],
          formValues,
          elementContext,
        );
        const tokenValue =
          result && typeof result === "object"
            ? JSON.stringify(result)
            : String(result ?? "");
        return encodeTokens && !isCompleteToken
          ? encodeURIComponent(tokenValue)
          : tokenValue;
      }),
    );
    let index = 0;
    return text.replace(tokenPattern, () => replacements[index++]);
  }

  function readPath(value, path) {
    return path.split(".").filter(Boolean).reduce((current, key) => {
      if (["__proto__", "prototype", "constructor"].includes(key)) return undefined;
      if (Array.isArray(current) && /^\d+$/.test(key)) return current[Number(key)];
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
      } catch (error) {
        if (valuePath) return undefined;
      }
    }
    return valuePath ? readPath(source, valuePath) : source;
  }

  function populateList(select, data, config) {
    if (!Array.isArray(data)) throw new Error("List data source must resolve to an array.");
    const selectedValues = new Set([...select.selectedOptions].map((option) => option.dataset.formValue));
    const placeholderText = select.getAttribute("aria-label") || "اختر عنصراً";
    select.replaceChildren();
    if (!select.multiple) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.disabled = true;
      placeholder.selected = true;
      placeholder.textContent = placeholderText;
      select.append(placeholder);
    }
    data.forEach((item, index) => {
      const itemValue = config.valuePath ? readPath(item, config.valuePath) : item;
      const itemLabel = config.labelPath ? readPath(item, config.labelPath) : item;
      const value = itemValue === undefined ? item : itemValue;
      const label = itemLabel === undefined || itemLabel === null ? displayValue(item) : displayValue(itemLabel);
      const option = document.createElement("option");
      option.value = String(index);
      option.dataset.formValue = JSON.stringify(value);
      option.textContent = label;
      option.selected = selectedValues.has(option.dataset.formValue);
      select.append(option);
    });
    if (!select.multiple && ![...select.options].some((option) => option.selected && !option.disabled)) {
      select.selectedIndex = 0;
    }
  }

  async function populateRequestLists(requestId, data) {
    document.querySelectorAll("[data-list-source='endpoint']").forEach((select) => {
      if (select.dataset.listRequest !== requestId) return;
      const config = LIST_CONFIGS[select.dataset.listId] || {};
      const items = readPath(data, select.dataset.listPath || "");
      populateList(select, items, config);
    });
    const collections = [...document.querySelectorAll("[data-collection-source='endpoint']")];
    for (const collection of collections) {
      if (collection.dataset.collectionRequest !== requestId) continue;
      const items = readPath(data, collection.dataset.collectionPath || "");
      await populateCollection(collection, items);
    }
  }

  async function populateCollection(collection, items) {
    if (!Array.isArray(items)) throw new Error("Custom list data source must resolve to an array.");
    const template = document.querySelector(
      "[data-collection-template='" + CSS.escape(collection.dataset.collectionId) + "']",
    );
    const target = collection.querySelector(".content-collection-items");
    if (!template || !target) throw new Error("Custom list template is unavailable.");
    ACTIVE_COLLECTION_ROWS.delete(collection.dataset.collectionId);
    unmountPluginElements(target);
    while (target.firstChild) target.removeChild(target.firstChild);
    for (const record of items) {
      const item = document.createElement("div");
      item.className = "content-collection-item";
      item.dataset.collectionRecord = JSON.stringify(record);
      const content = document.createElement("div");
      content.innerHTML = template.textContent;
      applyElementLocalizations(content);
      content.querySelectorAll("[data-element-id]").forEach((element) => {
        collectionInstanceId += 1;
        element.id = element.dataset.elementId + "--instance-" + collectionInstanceId;
      });
      content
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
            const labelNode = element.querySelector(
              ".control-label span:last-child",
            );
            if (labelNode) labelNode.textContent = displayValue(label);
          }
          if (value !== undefined) {
            const controls = element.querySelectorAll(
              'input[type="checkbox"], input[type="radio"]',
            );
            controls.forEach((control) => {
              control.dataset.formValue = JSON.stringify(value);
            });
          }
        });
      while (content.firstChild) item.appendChild(content.firstChild);
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
  }

  async function runCollectionItemActions(item, eventName) {
    const lifecycleEvent = new Event(eventName);
    const nodes = [...item.querySelectorAll("[data-element-id]")].filter(
      (element) => element.closest(".content-collection-item") === item,
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
        const message =
          "Unable to run Collection item lifecycle action: " + error.message;
        showErrorPage(message);
        document.dispatchEvent(
          new CustomEvent("embedded-app:error", {
            detail: {
              elementId: element.dataset.elementId,
              event: eventName,
              message,
            },
          }),
        );
      }
    }
  }

  async function initializeStaticCollections() {
    const collections = [...document.querySelectorAll("[data-collection-source='static']")];
    for (const collection of collections) {
      const config = COLLECTION_CONFIGS[collection.dataset.collectionId] || {};
      await populateCollection(collection, config.items || []);
    }
    updateElementPropertyBindings();
  }

  const staticCollectionsReady = initializeStaticCollections().catch((error) => {
    const message = "Unable to initialize collection items: " + error.message;
    showErrorPage(message);
    document.dispatchEvent(new CustomEvent("embedded-app:error", { detail: { message } }));
  });

  function displayValue(value) {
    if (value === undefined || value === null) return "";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  }

  function loadFunctionScript(assetId) {
    const path = FUNCTION_SCRIPT_PATHS[assetId];
    if (!path) throw new Error("The selected JavaScript asset is unavailable.");
    if (FUNCTION_SCRIPT_PROMISES.has(assetId))
      return FUNCTION_SCRIPT_PROMISES.get(assetId);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL(path, document.baseURI).href;
      script.async = true;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener(
        "error",
        () => reject(new Error("Unable to load JavaScript asset: " + path)),
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
          !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part) ||
          ["__proto__", "prototype", "constructor"].includes(part),
      )
    )
      throw new Error("Enter a valid global function name.");
    let value = globalThis;
    for (const part of parts) value = value?.[part];
    if (typeof value !== "function")
      throw new Error("Global function is unavailable: " + name);
    return value;
  }

  async function runFunctionAction(action, formValues, elementContext) {
    let functionValue;
    let functionThis = globalThis;
    if (action.functionSource === "asset") {
      await loadFunctionScript(action.scriptAssetId);
      functionValue = getNamedGlobalFunction(action.functionName);
    } else if (action.functionSource === "plugin") {
      if (!action.pluginElementId)
        throw new Error("Select a plugin element with an exported function.");
      const pluginHost = getRuntimeElementTargets(
        action.pluginElementId,
        elementContext,
      ).find((target) => target.matches("[data-plugin-id]"));
      if (!pluginHost)
        throw new Error("The selected plugin element is unavailable.");
      const pluginFunctions = pluginHost.__embedlyPluginFunctions;
      functionValue = pluginFunctions?.get(action.functionName);
      if (typeof functionValue !== "function")
        throw new Error(
          "The selected plugin does not export function: " +
          action.functionName,
        );
      functionThis = pluginHost;
    } else if (action.functionSource === "global") {
      functionValue = getNamedGlobalFunction(action.functionName);
    } else {
      throw new Error("Select a valid JavaScript function source.");
    }
    let parameters;
    try {
      parameters = JSON.parse(action.parameters || "[]");
    } catch {
      throw new Error("Function parameters must be a valid JSON array.");
    }
    if (!Array.isArray(parameters))
      throw new Error("Function parameters must be a JSON array.");
    const resolvedParameters = await resolveActionValue(
      parameters,
      formValues,
      elementContext,
    );
    if (!Array.isArray(resolvedParameters))
      throw new Error("Resolved function parameters must be a JSON array.");
    const result = await functionValue.apply(functionThis, resolvedParameters);
    const resultVariable = VARIABLES.find(
      (variable) =>
        variable.id === action.resultVariableId &&
        variable.source === "static",
    );
    if (action.resultVariableId && !resultVariable)
      throw new Error("Select an existing static variable for the function result.");
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

  function normalizeFilePickerValue(value) {
    let files = value;
    if (typeof files === "string") {
      try {
        files = JSON.parse(files);
      } catch (error) {
        throw new Error("File picker value must be a JSON array.");
      }
    }
    if (files == null) return [];
    if (!Array.isArray(files))
      throw new Error("File picker value must be a JSON array.");
    return files.map((file) => {
      if (
        !file ||
        typeof file !== "object" ||
        typeof file.mime_type !== "string" ||
        typeof file.data !== "string"
      )
        throw new Error("Each file must include a MIME type and base64 data.");
      return { type: "image", mime_type: file.mime_type, data: file.data };
    });
  }

  function applyBoundValue(element, value) {
    const sameValue = (left, right) =>
      Object.is(left, right) ||
      (left &&
        right &&
        typeof left === "object" &&
        typeof right === "object" &&
        JSON.stringify(left) === JSON.stringify(right));
    const kind = element.dataset.bindKind;
    if (kind === "checkbox") {
      const control = element.matches('input[type="checkbox"]')
        ? element
        : element.querySelector('input[type="checkbox"]');
      if (!control) return;
      let fieldValue = true;
      try {
        fieldValue = JSON.parse(control.dataset.formValue || "true");
      } catch (error) {
        throw new Error("Invalid checkbox binding value.");
      }
      control.checked =
        typeof value === "boolean" ? value : sameValue(value, fieldValue);
      return;
    }
    if (kind === "radio") {
      const controls = element.matches('input[type="radio"]')
        ? [element]
        : [...element.querySelectorAll('input[type="radio"]')];
      controls.forEach((control) => {
        let optionValue;
        try {
          optionValue = JSON.parse(control.dataset.formValue || "null");
        } catch (error) {
          throw new Error("Invalid radio option value.");
        }
        control.checked = sameValue(value, optionValue);
      });
      return;
    }
    if (ELEMENT_TYPES[element.dataset.elementId] === "filePicker") {
      const files = normalizeFilePickerValue(value);
      element.dataset.filePickerValue = JSON.stringify(files);
      return;
    }
    const content = element.querySelector("[data-localize-content]");
    if (content) {
      const text = displayValue(value);
      content.textContent = text;
      if (element.classList.contains("content-loading"))
        element.setAttribute("aria-label", text);
      if (element.classList.contains("content-progress"))
        element
          .querySelector("[role='progressbar']")
          ?.setAttribute("aria-label", text);
      if (element.classList.contains("content-fab"))
        element.setAttribute("aria-label", text);
      return;
    }
    if (element instanceof HTMLInputElement) {
      if (element.hidden || element.type === "range")
        element.value = displayValue(value);
      else element.placeholder = displayValue(value);
    } else element.textContent = displayValue(value);
  }

  function applyDataBoundValue(element, value) {
    applyBoundValue(
      element,
      readValuePath(value, element.dataset.bindObjectPath),
    );
  }

  function getRuntimeElementPropertyValue(elementId, property, elementContext) {
    const collectionId = ELEMENT_COLLECTION_IDS[elementId];
    const contextRow =
      collectionId &&
        getCollectionIdFromContext(elementContext) === collectionId
        ? elementContext.closest(".content-collection-item")
        : null;
    const targets = getRuntimeElementTargets(elementId, elementContext);
    const target =
      targets[0] ||
      (!contextRow && collectionId
        ? ACTIVE_COLLECTION_ROWS.get(collectionId)
          ?.querySelector(
            '[data-element-id="' + CSS.escape(elementId) + '"]',
          )
        : null);
    if (!target)
      throw new Error("Element property source is unavailable: " + elementId);
    const control = target.matches("input, select, textarea, [role='progressbar']")
      ? target
      : target.querySelector("input, select, textarea, [role='progressbar']");
    const elementType = ELEMENT_TYPES[elementId];
    const registeredProperties =
      COMPONENT_RUNTIME_PROPERTY_REGISTRY[elementType] || [];
    if (
      typeof property === "string" &&
      (property === "plugin" || property.startsWith("plugin."))
    ) {
      const pluginId = PLUGIN_ELEMENT_IDS[elementId];
      const plugin = PLUGIN_DEFINITIONS[pluginId];
      if (elementType !== "custom" || !plugin)
        throw new Error("Plugin properties are unavailable for this element.");
      let values = {};
      if (target.dataset.pluginProperties) {
        try {
          values = JSON.parse(target.dataset.pluginProperties);
        } catch {
          throw new Error("Plugin property data is invalid.");
        }
      }
      if (!values || typeof values !== "object" || Array.isArray(values))
        throw new Error("Plugin property data must be an object.");
      if (property === "plugin") return values;
      const key = property.slice("plugin.".length);
      if (!plugin.properties.some((item) => item.key === key))
        throw new Error("Plugin property is unavailable: " + key);
      return values[key];
    }
    switch (property) {
      case "id":
        return target.dataset.elementId || elementId;
      case "src":
        if (!(target instanceof HTMLImageElement))
          throw new Error("Image URL is only available for image elements.");
        return target.getAttribute("src") || "";
      case "checked":
        if (!(control instanceof HTMLInputElement))
          throw new Error("Checked state is unavailable for this element.");
        return control.checked;
      case "value":
        if (
          elementType === "filePicker" ||
          target.hasAttribute("data-file-picker")
        )
          throw new Error(
            "File Picker selected images are available through the files property.",
          );
        if (elementType === "radio") {
          const selected = target.querySelector('input[type="radio"]:checked');
          return selected ? readFormValue(selected) : "";
        }
        if (
          (elementType === "checkbox" || elementType === "switch") &&
          control instanceof HTMLInputElement
        )
          return readFormValue(control);
        if (control instanceof HTMLInputElement ||
          control instanceof HTMLTextAreaElement) return control.value;
        if (control instanceof HTMLSelectElement) {
          const values = [...control.selectedOptions]
            .filter((option) => !option.disabled)
            .map(readFormValue);
          return control.multiple ? values : values[0] ?? "";
        }
        if (elementType === "progress")
          return Number(control.getAttribute("aria-valuenow")) || 0;
        throw new Error("Value is unavailable for this element.");
      case "files":
        if (
          !registeredProperties.includes("files") &&
          !target.hasAttribute("data-file-picker")
        )
          throw new Error("Selected files are only available for file pickers.");
        try {
          return normalizeFilePickerValue(target.dataset.filePickerValue || "[]");
        } catch (error) {
          throw new Error("File picker value is invalid: " + error.message);
        }
      case "mode":
        if (
          !registeredProperties.includes("mode") &&
          !target.hasAttribute("data-file-picker")
        )
          throw new Error("File picker mode is only available for file pickers.");
        return target.dataset.filePickerMode || "single";
      case "min":
        if (!registeredProperties.includes("min"))
          throw new Error("Minimum is unavailable for this element.");
        if (control instanceof HTMLInputElement) return control.min;
        if (elementType === "progress") return 0;
        throw new Error("Minimum is unavailable for this element.");
      case "max":
        if (!registeredProperties.includes("max"))
          throw new Error("Maximum is unavailable for this element.");
        if (elementType === "progress")
          return Number(control.getAttribute("aria-valuemax")) || 100;
        if (control instanceof HTMLInputElement) return control.max;
        throw new Error("Maximum is unavailable for this element.");
      case "isValid":
        if (
          !registeredProperties.includes("isValid") &&
          !(control instanceof HTMLTextAreaElement)
        )
          throw new Error("Validity is unavailable for this element.");
        if (
          control instanceof HTMLInputElement ||
          control instanceof HTMLSelectElement ||
          control instanceof HTMLTextAreaElement
        )
          return control.checkValidity();
        throw new Error("Validity is unavailable for this element.");
      case "characterCount":
        if (
          !registeredProperties.includes("characterCount") &&
          !(control instanceof HTMLTextAreaElement)
        )
          throw new Error("Character count is unavailable for this element.");
        if (
          control instanceof HTMLInputElement ||
          control instanceof HTMLTextAreaElement
        )
          return control.value.length;
        throw new Error("Character count is unavailable for this element.");
      case "selectedLabel":
        if (!registeredProperties.includes("selectedLabel"))
          throw new Error("Selected label is unavailable for this element.");
        if (control instanceof HTMLSelectElement) {
          const labels = [...control.selectedOptions]
            .filter((option) => !option.disabled)
            .map((option) => option.textContent || "");
          return control.multiple ? labels : labels[0] ?? "";
        }
        if (elementType === "radio") {
          const selected = target.querySelector('input[type="radio"]:checked');
          return selected
            ? selected.closest("label")?.querySelector("span")?.textContent ||
            selected.closest("label")?.textContent.trim() ||
            ""
            : "";
        }
        throw new Error("Selected label is unavailable for this element.");
      case "options":
        if (!registeredProperties.includes("options"))
          throw new Error("Options are unavailable for this element.");
        if (control instanceof HTMLSelectElement)
          return [...control.options].map((option) => ({
            label: option.textContent || "",
            value: readFormValue(option),
            selected: option.selected,
            disabled: option.disabled,
          }));
        if (elementType === "radio")
          return [...target.querySelectorAll('input[type="radio"]')].map(
            (option) => ({
              label:
                option.closest("label")?.querySelector("span")?.textContent ||
                option.closest("label")?.textContent.trim() ||
                "",
              value: readFormValue(option),
              selected: option.checked,
              disabled: option.disabled,
            }),
          );
        throw new Error("Options are unavailable for this element.");
      case "dataset":
      case "data":
      case "dataAttributes": {
        const dataset = { ...target.dataset };
        if (control && control !== target)
          Object.assign(dataset, control.dataset);
        return dataset;
      }
      case "open":
        if (elementType !== "accordion")
          throw new Error("Open state is only available for accordion elements.");
        return target.dataset.accordionOpen === "true";
      case "selected":
        if (!target.classList.contains("content-chip"))
          throw new Error("Selected state is only available for chip elements.");
        return target.getAttribute("aria-pressed") === "true";
      case "disabled":
        return control instanceof HTMLInputElement ||
          control instanceof HTMLSelectElement ||
          control instanceof HTMLButtonElement
          ? control.disabled
          : target.getAttribute("aria-disabled") === "true";
      case "visible":
        return !target.hidden;
      case "content":
        if (target instanceof HTMLInputElement)
          return target.getAttribute("placeholder") || "";
        return (
          target.querySelector("[data-localize-content]")?.textContent ||
          target.textContent.trim()
        );
      default:
        throw new Error("Unsupported element property: " + property);
    }
  }

  function safeImageUrl(value) {
    const url = String(value || "").trim();
    if (!url || url.slice(0, 11).toLowerCase() === "javascript:")
      return "";
    if (
      new RegExp(
        "^data:image/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=]+$",
        "i",
      ).test(url)
    )
      return url;
    try {
      const parsed = new URL(url, location.href);
      return ["http:", "https:", "file:"].includes(parsed.protocol) ? url : "";
    } catch {
      return "";
    }
  }

  function getRuntimeContextElementId(elementContext) {
    return elementContext?.closest?.("[data-element-id]")?.dataset.elementId || "";
  }

  function updateElementPropertyBindings(root = document) {
    const bindings = [
      ...(root.matches?.("[data-bind-element-id]") ? [root] : []),
      ...root.querySelectorAll("[data-bind-element-id]"),
    ];
    bindings.forEach((element) => {
      try {
        const value = getRuntimeElementPropertyValue(
          element.dataset.bindElementId,
          element.dataset.bindElementProperty,
          element,
        );
        if (value !== undefined) applyDataBoundValue(element, value);
      } catch (error) {
        const message =
          "Unable to resolve element property binding: " + error.message;
        showErrorPage(message);
        document.dispatchEvent(
          new CustomEvent("embedded-app:error", {
            detail: {
              elementId: element.dataset.elementId,
              sourceElementId: element.dataset.bindElementId,
              property: element.dataset.bindElementProperty,
              message,
            },
          }),
        );
      }
    });
  }

  function updateFormBindings(formValues = collectFormValues(), root = document) {
    const bindings = [
      ...(root.matches?.("[data-bind-form]") ? [root] : []),
      ...root.querySelectorAll("[data-bind-form]"),
    ];
    bindings.forEach((element) => {
      const fieldName = element.dataset.bindForm;
      if (Object.hasOwn(formValues, fieldName))
        applyDataBoundValue(element, formValues[fieldName]);
    });
  }

  function hasUnavailableExtraDataDependency(
    value,
    formValues,
    elementContext,
    visited = new Set(),
    collectionContextId = "",
  ) {
    if (typeof value !== "string") return false;
    const tokenPattern = /\{\{\s*([^{}]+?)\s*\}\}/g;
    for (const match of value.matchAll(tokenPattern)) {
      const reference = match[1].trim();
      const extra = reference.match(
        /^(.+)\.extra\.([A-Za-z_][A-Za-z0-9_-]*)$/,
      );
      if (extra) {
        const identity = extra[1] + ".extra." + extra[2];
        if (visited.has(identity)) continue;
        const entry = ELEMENT_EXTRA_DATA[extra[1]]?.find(
          (item) => item.key === extra[2],
        );
        if (!entry) continue;
        const nextVisited = new Set(visited);
        nextVisited.add(identity);
        const sourceCollectionId =
          ELEMENT_COLLECTION_IDS[extra[1]] || collectionContextId;
        const sourceContext = getExtraDataContext(
          extra[1],
          elementContext,
        );
        if (
          hasUnavailableExtraDataDependency(
            entry.value,
            formValues,
            sourceContext,
            nextVisited,
            sourceCollectionId,
          )
        )
          return true;
        continue;
      }
      const separator = reference.indexOf(".");
      if (separator < 1) continue;
      const source = reference.slice(0, separator).toLowerCase();
      const key = reference.slice(separator + 1).trim();
      if (
        source === "item" &&
        !elementContext?.closest(".content-collection-item") &&
        collectionContextId
      )
        return true;
      if (source === "api") {
        const requestSeparator = key.indexOf(".");
        if (
          requestSeparator > 0 &&
          !Object.hasOwn(API_RESPONSES, key.slice(0, requestSeparator))
        )
          return true;
      }
      if (source === "form" && !Object.hasOwn(formValues, key)) return true;
      if (source === "var") {
        const variable = VARIABLES.find((item) => item.name === key);
        if (
          variable?.source === "form" &&
          !Object.hasOwn(formValues, variable.fieldName)
        )
          return true;
        if (
          variable?.source === "endpoint" &&
          !Object.hasOwn(API_RESPONSES, variable.requestId)
        )
          return true;
      }
    }
    return false;
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
    if (getCollectionIdFromContext(elementContext) === collectionId)
      return elementContext.closest(".content-collection-item");
    const activeRow = ACTIVE_COLLECTION_ROWS.get(collectionId);
    return activeRow?.isConnected ? activeRow : null;
  }

  async function updateExtraBindings(formValues = {}, root = document) {
    const bindings = [
      ...(root.matches?.("[data-bind-extra]") ? [root] : []),
      ...root.querySelectorAll("[data-bind-extra]"),
    ];
    for (const element of bindings) {
      try {
        if (
          hasUnavailableExtraDataDependency(
            "{{" + element.dataset.bindExtra + "}}",
            formValues,
            element,
          )
        )
          continue;
        const value = await resolveActionValue(
          "{{" + element.dataset.bindExtra + "}}",
          formValues,
          element,
        );
        applyDataBoundValue(element, value);
      } catch (error) {
        const message = "Unable to resolve extra data binding: " + error.message;
        showErrorPage(message);
        document.dispatchEvent(
          new CustomEvent("embedded-app:error", {
            detail: {
              elementId: element.dataset.elementId,
              reference: element.dataset.bindExtra,
              message,
            },
          }),
        );
      }
    }
    updateElementPropertyBindings(root);
  }

  function isVariableDataReady(variable, visited = new Set()) {
    if (!variable || visited.has(variable.id)) return true;
    const nextVisited = new Set(visited);
    nextVisited.add(variable.id);
    if (variable.source === "endpoint")
      return Object.hasOwn(API_RESPONSES, variable.requestId);
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

  document.addEventListener("input", (event) => {
    if (!event.target.closest("[data-form-name]")) return;
    const formValues = collectFormValues();
    Promise.all([
      updateVariableBindings(formValues),
      updateExtraBindings(formValues),
      updateFormBindings(formValues),
      updateElementPropertyBindings(),
    ]).catch((error) => {
      showErrorPage(error.message);
      document.dispatchEvent(
        new CustomEvent("embedded-app:error", {
          detail: { message: error.message },
        }),
      );
    });
  });

  function readFormValue(control) {
    const raw = control.dataset.formValue;
    if (raw === undefined) return control.value;
    try { return JSON.parse(raw); } catch (error) {
      throw new Error("Invalid JSON value configured for form field " + control.dataset.formName + ".");
    }
  }

  function collectFormValues() {
    const groups = new Map();
    const activePage = document.querySelector(
      '[data-app-page="' + CSS.escape(activePageId) + '"]',
    );
    const values = {};
    if (!activePage) return values;
    const activeSheets = [
      ...document.querySelectorAll("[data-sheet-id][data-sheet-page]"),
    ].filter(
      (sheet) =>
        sheet.dataset.sheetPage === activePageId &&
        !sheet.hidden &&
        sheet.classList.contains("is-active"),
    );
    const formControls = [
      ...activePage.querySelectorAll("[data-form-name]:not(:disabled)"),
      ...activeSheets.flatMap((sheet) => [
        ...(sheet.matches("[data-form-name]:not(:disabled)") ? [sheet] : []),
        ...sheet.querySelectorAll("[data-form-name]:not(:disabled)"),
      ]),
    ];
    [...new Set(formControls)].forEach((control) => {
      const name = control?.dataset?.formName;
      if (!name || !control.isConnected) return;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(control);
    });
    const setValue = (name, value) => Object.defineProperty(values, name, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    groups.forEach((controls, name) => {
      const first = controls.find((control) => control?.isConnected);
      if (!first) return;
      if (first.dataset.filePicker !== undefined) {
        setValue(
          name,
          normalizeFilePickerValue(first.dataset.filePickerValue || "[]"),
        );
        return;
      }
      if (first instanceof HTMLSelectElement) {
        const selected = [...first.selectedOptions].filter((option) => !option.disabled);
        const selectedValues = selected.map(readFormValue);
        if (first.multiple) setValue(name, selectedValues);
        else setValue(name, selectedValues.length ? selectedValues[0] : "");
        return;
      }
      if (first instanceof HTMLInputElement && first.type === "radio") {
        const selected = controls.find((control) => control.checked);
        if (selected) setValue(name, readFormValue(selected));
        return;
      }
      if (controls.every((control) => control instanceof HTMLInputElement && control.type === "checkbox")) {
        if (controls.length === 1) setValue(name, first.checked);
        else setValue(name, controls.filter((control) => control.checked).map(readFormValue));
        return;
      }
      if (first instanceof HTMLInputElement) setValue(name, first.value);
    });
    return values;
  }

  async function resolveActionValue(
    value,
    formValues = {},
    elementContext = null,
    resolvingExtras = new Set(),
    resolvingVariables = new Set(),
  ) {
    if (Array.isArray(value))
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
    const tokenPattern = /\{\{\s*([^{}]+?)\s*\}\}/g;
    const exact = value.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
    async function resolveToken(token) {
      let reference = token.trim();
      const selfReference = reference.match(/^(?:self|element)\.(.+)$/i);
      if (selfReference) {
        const elementId = getRuntimeContextElementId(elementContext);
        if (!elementId)
          throw new Error("The self token requires an element action context.");
        const selfPath = selfReference[1];
        if (!selfPath.startsWith("extra.")) {
          const [property, ...path] = selfPath.split(".");
          const propertyValue = getRuntimeElementPropertyValue(
            elementId,
            property,
            elementContext,
          );
          if (!path.length) return propertyValue;
          const nestedValue = readPath(propertyValue, path.join("."));
          if (nestedValue === undefined)
            throw new Error("Self element property path is unavailable: " + selfPath);
          return nestedValue;
        }
        reference = elementId + "." + selfPath;
      }
      const extra = reference.match(/^(.+)\.extra\.([A-Za-z_][A-Za-z0-9_-]*)$/);
      if (extra) {
        const [, elementId, key] = extra;
        const identity = elementId + ".extra." + key;
        if (resolvingExtras.has(identity))
          throw new Error("Circular extra data reference: " + identity);
        const entry = ELEMENT_EXTRA_DATA[elementId]?.find(
          (item) => item.key === key,
        );
        if (!entry) throw new Error("Extra data value not found: " + identity);
        const nextExtras = new Set(resolvingExtras);
        nextExtras.add(identity);
        const extraElementContext = getExtraDataContext(
          elementId,
          elementContext,
        );
        return resolveActionValue(
          entry.value,
          formValues,
          extraElementContext,
          nextExtras,
          resolvingVariables,
        );
      }
      const separator = reference.indexOf(".");
      if (separator < 1) throw new Error("Invalid data token: " + reference);
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
        if (nestedValue === undefined)
          throw new Error(
            "Variable path is unavailable: " + name + "." + path.join("."),
          );
        return nestedValue;
      }
      if (source === "form") {
        if (!Object.hasOwn(formValues, key))
          throw new Error("Form field not found: " + key);
        return formValues[key];
      }
      if (source === "item") {
        const row = elementContext?.closest(".content-collection-item");
        if (!row) throw new Error("Collection item data is unavailable: " + key);
        let record;
        try {
          record = JSON.parse(row.dataset.collectionRecord || "null");
        } catch {
          throw new Error("Collection item data is invalid.");
        }
        const itemValue = readPath(record, key);
        if (itemValue === undefined)
          throw new Error("Collection item field not found: " + key);
        return itemValue;
      }
      throw new Error("Unsupported data token: " + reference);
    }
    if (exact) return resolveToken(exact[1]);
    const matches = [...value.matchAll(tokenPattern)];
    if (!matches.length) return value;
    const resolved = await Promise.all(
      matches.map((match) => resolveToken(match[1])),
    );
    let index = 0;
    return value.replace(tokenPattern, () => {
      const item = resolved[index++];
      return item && typeof item === "object" ? JSON.stringify(item) : String(item ?? "");
    });
  }

  async function resolveConfiguredActionValue(value, formValues, elementContext = null) {
    const source = String(value ?? "null").trim();
    const token = source.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
    if (token)
      return resolveActionValue(source, formValues, elementContext);
    try {
      return await resolveActionValue(
        JSON.parse(source),
        formValues,
        elementContext,
      );
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new Error(
          "Enter a valid JSON value or a complete {{form.name}}, {{twk.field}}, {{var.name}}, or {{api.requestId.path}} token.",
        );
      throw error;
    }
  }

  async function resolveRequestValue(value, formValues = {}, elementContext = null) {
    return resolveActionValue(value, formValues, elementContext);
  }

  async function runRequest(request, formValues = {}, elementContext = null) {
    showApiProgress();
    try {
      const url = new URL(await resolveString(request.url, true, formValues, elementContext));
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS request URLs are supported.");
      const headers = await resolveRequestValue(JSON.parse(request.headers || "{}"), formValues, elementContext);
      if (!headers || Array.isArray(headers) || typeof headers !== "object") throw new Error("Request headers must be a JSON object.");
      Object.entries(headers).forEach(([key, value]) => { headers[key] = String(value); });
      const options = { method: request.method, headers };
      if (request.body && request.method !== "GET") {
        options.body = JSON.stringify(await resolveRequestValue(JSON.parse(request.body), formValues, elementContext));
        if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
      }
      const response = await fetch(url, options);
      const text = await response.text();
      let data = text;
      if (text) {
        try { data = JSON.parse(text); } catch { data = text; }
      }
      if (!response.ok) throw new Error("HTTP " + response.status + (text ? ": " + text.slice(0, 240) : ""));

      API_RESPONSES[request.id] = data;
      await populateRequestLists(request.id, data);
      await updateExtraBindings(formValues);
      document.querySelectorAll("[data-bind-request]").forEach((element) => {
        if (element.dataset.bindRequest !== request.id) return;
        const value = readPath(data, element.dataset.bindPath || "");
        if (value === undefined) return;
        applyDataBoundValue(element, value);
      });
      await updateVariableBindings(formValues);
      document.dispatchEvent(new CustomEvent("embedded-app:response", { detail: { requestId: request.id, data } }));
      setStatus("");
      return data;
    } catch (error) {
      const message = "تعذر تنفيذ الطلب «" + request.name + "»: " + error.message;
      showErrorPage(message);
      document.dispatchEvent(new CustomEvent("embedded-app:error", { detail: { requestId: request.id, message } }));
      return undefined;
    } finally {
      hideApiProgress();
    }
  }

  async function loadTwkBindings() {
    const elements = [...document.querySelectorAll("[data-bind-twk]")];
    const lists = [...document.querySelectorAll("[data-list-source='twk']")];
    const collections = [
      ...document.querySelectorAll("[data-collection-source='twk']"),
    ];
    if (!elements.length && !lists.length && !collections.length) return;
    await Promise.all(elements.map(async (element) => {
      try {
        const value = await getTwkValue(element.dataset.bindTwk);
        applyDataBoundValue(element, value);
      } catch (error) {
        const message = "تعذر تحميل بيانات توكلنا: " + error.message;
        showErrorPage(message);
        document.dispatchEvent(new CustomEvent("embedded-app:error", { detail: { message: error.message } }));
      }
    }));
    await Promise.all(lists.map(async (select) => {
      const config = LIST_CONFIGS[select.dataset.listId] || {};
      try {
        populateList(select, await getTwkValue(config.field || select.dataset.listField), config);
      } catch (error) {
        const message = "تعذر تحميل خيارات قائمة توكلنا: " + error.message;
        showErrorPage(message);
        document.dispatchEvent(new CustomEvent("embedded-app:error", { detail: { elementId: select.dataset.listId, message } }));
      }
    }));
    await Promise.all(collections.map(async (collection) => {
      const config = COLLECTION_CONFIGS[collection.dataset.collectionId] || {};
      try {
        await populateCollection(
          collection,
          await getTwkValue(config.field || collection.dataset.collectionField),
        );
      } catch (error) {
        const message = "تعذر تحميل عناصر القائمة المرئية من توكلنا: " + error.message;
        showErrorPage(message);
        document.dispatchEvent(new CustomEvent("embedded-app:error", {
          detail: { elementId: collection.dataset.collectionId, message: error.message },
        }));
      }
    }));
    await updateExtraBindings(collectFormValues());
  }

  function isEmptyConditionValue(value) {
    return (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0) ||
      (value && typeof value === "object" && Object.keys(value).length === 0)
    );
  }

  function conditionValuesEqual(left, right) {
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

  async function evaluateCondition(condition, formValues, elementContext = null) {
    let actual;
    if (condition.source === "static") {
      actual = await resolveConfiguredActionValue(
        condition.sourceValue ?? "null",
        formValues,
        elementContext,
      );
    } else if (condition.source === "api" || condition.source === "endpoint") {
      const request = API_REQUESTS.find(
        (item) => item.id === condition.requestId,
      );
      if (!request) throw new Error("Select a valid API request for the condition.");
      if (!Object.hasOwn(API_RESPONSES, request.id)) {
        const response = await runRequest(request, formValues, elementContext);
        if (response === undefined)
          throw new Error("The API response required by the condition could not be loaded.");
      }
      actual = readPath(API_RESPONSES[request.id], condition.path || "");
    } else if (condition.source === "variable") {
      if (!condition.variableName)
        throw new Error("Select a variable for the condition.");
      actual = await resolveVariableValue(
        condition.variableName,
        formValues,
        elementContext,
      );
    } else if (condition.source === "twk") {
      actual = await getTwkValue(condition.fieldKey || "user_id");
    } else if (condition.source === "form") {
      if (!condition.fieldName)
        throw new Error("Enter a form field name for the condition.");
      if (!Object.hasOwn(formValues, condition.fieldName))
        throw new Error("Form field not found: " + condition.fieldName);
      actual = formValues[condition.fieldName];
    } else if (condition.source === "item") {
      actual = await resolveActionValue(
        "{{item." + (condition.itemPath || "") + "}}",
        formValues,
        elementContext,
      );
    } else if (condition.source === "extra") {
      actual = await resolveActionValue(
        "{{" + (condition.extraPath || "") + "}}",
        formValues,
        elementContext,
      );
    } else if (condition.source === "element") {
      actual = getRuntimeElementPropertyValue(
        condition.elementId,
        condition.property,
        elementContext,
      );
    } else {
      throw new Error("Select a valid condition data source.");
    }

    actual = readValuePath(actual, condition.objectPath);
    const operator = condition.operator || "equals";
    if (operator === "empty") return isEmptyConditionValue(actual);
    if (operator === "notEmpty") return !isEmptyConditionValue(actual);
    const expected = await resolveConfiguredActionValue(
      condition.value ?? "null",
      formValues,
      elementContext,
    );
    if (operator === "equals") return conditionValuesEqual(actual, expected);
    if (operator === "notEquals")
      return !conditionValuesEqual(actual, expected);
    if (operator === "greaterThan" || operator === "lessThan") {
      const toNumber = (value) => {
        if (
          typeof value !== "number" &&
          !(typeof value === "string" && value.trim() !== "")
        )
          return NaN;
        return Number(value);
      };
      const leftNumber = toNumber(actual);
      const rightNumber = toNumber(expected);
      if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber))
        throw new Error("Greater/less comparisons require numeric values.");
      return operator === "greaterThan"
        ? leftNumber > rightNumber
        : leftNumber < rightNumber;
    }
    if (operator === "contains") {
      if (Array.isArray(actual))
        return actual.some((item) => conditionValuesEqual(item, expected));
      if (typeof actual === "string")
        return actual.includes(String(expected ?? ""));
      if (actual && typeof actual === "object")
        return Object.hasOwn(actual, String(expected));
      throw new Error("Contains comparison requires a string, array, or object.");
    }
    throw new Error("Unsupported condition operator: " + operator);
  }

  async function runTwkSystemAction(action) {
    const helper = window.TWK && window.TWK[action.type];
    if (typeof helper !== "function")
      throw new Error("TWK." + action.type + " is unavailable.");

    const response = await helper.call(window.TWK);
    if (response && typeof response === "object" && response.success === false) {
      const error =
        response.result?.error ||
        response.result?.message ||
        response.error ||
        response.message;
      throw new Error(
        "TWK." +
        action.type +
        " failed" +
        (error ? ": " + String(error) : "."),
      );
    }

    if (action.type === "shareScreenShot") {
      const result =
        response &&
          typeof response === "object" &&
          response.success === true &&
          Object.prototype.hasOwnProperty.call(response, "result")
          ? response.result
          : response;
      return { type: action.type, result };
    }

    let permissionResponse = response;
    for (let depth = 0; depth < 3; depth += 1) {
      if (
        permissionResponse &&
        typeof permissionResponse === "object" &&
        !Array.isArray(permissionResponse) &&
        Object.prototype.hasOwnProperty.call(permissionResponse, "result")
      ) {
        permissionResponse = permissionResponse.result;
        continue;
      }
      break;
    }
    if (typeof permissionResponse === "boolean")
      return { granted: permissionResponse };
    if (
      permissionResponse &&
      typeof permissionResponse === "object" &&
      typeof permissionResponse.granted === "boolean"
    )
      return { granted: permissionResponse.granted };
    throw new Error(
      "TWK." + action.type + " must return a boolean granted value.",
    );
  }

  async function runConditionalEffect(
    effect,
    formValues,
    elementContext = null,
    globalActionStack = new Set(),
  ) {
    if (effect.type === "condition") {
      const matched = await evaluateCondition(
        effect.condition || {},
        formValues,
        elementContext,
      );
      const selectedActions = getConditionActionLists(effect)[
        matched ? "actions" : "elseActions"
      ];
      const effects = [];
      for (const action of selectedActions)
        effects.push(
          await runConditionalEffect(
            action,
            formValues,
            elementContext,
            globalActionStack,
          ),
        );
      return { type: effect.type, matched, effects };
    }
    if (effect.type === "globalAction") {
      const globalActionId =
        effect.globalActionId || GLOBAL_ACTIONS[0]?.id || "";
      const globalAction = GLOBAL_ACTIONS.find(
        (action) => action.id === globalActionId,
      );
      if (!globalAction)
        throw new Error("Select an existing global action.");
      if (globalActionStack.has(globalAction.id))
        throw new Error("Recursive global action call: " + globalAction.name);
      const nextStack = new Set(globalActionStack);
      nextStack.add(globalAction.id);
      const effects = [];
      for (const action of globalAction.actions)
        effects.push(
          await runConditionalEffect(
            action,
            formValues,
            elementContext,
            nextStack,
          ),
        );
      return {
        type: effect.type,
        globalActionId: globalAction.id,
        name: globalAction.name,
        effects,
      };
    }
    if (TWK_SYSTEM_ACTION_TYPES.includes(effect.type)) {
      const result = await runTwkSystemAction(effect);
      if (TWK_PERMISSION_ACTION_TYPES.includes(effect.type)) {
        const selectedActions = getConditionActionLists(effect)[
          result.granted ? "actions" : "elseActions"
        ];
        for (const action of selectedActions)
          await runConditionalEffect(
            action,
            formValues,
            elementContext,
            globalActionStack,
          );
      }
      return result;
    }
    if (effect.type === "showElement" || effect.type === "hideElement") {
      return setElementVisibility(
        effect.elementId,
        effect.type === "showElement",
        elementContext,
      );
    }
    if (effect.type === "navigate") {
      showPage(effect.pageId, true);
      return { type: effect.type, pageId: effect.pageId };
    }
    if (effect.type === "back")
      return { type: effect.type, pageId: goBackPage() };
    if (effect.type === "showSheet")
      return showSheet(effect.sheetId, elementContext);
    if (effect.type === "hideSheet")
      return hideSheet(effect.sheetId, elementContext);
    if (effect.type === "showToast") return showToastElement(effect.toastId);
    if (effect.type === "request") {
      const request = API_REQUESTS.find((item) => item.id === effect.requestId);
      if (!request) throw new Error("Select a valid API request.");
      const data = await runRequest(request, formValues, elementContext);
      if (data === undefined) throw new Error("The API request failed.");
      return { type: effect.type, requestId: request.id, data };
    }
    if (effect.type === "function")
      return runFunctionAction(effect, formValues, elementContext);
    if (effect.type === "setVariable") {
      const variableId =
        effect.variableId ||
        VARIABLES.find((item) => item.source === "static")?.id ||
        "";
      const variable = VARIABLES.find(
        (item) => item.id === variableId && item.source === "static",
      );
      if (!variable) throw new Error("Select an existing static variable.");
      const value = await resolveConfiguredActionValue(
        effect.value,
        formValues,
        elementContext,
      );
      VARIABLE_OVERRIDES[variable.id] = value;
      await updateVariableBindings(formValues);
      return { type: effect.type, variable: variable.name, value };
    }
    if (effect.type === "changeProperty") {
      if (!effect.targetElementId)
        throw new Error("Select an element to change.");
      const resolvedValue = ["visibility", "disabled"].includes(effect.property)
        ? effect.value
        : await resolveActionValue(
          effect.value ?? "",
          formValues,
          elementContext,
        );
      const value = effect.property.startsWith("plugin.")
        ? resolvedValue
        : displayValue(resolvedValue);
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
    if (effect.type === "openService") {
      const helper = window.TWK && window.TWK.openService;
      if (typeof helper !== "function")
        throw new Error("TWK.openService is unavailable.");
      const serviceId = String(effect.serviceId || "").trim();
      if (!serviceId) throw new Error("A Tawakkalna service ID is required.");
      let template;
      try {
        template = JSON.parse(effect.values || "{}");
      } catch {
        throw new Error("Action values must be valid JSON.");
      }
      const values = await resolveActionValue(
        template,
        formValues,
        elementContext,
      );
      const result = await helper.call(window.TWK, serviceId, values);
      return { type: effect.type, serviceId, values, result };
    }
    if (effect.type === "message") {
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
      showMessageDialog(displayValue(title), displayValue(message));
      return {
        type: effect.type,
        title: displayValue(title),
        message: displayValue(message),
      };
    }
    throw new Error("Unsupported conditional action: " + effect.type);
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

  async function handleComponentEventForElement(event, elementNode) {
    const { elementId, appAction: action = "", appUrl: url = "" } = elementNode.dataset;
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
    const linkedRequests = primaryEventMatches && event.type === "click"
      ? API_REQUESTS.filter(
        (request) =>
          request.trigger === "button" &&
          request.buttonId === elementId &&
          !handlerRequestIds.has(request.id),
      )
      : [];
    if (
      (!primaryEventMatches || !configured.type || configured.type === "none") &&
      !linkedRequests.length &&
      !additionalHandlers.length
    )
      return;
    const actionRequest =
      primaryEventMatches && configured.type === "request"
        ? API_REQUESTS.find((request) => request.id === configured.requestId)
        : null;
    let formValues = {};
    if (
      [
        "request",
        "openService",
        "setVariable",
        "changeProperty",
        "condition",
        "message",
        "function",
        "globalAction",
      ].includes(configured.type) ||
      TWK_PERMISSION_ACTION_TYPES.includes(configured.type) ||
      linkedRequests.length ||
      additionalHandlers.length
    ) {
      try {
        formValues = collectFormValues();
      } catch (error) {
        const message = "تعذر جمع قيم النموذج: " + error.message;
        showErrorPage(message);
        document.dispatchEvent(
          new CustomEvent("embedded-app:error", {
            detail: { elementId, message },
          }),
        );
        return;
      }
    }
    const runAdditionalHandlers = async () => {
      for (const handler of additionalHandlers) {
        const result = await runConditionalEffect(handler, formValues, elementNode);
        document.dispatchEvent(
          new CustomEvent("embedded-app:action", {
            detail: { action, elementId, handler, result },
          }),
        );
      }
    };
    if (!primaryEventMatches) {
      await runAdditionalHandlers();
      return;
    }
    if (configured.type === "request") {
      if (!actionRequest) {
        await Promise.all(
          linkedRequests.map((request) =>
            runRequest(request, formValues, elementNode),
          ),
        );
        const message = "اختر طلب API صالحاً لهذا العنصر.";
        showErrorPage(message);
        document.dispatchEvent(
          new CustomEvent("embedded-app:error", {
            detail: { elementId, message: "No API request is configured for this component." },
          }),
        );
        return;
      }
      const requests = [
        ...new Map(
          [...linkedRequests, actionRequest].map((request) => [request.id, request]),
        ).values(),
      ];
      const results = await Promise.all(
        requests.map((request) => runRequest(request, formValues, elementNode)),
      );
      if (results.some((result) => result === undefined)) return;
      const data =
        results[requests.findIndex((request) => request.id === actionRequest.id)];
      document.dispatchEvent(
        new CustomEvent("embedded-app:action", {
          detail: { action, elementId, requestId: configured.requestId, data },
        }),
      );
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
    if (["function", "globalAction"].includes(configured.type)) {
      const result = await runConditionalEffect(
        configured,
        formValues,
        elementNode,
      );
      document.dispatchEvent(
        new CustomEvent("embedded-app:action", {
          detail: { action, elementId, ...result },
        }),
      );
      await runAdditionalHandlers();
      return;
    }
    if (TWK_SYSTEM_ACTION_TYPES.includes(configured.type)) {
      const result = await runConditionalEffect(
        configured,
        formValues,
        elementNode,
      );
      document.dispatchEvent(
        new CustomEvent("embedded-app:action", {
          detail: { action, elementId, result },
        }),
      );
      await runAdditionalHandlers();
      return;
    }
    if (configured.type === "condition") {
      const matched = await evaluateCondition(
        configured.condition || {},
        formValues,
        elementNode,
      );
      const selectedActions = getConditionActionLists(configured)[
        matched ? "actions" : "elseActions"
      ];
      const effects = [];
      for (const effect of selectedActions) {
        effects.push(
          await runConditionalEffect(effect, formValues, elementNode),
        );
      }
      document.dispatchEvent(
        new CustomEvent("embedded-app:action", {
          detail: {
            action,
            elementId,
            matched,
            effects,
            effect: effects[effects.length - 1],
          },
        }),
      );
      await runAdditionalHandlers();
      return;
    }
    if (configured.type === "message") {
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
      const text = displayValue(message);
      const messageTitle = displayValue(title);
      showMessageDialog(messageTitle, text);
      document.dispatchEvent(
        new CustomEvent("embedded-app:action", {
          detail: { action, elementId, title: messageTitle, message: text },
        }),
      );
      await runAdditionalHandlers();
      return;
    }
    if (configured.type === "showSheet") {
      const result = showSheet(configured.sheetId, elementNode);
      document.dispatchEvent(
        new CustomEvent("embedded-app:action", {
          detail: { action, elementId, sheetId: configured.sheetId, result },
        }),
      );
      await runAdditionalHandlers();
      return;
    }
    if (configured.type === "hideSheet") {
      const result = hideSheet(configured.sheetId, elementNode);
      document.dispatchEvent(
        new CustomEvent("embedded-app:action", {
          detail: { action, elementId, sheetId: configured.sheetId, result },
        }),
      );
      await runAdditionalHandlers();
      return;
    }
    if (configured.type === "showToast") {
      const result = showToastElement(configured.toastId);
      updateElementPropertyBindings();
      document.dispatchEvent(
        new CustomEvent("embedded-app:action", {
          detail: { action, elementId, toastId: configured.toastId, result },
        }),
      );
      await runAdditionalHandlers();
      return;
    }
    if (configured.type === "setVariable") {
      try {
        const variableId =
          configured.variableId ||
          VARIABLES.find((item) => item.source === "static")?.id ||
          "";
        const variable = VARIABLES.find(
          (item) =>
            item.id === variableId && item.source === "static",
        );
        if (!variable) throw new Error("Select an existing static variable.");
        const value = await resolveConfiguredActionValue(
          configured.value,
          formValues,
          elementNode,
        );
        VARIABLE_OVERRIDES[variable.id] = value;
        await updateVariableBindings(formValues);
        document.dispatchEvent(
          new CustomEvent("embedded-app:action", {
            detail: { action, elementId, variable: variable.name, value },
          }),
        );
      } catch (error) {
        const message = "تعذر تعيين المتغير: " + error.message;
        showErrorPage(message);
        document.dispatchEvent(
          new CustomEvent("embedded-app:error", {
            detail: { elementId, variableId: configured.variableId, message },
          }),
        );
      }
      await runAdditionalHandlers();
      return;
    }
    if (configured.type === "changeProperty") {
      try {
        const targetElementId = configured.targetElementId;
        const property = configured.property;
        const resolvedValue = ["visibility", "disabled"].includes(property)
          ? configured.value
          : await resolveActionValue(
            configured.value ?? "",
            formValues,
            elementNode,
          );
        const value = property.startsWith("plugin.")
          ? resolvedValue
          : displayValue(resolvedValue);
        changeElementProperty(
          targetElementId,
          property,
          value,
          elementNode,
        );
        updateElementPropertyBindings();
        document.dispatchEvent(
          new CustomEvent("embedded-app:action", {
            detail: {
              action,
              elementId,
              targetElementId,
              property,
              value,
            },
          }),
        );
      } catch (error) {
        const message = "تعذر تغيير خاصية العنصر: " + error.message;
        showErrorPage(message);
        document.dispatchEvent(
          new CustomEvent("embedded-app:error", {
            detail: {
              elementId,
              targetElementId: configured.targetElementId,
              message,
            },
          }),
        );
      }
      await runAdditionalHandlers();
      return;
    }
    if (configured.type === "navigate") {
      try {
        showPage(configured.pageId, true);
      } catch (error) {
        showErrorPage("تعذر الانتقال إلى الصفحة: " + error.message);
        document.dispatchEvent(
          new CustomEvent("embedded-app:error", {
            detail: { elementId, pageId: configured.pageId, message: error.message },
          }),
        );
      }
      await runAdditionalHandlers();
      return;
    }
    if (configured.type === "back") {
      const pageId = goBackPage();
      document.dispatchEvent(
        new CustomEvent("embedded-app:action", {
          detail: { action, elementId, pageId },
        }),
      );
      await runAdditionalHandlers();
      return;
    }
    if (configured.type !== "openService") {
      document.dispatchEvent(
        new CustomEvent("embedded-app:action", {
          detail: { action, url, elementId },
        }),
      );
      await runAdditionalHandlers();
      return;
    }
    try {
      const helper = window.TWK && window.TWK.openService;
      if (typeof helper !== "function")
        throw new Error("TWK.openService is unavailable.");
      const serviceId = String(configured.serviceId || "").trim();
      if (!serviceId) throw new Error("A Tawakkalna service ID is required.");
      let template;
      try {
        template = JSON.parse(configured.values || "{}");
      } catch {
        throw new Error("Action values must be valid JSON.");
      }
      const values = await resolveActionValue(template, formValues, elementNode);
      const result = await helper.call(window.TWK, serviceId, values);
      setStatus("");
      document.dispatchEvent(
        new CustomEvent("embedded-app:action", {
          detail: { action, url, elementId, serviceId, values, result },
        }),
      );
    } catch (error) {
      const message = "تعذر فتح خدمة توكلنا: " + error.message;
      showErrorPage(message);
      document.dispatchEvent(
        new CustomEvent("embedded-app:error", {
          detail: { elementId, serviceId: configured.serviceId || "", message },
        }),
      );
    }
    await runAdditionalHandlers();
  }

  async function handleComponentEvent(event) {
    const elementNodes = event
      .composedPath()
      .filter(
        (node) =>
          node instanceof Element && node.matches("[data-element-id]"),
      );
    for (const elementNode of elementNodes)
      await handleComponentEventForElement(event, elementNode);
  }

  const workflowEventNames = new Set([
    "click",
    "change",
    "input",
    "onFilesSelected",
    ...Object.values(PLUGIN_DEFINITIONS).flatMap(
      (plugin) => plugin.events || [],
    ),
  ]);
  workflowEventNames.forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      handleComponentEvent(event).catch((error) => {
        const message = "تعذر تنفيذ إجراء العنصر: " + error.message;
        showErrorPage(message);
        document.dispatchEvent(
          new CustomEvent("embedded-app:error", {
            detail: { message, type: eventName },
          }),
        );
      });
    });
  });

  const twkBindingsReady = loadTwkBindings();
  async function runInitialRequests() {
    try {
      for (const request of API_REQUESTS.filter(
        (item) => item.trigger === "load" && item.url.trim(),
      )) {
        await runRequest(request, collectFormValues());
      }
    } catch (error) {
      showErrorPage(error.message);
      document.dispatchEvent(
        new CustomEvent("embedded-app:error", {
          detail: { message: error.message },
        }),
      );
    }
  }

  async function runAppLoadHandlers() {
    const formValues = collectFormValues();
    for (const handler of APP_LOAD_HANDLERS) {
      if (!handler.type || handler.type === "none") continue;
      try {
        const result = await runConditionalEffect(handler, formValues);
        document.dispatchEvent(
          new CustomEvent("embedded-app:action", {
            detail: { event: "load", handler, result },
          }),
        );
      } catch (error) {
        const message = "Unable to run app load action: " + error.message;
        showErrorPage(message);
        document.dispatchEvent(
          new CustomEvent("embedded-app:error", {
            detail: { message, event: "load", handler },
          }),
        );
        return;
      }
    }
  }

  window.embadly = Object.freeze({
    showMessage: showMessageDialog,
    navigateToPage(pageId) {
      showPage(pageId, true);
      return activePageId;
    },
    goBack: goBackPage,
    showSheet: (sheetId) => showSheet(sheetId),
    hideSheet: (sheetId) => hideSheet(sheetId),
    showToast: showToastElement,
    showElement: (elementId) => setElementVisibility(elementId, true),
    hideElement: (elementId) => setElementVisibility(elementId, false),
  });

  initializeApp();

}
