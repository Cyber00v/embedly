// @ts-nocheck
import {
  getPluginDefinition,
  normalizePluginProperties,
} from "./plugin-system.ts";
import { resolveLocalizedContent } from "./localization.ts";

export function createPreviewRenderer(dependencies) {
  const { TemplateEngine, EXPORT_HTML_TEMPLATES, state, escapeHtml, normalizeClassNames, getLocalizedContent, getElementThemeColor, getExportElementThemeColor, getExportThemeColor, getElementFontSize, getScaledSpacingCss, getSpacingCss, clampNumber, safeColor, defaultBorderRadius, normalizeDimension, getAbsoluteLayoutChildAlignment, getFormName, inputTypes, getAsset, safeImageUrl, isInsideCollection, getVariantOptions, getDefaultVariant, normalizeOptions, customComponentClass, safeCustomHtml } = dependencies;

  function renderExportTemplate(name, context) {
    return TemplateEngine.render(
      `{{> ${name}}}`,
      context,
      EXPORT_HTML_TEMPLATES,
    );
  }

  function buildMarkup(assetUrlFor = (asset) => asset.dataUrl) {
    const renderElement = (element, depth = 2) => {
      const indent = " ".repeat(depth);
      const componentClass = (baseClass) =>
        escapeHtml(
          [
            baseClass,
            element.rippleEffect === true ? "ripple-effect-enabled" : "",
            normalizeClassNames(element.className),
          ]
            .filter(Boolean)
            .join(" "),
        );
      const tag =
        element.type === "heading"
          ? "h2"
          : ["button", "chip", "fab"].includes(element.type)
            ? "button"
            : element.type === "divider"
              ? "hr"
              : element.type === "input"
                ? "input"
                : "div";
      const contentValue =
        getLocalizedContent(element, state.settings.appLanguage);
      const content = escapeHtml(contentValue);
      const hasButtonVariant = ["button", "fab"].includes(element.type);
      const hasButtonIcon =
        element.type === "button" && /^fa-[a-z0-9-]+$/.test(element.iconClass);
      const buttonIconJustifyContent =
        element.styles.align === "center"
          ? "center"
          : element.styles.align === "end"
            ? "flex-end"
            : "flex-start";
      const styles = [
        `color:${hasButtonVariant ? (["ghost", "outline"].includes(element.styles.variant) ? "var(--theme-primary)" : element.styles.variant === "custom" ? safeColor(element.styles.color, "#ffffff") : element.styles.variant === "secondary" ? "var(--secondary-foreground)" : "var(--primary-foreground)") : getExportElementThemeColor(element, "color")}`,
        `background-color:${element.type === "divider" || (hasButtonVariant && ["ghost", "outline"].includes(element.styles.variant)) ? "transparent" : hasButtonVariant ? (element.styles.variant === "custom" ? safeColor(element.styles.background, "#176b59") : element.styles.variant === "secondary" ? "var(--theme-secondary)" : element.styles.variant === "destructive" ? "var(--destructive)" : "var(--theme-primary)") : getExportElementThemeColor(element, "background")}`,
        ...(element.type === "sheet"
          ? [`direction:${state.settings.appLanguage === "ar" ? "rtl" : "ltr"}`]
          : []),
        `font-size:calc(${getElementFontSize(element)}px * var(--element-size-scale, 1))`,
        `text-align:${["start", "center", "end"].includes(element.styles.align) ? element.styles.align : "start"}`,
        ...(hasButtonIcon
          ? [`justify-content:${buttonIconJustifyContent}`]
          : []),
        `padding:${element.type === "divider" ? "0" : getScaledSpacingCss(element.styles, "padding")}`,
        `margin:${getSpacingCss(element.styles, "margin")}`,
        ...(clampNumber(element.styles.borderWidth, 0, 12, 0)
          ? [
            `border:${clampNumber(element.styles.borderWidth, 0, 12, 0)}px solid ${getExportThemeColor("border", safeColor(element.styles.borderColor, "#dbe5e1"))}`,
          ]
          : []),
        `border-radius:${clampNumber(element.styles.borderRadius, 0, 100, defaultBorderRadius(element.type))}px`,
        ...(normalizeDimension(element.styles.height) ? ["min-height:0"] : []),
        ...(element.type === "image" && normalizeDimension(element.styles.height)
          ? ["max-height:none"]
          : []),
        ...(normalizeDimension(element.styles.width)
          ? [`width:${normalizeDimension(element.styles.width)}`]
          : []),
        ...(normalizeDimension(element.styles.height)
          ? [`height:${normalizeDimension(element.styles.height)}`]
          : []),
        ...((normalizeDimension(element.styles.width) &&
          normalizeDimension(element.styles.width) !== "auto") ||
          (normalizeDimension(element.styles.height) &&
            normalizeDimension(element.styles.height) !== "auto")
          ? ["flex-shrink:0"]
          : []),
      ].join(";");
      const supportsBinding = ![
        "list",
        "layout",
        "absoluteLayout",
        "grid",
        "collection",
        "image",
        "icon",
      ].includes(element.type);
      const bindingKind = ["checkbox", "radio", "switch"].includes(element.type)
        ? ` data-bind-kind="${element.type === "switch" ? "checkbox" : element.type}"`
        : "";
      const bindingAttributesBase = !supportsBinding
        ? ""
        : element.binding?.source === "item"
          ? ` data-bind-item="${escapeHtml(element.binding.path)}"${bindingKind}`
          : element.binding?.source === "form"
            ? ` data-bind-form="${escapeHtml(element.binding.path)}"${bindingKind}`
            : element.binding?.source === "twk"
              ? ` data-bind-twk="${escapeHtml(element.binding.path)}"${bindingKind}`
              : element.binding?.source === "endpoint"
                ? ` data-bind-request="${escapeHtml(element.binding.requestId)}" data-bind-path="${escapeHtml(element.binding.path)}"${bindingKind}`
                : element.binding?.source === "variable"
                  ? ` data-bind-variable="${escapeHtml(element.binding.path)}"${bindingKind}`
                  : element.binding?.source === "extra"
                    ? ` data-bind-extra="${escapeHtml(element.binding.path)}"${bindingKind}`
                    : element.binding?.source === "element"
                      ? ` data-bind-element-id="${escapeHtml(element.binding.elementId)}" data-bind-element-property="${escapeHtml(element.binding.property)}"${bindingKind}`
                      : "";
      const bindingAttributes =
        bindingAttributesBase +
        (supportsBinding && element.binding?.objectPath
          ? ` data-bind-object-path="${escapeHtml(element.binding.objectPath)}"`
          : "");
      const itemChoiceAttributes =
        ["checkbox", "radio", "switch"].includes(element.type) &&
          (element.itemLabelPath || element.itemValuePath)
          ? ` data-item-label-path="${escapeHtml(element.itemLabelPath || "")}" data-item-value-path="${escapeHtml(element.itemValuePath || "")}"`
          : "";
      const absoluteAlignment = getAbsoluteLayoutChildAlignment(element);
      const alignmentAttributes = absoluteAlignment
        ? ` data-absolute-layout-child="" data-horizontal-alignment="${absoluteAlignment.horizontal}" data-vertical-alignment="${absoluteAlignment.vertical}"`
        : "";
      const elementAttribute = ` id="${escapeHtml(element.id)}" data-element-id="${escapeHtml(element.id)}"${alignmentAttributes}${element.hidden ? " hidden" : ""}`;
      const actionAttribute = elementAttribute;
      const disabledAttribute = element.disabled ? " disabled" : "";
      if (element.type === "input") {
        const formName = escapeHtml(getFormName(element));
        const inputType = inputTypes.includes(element.inputType)
          ? element.inputType
          : "text";
        const min =
          element.min !== "" && element.min != null
            ? ` min="${escapeHtml(element.min)}"`
            : "";
        const max =
          element.max !== "" && element.max != null
            ? ` max="${escapeHtml(element.max)}"`
            : "";
        return renderExportTemplate("input", {
          indent: TemplateEngine.raw(indent),
          className: TemplateEngine.raw(componentClass("content content-input")),
          inputType,
          formName: TemplateEngine.raw(formName),
          accessibleName: TemplateEngine.raw(
            escapeHtml(contentValue || "حقل إدخال"),
          ),
          content: TemplateEngine.raw(content),
          styles: TemplateEngine.raw(styles),
          elementAttributes: TemplateEngine.raw(elementAttribute),
          bindingAttributes: TemplateEngine.raw(bindingAttributes),
          min: TemplateEngine.raw(min),
          max: TemplateEngine.raw(max),
          disabled: TemplateEngine.raw(disabledAttribute),
        });
      }
      if (element.type === "filePicker") {
        const formName = escapeHtml(getFormName(element));
        const mode =
          element.filePickerMode === "multiple" ? "multiple" : "single";
        const appearance =
          element.filePickerAppearance === "dropzone" ? "dropzone" : "button";
        const appearanceClass =
          appearance === "dropzone" ? " content-file-picker-dropzone" : "";
        return renderExportTemplate("filePicker", {
          indent: TemplateEngine.raw(indent),
          className: TemplateEngine.raw(
            componentClass(`content content-file-picker${appearanceClass}`),
          ),
          mode,
          appearance,
          formName: TemplateEngine.raw(formName),
          accessibleName: TemplateEngine.raw(
            escapeHtml(contentValue || "اختيار ملف"),
          ),
          styles: TemplateEngine.raw(styles),
          elementAttributes: TemplateEngine.raw(elementAttribute),
          bindingAttributes: TemplateEngine.raw(bindingAttributes),
          disabled: TemplateEngine.raw(disabledAttribute),
          content: TemplateEngine.raw(content),
        });
      }
      if (element.type === "image") {
        const asset = getAsset(element.assetId);
        const imageUrl = asset
          ? assetUrlFor(asset)
          : safeImageUrl(element.imageUrl);
        const source = imageUrl ? ` src="${escapeHtml(imageUrl)}"` : "";
        const imageClass = imageUrl
          ? "content content-image"
          : "content content-image preview-image-empty";
        return renderExportTemplate("image", {
          indent: TemplateEngine.raw(indent),
          className: TemplateEngine.raw(componentClass(imageClass)),
          source: TemplateEngine.raw(source),
          alt: TemplateEngine.raw(escapeHtml(contentValue)),
          styles: TemplateEngine.raw(styles),
          fit: element.imageFit === "contain" ? "contain" : "cover",
          elementAttributes: TemplateEngine.raw(elementAttribute),
        });
      }
      if (element.type === "icon") {
        const iconClass = /^fa-[a-z0-9-]+$/.test(element.iconClass)
          ? element.iconClass
          : "fa-star";
        return `${indent}<span class="${componentClass("content content-icon")}" style="${styles}" aria-label="${escapeHtml(contentValue || "أيقونة")}"${elementAttribute}><i class="fa-solid ${iconClass}" aria-hidden="true"></i></span>`;
      }
      if (element.type === "sheet") {
        const children = state.elements
          .filter(
            (child) =>
              child.pageId === element.pageId && child.parentId === element.id,
          )
          .map((child) => renderElement(child, depth + 4))
          .join("\n");
        return `${indent}<section class="${componentClass("content content-sheet")}" data-sheet-id="${escapeHtml(element.id)}" data-sheet-page="${escapeHtml(element.pageId)}" role="dialog" aria-modal="true" aria-label="${escapeHtml(contentValue || "Sheet")}" dir="${state.settings.appLanguage === "ar" ? "rtl" : "ltr"}" hidden style="${styles}"${elementAttribute}>\n${indent}  <div class="content-sheet-toolbar"><button type="button" class="content-sheet-close" data-sheet-close aria-label="إغلاق">×</button></div>\n${children}\n${indent}</section>`;
      }
      if (element.type === "tabs") {
        const tabs = state.elements.filter(
          (child) =>
            child.pageId === element.pageId &&
            child.parentId === element.id &&
            child.type === "tab" &&
            !child.hidden,
        );
        const activeTabId = tabs.some((tab) => tab.id === element.activeTabId)
          ? element.activeTabId
          : tabs[0]?.id || "";
        const tabButtons = tabs
          .map((tab, index) => {
            const tabTitle = escapeHtml(
              getLocalizedContent(tab, state.settings.appLanguage) ||
              `Tab ${index + 1}`,
            );
            const selected = tab.id === activeTabId;
            return `${indent}    <button type="button" class="content-tab-button" id="tab-trigger-${escapeHtml(tab.id)}" role="tab" data-tab-target="${escapeHtml(tab.id)}" aria-controls="${escapeHtml(tab.id)}" aria-selected="${selected}" tabindex="${selected ? 0 : -1}"><span data-localize-content>${tabTitle}</span></button>`;
          })
          .join("\n");
        const panels = tabs
          .map((tab) => renderElement(tab, depth + 4))
          .join("\n");
        return `${indent}<section class="${componentClass("content content-tabs")}" aria-label="${escapeHtml(contentValue || (state.settings.appLanguage === "ar" ? "علامات تبويب" : "Tabs"))}" style="${styles}"${elementAttribute}>\n${indent}  <div class="content-tab-list" role="tablist" aria-label="${escapeHtml(contentValue || (state.settings.appLanguage === "ar" ? "علامات تبويب" : "Tabs"))}">\n${tabButtons}\n${indent}  </div>\n${indent}  <div class="content-tab-panels">\n${panels}\n${indent}  </div>\n${indent}</section>`;
      }
      if (element.type === "tab") {
        const children = state.elements
          .filter(
            (child) =>
              child.pageId === element.pageId && child.parentId === element.id,
          )
          .map((child) => renderElement(child, depth + 4))
          .join("\n");
        const parent = state.elements.find(
          (child) => child.id === element.parentId,
        );
        if (parent?.type === "tabs") {
          const siblings = state.elements.filter(
            (tab) =>
              tab.parentId === parent.id &&
              tab.pageId === parent.pageId &&
              tab.type === "tab" &&
              !tab.hidden,
          );
          const activeTabId = siblings.some(
            (tab) => tab.id === parent.activeTabId,
          )
            ? parent.activeTabId
            : siblings[0]?.id || "";
          const selected = activeTabId === element.id;
          return `${indent}<section class="${componentClass("content content-tab-panel")}" data-tab-panel="${escapeHtml(element.id)}" role="tabpanel" aria-labelledby="tab-trigger-${escapeHtml(element.id)}" tabindex="0"${selected ? "" : " hidden"} style="${styles}"${elementAttribute}><span data-localize-content hidden>${content}</span>${children ? `\n${children}\n${indent}` : ""}</section>`;
        }
        return `${indent}<section class="${componentClass("content content-tab-panel")}" role="region" aria-label="${escapeHtml(contentValue || "Tab")}" style="${styles}"${elementAttribute}><strong data-localize-content>${content}</strong>${children ? `\n${children}\n${indent}` : ""}</section>`;
      }
      if (element.type === "accordion") {
        const children = state.elements
          .filter(
            (child) =>
              child.pageId === element.pageId && child.parentId === element.id,
          )
          .map((child) => renderElement(child, depth + 4))
          .join("\n");
        return `${indent}<details class="${componentClass("content content-accordion")}"${element.accordionOpen ? " open" : ""} style="${styles}"${elementAttribute}>\n${indent}  <summary data-localize-content>${content}</summary>\n${indent}  <div class="content-accordion-panel">${children}</div>\n${indent}</details>`;
      }
      if (element.type === "chip") {
        const variant = getVariantOptions("chip").includes(element.styles.variant)
          ? element.styles.variant
          : getDefaultVariant("chip");
        return `${indent}<button type="button" class="${componentClass(`content content-chip variant-${variant}${element.chipSelected ? " is-selected" : ""}`)}" data-chip-toggle aria-pressed="${element.chipSelected}" data-variant-background="${escapeHtml(getExportElementThemeColor(element, "background"))}" data-variant-color="${escapeHtml(getExportElementThemeColor(element, "color"))}" style="${styles}"${actionAttribute}${bindingAttributes}${disabledAttribute}><span data-localize-content>${content}</span></button>`;
      }
      if (element.type === "button") {
        const iconClass = /^fa-[a-z0-9-]+$/.test(element.iconClass)
          ? element.iconClass
          : "";
        if (iconClass) {
          const label = `<span data-localize-content dir="auto">${content}</span>`;
          const icon = `<i class="fa-solid ${iconClass}" aria-hidden="true"></i>`;
          const variant = getVariantOptions("button").includes(
            element.styles.variant,
          )
            ? element.styles.variant
            : getDefaultVariant("button");
          const appDirection =
            state.settings.appLanguage === "ar" ? "rtl" : "ltr";
          return `${indent}<button type="button" class="${componentClass(`content content-button content-button-has-icon variant-${variant}`)}" data-variant-background="${escapeHtml(getExportElementThemeColor(element, "background"))}" data-variant-color="${escapeHtml(getExportElementThemeColor(element, "color"))}" dir="${appDirection}" style="${styles}"${actionAttribute}${bindingAttributes}${disabledAttribute}>${icon}${label}</button>`;
        }
      }
      if (element.type === "breadcrumbs") {
        return `${indent}<nav class="${componentClass("content content-breadcrumbs")}" aria-label="${state.settings.appLanguage === "ar" ? "مسار التنقل" : "Breadcrumb"}" style="${styles}"${elementAttribute}><span data-localize-content>${content}</span></nav>`;
      }
      if (element.type === "badge") {
        const variant = getVariantOptions("badge").includes(
          element.styles.variant,
        )
          ? element.styles.variant
          : getDefaultVariant("badge");
        return `${indent}<span class="${componentClass(`content content-badge variant-${variant}`)}" style="${styles}"${elementAttribute}><span data-localize-content>${content}</span></span>`;
      }
      if (element.type === "fab") {
        const variantClass = `variant-${getVariantOptions("fab").includes(element.styles.variant) ? element.styles.variant : getDefaultVariant("fab")}`;
        return `${indent}<button type="button" class="${componentClass(`content content-fab ${variantClass}`)}" data-variant-background="${escapeHtml(getExportElementThemeColor(element, "background"))}" data-variant-color="${escapeHtml(getExportElementThemeColor(element, "color"))}" aria-label="${content}" style="${styles}"${actionAttribute}${bindingAttributes}${disabledAttribute}><span data-localize-content>${content}</span></button>`;
      }
      if (element.type === "toast") {
        const toastAttribute = elementAttribute.endsWith(" hidden")
          ? elementAttribute
          : `${elementAttribute} hidden`;
        const variant = getVariantOptions("toast").includes(
          element.styles.variant,
        )
          ? element.styles.variant
          : getDefaultVariant("toast");
        return `${indent}<div class="${componentClass(`content content-toast variant-${variant}`)}" role="status" style="${styles}"${toastAttribute}><span class="content-toast-message" data-localize-content>${content}</span><button type="button" class="content-toast-close" data-toast-close aria-label="${state.settings.appLanguage === "ar" ? "إغلاق الإشعار" : "Dismiss notification"}"${disabledAttribute}>×</button></div>`;
      }
      if (element.type === "loading") {
        return `${indent}<div class="${componentClass("content content-loading")}" role="status" aria-label="${escapeHtml(contentValue || "Loading")}" style="${styles}"${elementAttribute}><span class="content-loading-spinner" aria-hidden="true"></span><span data-localize-content>${content}</span></div>`;
      }
      if (element.type === "progress") {
        const max = clampNumber(element.progressMax, 1, 1000000, 100);
        const value = clampNumber(element.progressValue, 0, max, 0);
        const progressValue =
          element.progressMode === "determinate" ? ` value="${value}"` : "";
        return `${indent}<div class="${componentClass("content content-progress")}" style="${styles}"${elementAttribute}><progress class="content-progress-bar" max="${max}"${progressValue} aria-label="${escapeHtml(contentValue || "Progress")}"></progress><span class="content-progress-label" data-localize-content>${content}</span></div>`;
      }
      if (element.type === "switch") {
        const formName = escapeHtml(getFormName(element));
        const checked = element.checked ? " checked" : "";
        const formValue = escapeHtml(JSON.stringify(element.fieldValue ?? true));
        return `${indent}<div class="${componentClass("content content-switch")}" style="${styles}"${elementAttribute}${bindingAttributes}${itemChoiceAttributes}><label class="control-label content-switch-label"><input type="checkbox" role="switch" name="${formName}" data-form-name="${formName}" data-form-value="${formValue}"${checked}${disabledAttribute}><span data-localize-content>${content}</span></label></div>`;
      }
      if (element.type === "list") {
        const formName = escapeHtml(getFormName(element));
        const source = element.listSource || { type: "static" };
        const multiple = Boolean(element.multiple);
        const optionDefinitions =
          source.type === "static"
            ? normalizeOptions(element.options, !multiple)
            : [];
        const defaultSelectedIndex = multiple
          ? -1
          : optionDefinitions.findIndex((option) => option.selected);
        const options = optionDefinitions
          .map(
            (option, index) =>
              `${indent}      <option value="${index}" data-form-value="${escapeHtml(JSON.stringify(option.value))}"${multiple ? (option.selected ? " selected" : "") : index === defaultSelectedIndex ? " selected" : ""}>${escapeHtml(option.label)}</option>`,
          )
          .join("\n");
        const hasDefaultSelection = defaultSelectedIndex >= 0;
        const multipleAttribute = multiple ? " multiple" : "";
        const placeholder = multiple
          ? ""
          : `${indent}      <option value="" disabled${hasDefaultSelection ? "" : " selected"} data-localize-content>${escapeHtml(contentValue || "اختر عنصراً")}</option>\n`;
        const sourceAttributes =
          source.type === "endpoint"
            ? ` data-list-source="endpoint" data-list-request="${escapeHtml(source.requestId || "")}" data-list-path="${escapeHtml(source.path || "")}"`
            : source.type === "twk"
              ? ` data-list-source="twk" data-list-field="${escapeHtml(source.field || "")}"`
              : ` data-list-source="static"`;
        const itemPaths = ` data-list-label-path="${escapeHtml(source.labelPath ?? "label")}" data-list-value-path="${escapeHtml(source.valuePath ?? "value")}"`;
        const selectStyle = normalizeDimension(element.styles.height)
          ? ' style="height:100%;min-height:0"'
          : "";
        return `${indent}<div class="${componentClass("content content-list")}" style="${styles}"${elementAttribute}>\n${indent}  <select name="${formName}" data-form-name="${formName}" data-list-id="${escapeHtml(element.id)}" aria-label="${escapeHtml(contentValue || "اختر عنصراً")}"${multipleAttribute}${sourceAttributes}${itemPaths}${selectStyle}${disabledAttribute}>\n${placeholder}${options}\n${indent}  </select>\n${indent}</div>`;
      }
      if (element.type === "checkbox") {
        const formName = escapeHtml(getFormName(element));
        const formValue = escapeHtml(
          JSON.stringify(
            element.fieldValue === undefined ? true : element.fieldValue,
          ),
        );
        const checked = element.checked ? " checked" : "";
        return `${indent}<div class="${componentClass("content content-checkbox")}" style="${styles}"${elementAttribute}${bindingAttributes}${itemChoiceAttributes}>\n${indent}  <label class="control-label"><input type="checkbox" name="${formName}" data-form-name="${formName}" data-form-value="${formValue}"${checked}${disabledAttribute}><span data-localize-content>${content}</span></label>\n${indent}</div>`;
      }
      if (element.type === "radio") {
        const formName = escapeHtml(getFormName(element));
        const radioOptions =
          element.itemLabelPath || element.itemValuePath
            ? [
              {
                label: contentValue,
                value: null,
              },
            ]
            : normalizeOptions(element.options, true);
        const selectedIndex = radioOptions.findIndex(
          (option) => option.selected,
        );
        const options = radioOptions
          .map(
            (option, index) =>
              `${indent}  <label class="control-label"><input type="radio" name="${formName}" data-form-name="${formName}" data-form-value="${escapeHtml(JSON.stringify(option.value))}"${index === selectedIndex ? " checked" : ""}${disabledAttribute}><span>${escapeHtml(option.label)}</span></label>`,
          )
          .join("\n");
        return `${indent}<div class="${componentClass("content content-radio")}" role="group" aria-label="${escapeHtml(contentValue || "اختيار مفرد")}" style="${styles}"${elementAttribute}${bindingAttributes}${itemChoiceAttributes}>\n${options}\n${indent}</div>`;
      }
      if (element.type === "card") {
        const header = element.cardHeader
          ? `<strong class="card-header">${escapeHtml(element.cardHeader)}</strong>`
          : "";
        const cardChildren = state.elements.filter(
          (child) =>
            child.pageId === element.pageId && child.parentId === element.id,
        );
        const bodyChildren = cardChildren
          .filter((child) => child.cardSlot !== "footer")
          .map((child) => renderElement(child, depth + 4))
          .join("\n");
        const footerChildren = cardChildren
          .filter((child) => child.cardSlot === "footer")
          .map((child) => renderElement(child, depth + 4))
          .join("\n");
        const body = `${indent}  <div class="card-body"><span class="card-text" data-localize-content>${content}</span>${bodyChildren ? `\n${bodyChildren}\n${indent}  ` : ""}</div>`;
        const footer =
          element.cardFooter || footerChildren
            ? `${indent}  <div class="card-footer">${element.cardFooter ? `<span>${escapeHtml(element.cardFooter)}</span>` : ""}${footerChildren ? `\n${footerChildren}\n${indent}  ` : ""}</div>`
            : "";
        return `${indent}<div class="${componentClass("content content-card")}" style="${styles}"${elementAttribute}>${header ? `\n${indent}  ${header}` : ""}\n${body}${footer ? `\n${footer}` : ""}\n${indent}</div>`;
      }
      if (element.type === "collection") {
        const source = element.listSource || { type: "static" };
        const layout = element.layout || {};
        const alignItems =
          {
            start: "flex-start",
            center: "center",
            end: "flex-end",
            stretch: "stretch",
          }[layout.align] || "stretch";
        const justifyContent =
          {
            start: "flex-start",
            center: "center",
            end: "flex-end",
            "space-between": "space-between",
          }[layout.justify] || "flex-start";
        const itemsStyle = `display:flex;flex-direction:${layout.direction === "row" ? "row" : "column"};flex-wrap:nowrap;align-items:${alignItems};justify-content:${justifyContent};gap:${clampNumber(layout.gap, 0, 48, 8)}px`;
        const sourceAttributes =
          source.type === "endpoint"
            ? ` data-collection-source="endpoint" data-collection-request="${escapeHtml(source.requestId || "")}" data-collection-path="${escapeHtml(source.path || "")}"`
            : source.type === "twk"
              ? ` data-collection-source="twk" data-collection-field="${escapeHtml(source.field || "")}"`
              : ` data-collection-source="static"`;
        const children = state.elements
          .filter(
            (child) =>
              child.pageId === element.pageId && child.parentId === element.id,
          )
          .map((child) => renderElement(child, depth + 4))
          .join("\n");
        return `${indent}<section class="${componentClass("content content-collection")}" data-collection-id="${escapeHtml(element.id)}"${sourceAttributes} style="${styles}"${elementAttribute}>\n${indent}  <div class="content-collection-items" style="${itemsStyle}"></div>\n${indent}  <template data-collection-template="${escapeHtml(element.id)}">\n${children || `${indent}    <div class="content">أضف عناصر إلى قالب القائمة</div>`}\n${indent}  </template>\n${indent}</section>`;
      }
      if (
        element.type === "layout" ||
        element.type === "absoluteLayout" ||
        element.type === "grid" ||
        element.type === "scrollView"
      ) {
        const config = element.layout || {
          direction: "column",
          align: "stretch",
          justify: "start",
          gap: 8,
          columns: 2,
        };
        const alignItems =
          {
            start: "flex-start",
            center: "center",
            end: "flex-end",
            stretch: "stretch",
          }[config.align] || "stretch";
        const justifyContent =
          {
            start: "flex-start",
            center: "center",
            end: "flex-end",
            "space-between": "space-between",
          }[config.justify] || "flex-start";
        const children = state.elements
          .filter(
            (child) =>
              child.pageId === element.pageId && child.parentId === element.id,
          )
          .map((child) => renderElement(child, depth + 4))
          .join("\n");
        const title = getLocalizedContent(element, state.settings.appLanguage)
          ? `${indent}  <strong class="layout-title" data-localize-content>${content}</strong>\n`
          : "";
        if (element.type === "absoluteLayout") {
          return `${indent}<section class="${componentClass("content content-layout content-absolute-layout")}" aria-label="${escapeHtml(element.content || "Absolute Layout")}" style="${styles};position:relative" data-element-id="${escapeHtml(element.id)}"${element.hidden ? " hidden" : ""}>\n${title}${indent}  <div class="content-absolute-layout-children">\n${children || `${indent}    <!-- Add elements to this absolute layout in the editor -->`}\n${indent}  </div>\n${indent}</section>`;
        }
        if (element.type === "scrollView") {
          const axis = ["vertical", "horizontal", "both"].includes(
            element.scroll?.axis,
          )
            ? element.scroll.axis
            : "vertical";
          const height = clampNumber(element.scroll?.height, 0, 100, 100);
          const overflowX = ["horizontal", "both"].includes(axis)
            ? "auto"
            : "hidden";
          const overflowY = ["vertical", "both"].includes(axis)
            ? "auto"
            : "hidden";
          const flexWrap =
            axis === "vertical" && config.direction === "row" ? "wrap" : "nowrap";
          const width = axis === "horizontal" ? "width:max-content;" : "";
          return `${indent}<section class="${componentClass("content content-layout content-scroll-view")}" aria-label="${escapeHtml(contentValue || "منطقة تمرير")}" style="${styles};height:${normalizeDimension(element.styles.height) || `${height}%`};min-height:0;flex-shrink:0;overflow-x:${overflowX};overflow-y:${overflowY}"${elementAttribute}>\n${title}${indent}  <div class="content-layout-children content-scroll-view-children" style="display:flex;${width}flex-direction:${config.direction === "row" || axis === "horizontal" ? "row" : "column"};flex-wrap:${flexWrap};align-items:${alignItems};justify-content:${justifyContent};gap:${clampNumber(config.gap, 0, 48, 8)}px">\n${children || `${indent}    <!-- اسحب عناصر إلى هذه المنطقة في المحرر -->`}\n${indent}  </div>\n${indent}</section>`;
        }
        const grid = element.type === "grid";
        return `${indent}<section class="${componentClass(`content content-layout${grid ? " content-grid" : ""}`)}" aria-label="${escapeHtml(element.content || (grid ? "شبكة" : "مجموعة تخطيط"))}" style="${styles}"${elementAttribute}>\n${title}${indent}  <div class="content-layout-children${grid ? " content-grid-children" : ""}" style="display:${grid ? "grid" : "flex"};${grid ? `grid-template-columns:repeat(${clampNumber(config.columns, 1, 12, 2)},minmax(0,1fr));`         : `flex-direction:${config.direction === "row" ? "row" : "column"};flex-wrap:nowrap;`}align-items:${alignItems};justify-content:${justifyContent};gap:${clampNumber(config.gap, 0, 48, 8)}px">\n${children || `${indent}    <!-- اسحب العناصر إلى ${grid ? "الشبكة" : "المجموعة"} في المحرر -->`}\n${indent}  </div>\n${indent}</section>`;
      }
      if (element.type === "divider")
        return `${indent}<hr class="${componentClass("content content-divider")}" style="${styles}"${elementAttribute}>`;
      if (element.type === "custom") {
        const component = state.userComponents.find(
          (item) => item.id === element.customComponentId,
        );
        const customClass = component
          ? ` ${customComponentClass(component.id)}`
          : "";
        const plugin = component ? getPluginDefinition(component) : null;
        const pluginAttributes = plugin
          ? ` aria-label="${escapeHtml(plugin.title)}" data-plugin-id="${escapeHtml(plugin.id)}" data-plugin-properties="${escapeHtml(JSON.stringify(normalizePluginProperties(plugin, element.pluginProperties)))}"`
          : "";
        const customMarkup = plugin
          ? ""
          : component
            ? safeCustomHtml(component.html)
            : "";
        const children = plugin?.acceptsChildren
          ? state.elements
              .filter(
                (child) =>
                  child.pageId === element.pageId &&
                  child.parentId === element.id,
              )
              .map((child) => renderElement(child, depth + 4))
              .join("\n")
          : "";
        return `${indent}<div class="${componentClass("content content-custom")}${customClass}" style="${styles}"${elementAttribute}${bindingAttributes}${pluginAttributes}>${customMarkup}${children ? `\n${children}\n${indent}` : ""}</div>`;
      }
      const variantClass = hasButtonVariant
        ? ` variant-${getVariantOptions(element.type).includes(element.styles.variant) ? element.styles.variant : getDefaultVariant(element.type)}`
        : "";
      const variantAttributes = hasButtonVariant
        ? ` data-variant-background="${escapeHtml(getExportElementThemeColor(element, "background"))}" data-variant-color="${escapeHtml(getExportElementThemeColor(element, "color"))}"`
        : "";
      return `${indent}<${tag} class="${componentClass(`content content-${element.type}${variantClass}`)}"${variantAttributes} style="${styles}"${hasButtonVariant ? ' type="button"' : ""}${element.type === "button" || element.type === "fab" ? actionAttribute : elementAttribute}${bindingAttributes}${hasButtonVariant ? disabledAttribute : ""}><span data-localize-content>${content}</span></${tag}>`;
    };
 
    const pageMarkup = state.pages
      .map((page) => {
        const pageElements = state.elements.filter(
          (element) => element.pageId === page.id,
        );
        const blocks = pageElements
          .filter(
            (element) =>
              element.type !== "sheet" &&
              !pageElements.some(
                (candidate) => candidate.id === element.parentId,
              ),
          )
          .map((element) => renderElement(element))
          .join("\n");
        const statusMarkup =
          page.kind === "error"
            ? state.settings.appShowErrorMessage !== false
              ? `  <p class="app-runtime-message" id="runtime-error-message" role="alert">${state.settings.appLanguage === "ar" ? "تعذر تنفيذ الإجراء." : "The action could not be completed."}</p>\n`
              : ""
            : page.kind === "splash"
              ? state.settings.appApiProgressLabel === true
                ? `  <p class="app-runtime-message app-splash-indicator">${state.settings.appLanguage === "ar" ? "جارٍ بدء التطبيق..." : "Starting app..."}</p>\n`
                : ""
              : "";
        const initialPage =
          state.pages.find((item) => item.kind === "splash") ||
          state.pages.find((item) => item.kind === "page");
        return `  <section class="app-page app-page-${page.kind}" data-app-page="${escapeHtml(page.id)}"${page.id === initialPage?.id ? "" : " hidden"}>\n${statusMarkup}${blocks || ""}\n  </section>`;
      })
      .join("\n");

    const appLogoAsset =
      state.settings.appTopBarType === "standard"
        ? getAsset(state.settings.appLogoAssetId)
        : null;
    const appLogoMarkup =
      appLogoAsset?.type.startsWith("image/")
        ? `<img class="app-logo" src="${escapeHtml(assetUrlFor(appLogoAsset))}" alt="">`
        : "";
    const headerMarkup = `<header class="app-header">
      ${state.settings.appTopBarType === "none"
        ? ""
        : `
      ${appLogoMarkup}
      <span><strong>${escapeHtml(resolveLocalizedContent(state.settings.titleLocalizations, state.settings.appLanguage, state.settings.title))}</strong><small>${escapeHtml(resolveLocalizedContent(state.settings.organizationLocalizations, state.settings.appLanguage, state.settings.orgnization))}</small></span>`
      }
    </header>`;
    const direction = state.settings.appLanguage === "ar" ? "rtl" : "ltr";
    const sheetMarkup = state.elements
      .filter(
        (element) => element.type === "sheet" && !isInsideCollection(element),
      )
      .map((element) => renderElement(element))
      .join("\n");

    return `<main class="embedded-app" dir="${direction}" lang="${state.settings.appLanguage}">
      ${headerMarkup}
      ${pageMarkup}
      <div class="app-api-progress" id="app-api-progress" role="status" aria-live="polite" aria-label="${state.settings.appLanguage === "ar" ? "جارٍ تحميل البيانات" : "Loading data"}" hidden>
        <span class="app-api-progress-indicator" aria-hidden="true"></span>
        ${state.settings.appApiProgressLabel === true ? `<span class="app-api-progress-label">${state.settings.appLanguage === "ar" ? "جارٍ تحميل البيانات" : "Loading data"}</span>` : ""}
      </div>
    </main>
    <div class="app-sheet-portal" dir="${direction}"  style="display:contents">
      ${sheetMarkup}
      <button class="app-sheet-backdrop" data-sheet-backdrop hidden aria-label="إغلاق النافذة"></button>
    </div>
  <dialog class="app-message-dialog" id="app-message-dialog" aria-labelledby="app-message-title">
    <div class="app-message-dialog-content">
      <h2 id="app-message-title"></h2>
      <p id="app-message-content"></p>
      <button type="button" id="app-message-close">${state.settings.appLanguage === "ar" ? "إغلاق" : "Close"}</button>
    </div>
  </dialog>`;
  }

  return buildMarkup;
}
