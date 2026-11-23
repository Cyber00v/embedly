export function normalizeLocalizedContent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, content]) => typeof content === "string",
    ),
  );
}
 
export function resolveLocalizedContent(
  localizations: Record<string, unknown> | null | undefined,
  language: string,
  fallback: string,
) {
  const localizedContent = localizations?.[language];
  if (typeof localizedContent === "string") return localizedContent;

  const firstLocalizedContent = localizations
    ? Object.values(localizations).find(
        (content): content is string => typeof content === "string",
      )
    : undefined;
  return firstLocalizedContent ?? fallback;
}
