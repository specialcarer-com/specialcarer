import type { AppLocale } from "./config";

export type MessageTree = { [key: string]: string | MessageTree };

/**
 * Load the raw message tree for a locale. Kept as a switch (not a dynamic
 * template path) so the bundler can statically resolve each JSON file.
 */
export async function loadMessages(locale: AppLocale): Promise<MessageTree> {
  switch (locale) {
    case "en-US":
      return (await import("../../messages/en-US.json")).default as MessageTree;
    case "es":
      return (await import("../../messages/es.json")).default as MessageTree;
    case "pl":
      return (await import("../../messages/pl.json")).default as MessageTree;
    case "ur":
      return (await import("../../messages/ur.json")).default as MessageTree;
    case "ro":
      return (await import("../../messages/ro.json")).default as MessageTree;
    case "bn":
      return (await import("../../messages/bn.json")).default as MessageTree;
    case "de":
      return (await import("../../messages/de.json")).default as MessageTree;
    case "fr":
      return (await import("../../messages/fr.json")).default as MessageTree;
    case "en-GB":
    default:
      return (await import("../../messages/en-GB.json")).default as MessageTree;
  }
}

/**
 * Deep-merge two message trees, with `override` winning at the leaf level.
 * Used to layer a locale on top of the en-GB source so a key missing from
 * es/ur falls back to English instead of rendering the raw key path.
 */
export function deepMerge(base: MessageTree, override: MessageTree): MessageTree {
  const out: MessageTree = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    if (
      value &&
      typeof value === "object" &&
      existing &&
      typeof existing === "object"
    ) {
      out[key] = deepMerge(existing, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
