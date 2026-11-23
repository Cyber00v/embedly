const SAFE_HTML = Symbol("safeHtml");
const TOKEN_PATTERN =
  /{{{\s*([\w.-]+)\s*}}}|{{>\s*([\w.-]+)\s*}}|{{\s*([\w.-]+)\s*}}/g;

type SafeHtml = {
  readonly [SAFE_HTML]: true;
  readonly value: string;
};

function isSafeHtml(value: unknown): value is SafeHtml {
  return (
    typeof value === "object" &&
    value !== null &&
    SAFE_HTML in value &&
    value[SAFE_HTML] === true
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function escapeHtml(value: string | number | boolean) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function raw(value: string) {
  return Object.freeze({
    [SAFE_HTML]: true,
    value: String(value),
  });
}
 
function resolveValue(
  context: Record<string, unknown>,
  path: string,
): string | number | boolean | SafeHtml {
  let value: unknown = context;
  for (const part of path.split(".")) {
    if (
      !isRecord(value) ||
      !Object.prototype.hasOwnProperty.call(value, part)
    )
      throw new Error(`Missing template value "${path}".`);
    value = value[part];
  }
  if (value === undefined)
    throw new Error(`Template value "${path}" is undefined.`);
  if (value === null) return "";
  if (
    typeof value === "object" &&
    !isSafeHtml(value)
  )
    throw new Error(`Template value "${path}" must be a scalar.`);
  return value as string | number | boolean | SafeHtml;
}

function render(
  template: string,
  context: Record<string, unknown>,
  partials: Record<string, string> = {},
  partialStack: string[] = [],
): string {
  if (typeof template !== "string")
    throw new TypeError("Template source must be a string.");
  if (!context || typeof context !== "object")
    throw new TypeError("Template context must be an object.");
  if (!partials || typeof partials !== "object")
    throw new TypeError("Template partials must be an object.");

  TOKEN_PATTERN.lastIndex = 0;
  if (/{{|}}/.test(template.replace(TOKEN_PATTERN, "")))
    throw new Error("Template contains an invalid expression.");

  TOKEN_PATTERN.lastIndex = 0;
  const output = template.replace(
    TOKEN_PATTERN,
    (_token, rawPath: string, partialName: string, escapedPath: string) => {
      if (partialName) {
        if (!Object.prototype.hasOwnProperty.call(partials, partialName))
          throw new Error(`Unknown template partial "${partialName}".`);
        if (partialStack.includes(partialName))
          throw new Error(
            `Circular template partial: ${[...partialStack, partialName].join(" -> ")}.`,
          );
        return render(partials[partialName], context, partials, [
          ...partialStack,
          partialName,
        ]);
      }

      const path = rawPath || escapedPath;
      const value = resolveValue(context, path);
      if (rawPath) {
        if (!isSafeHtml(value))
          throw new Error(
            `Raw template value "${path}" must be marked with TemplateEngine.raw().`,
          );
        return value.value;
      }
      return escapeHtml(isSafeHtml(value) ? value.value : value);
    },
  );
  return output;
}

export const TemplateEngine = Object.freeze({ escapeHtml, raw, render });
