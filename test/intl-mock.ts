// A small stand-in for next-intl in component tests: it resolves real keys
// from messages/en.json and substitutes {placeholders}. Missing keys throw so
// tests catch copy that is not in the catalog.
import messages from "@/messages/en.json";

function lookup(path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (value, part) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[part]
          : undefined,
      messages,
    );
}

export function translations(namespace?: string) {
  return (key: string, values: Record<string, string | number> = {}) => {
    const message = lookup(namespace ? `${namespace}.${key}` : key);
    if (typeof message !== "string") {
      throw new Error(`Missing message: ${namespace}.${key}`);
    }
    return message.replace(/\{(\w+)\}/g, (_, name: string) =>
      String(values[name] ?? `{${name}}`),
    );
  };
}

export const intlMock = {
  useTranslations: translations,
  useLocale: () => "en",
};
