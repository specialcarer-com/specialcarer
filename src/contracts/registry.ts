import { CONTRACT_MARKDOWN } from "./markdown.generated";

/** Immutable, bundled contract data; safe in Workers without a local filesystem. */
export function getContractMarkdown(version: string): string {
  if (!/^[a-z]{3}-v[0-9.]+-\d{4}-\d{2}$/.test(version)) {
    throw new Error(`Invalid contract version: ${version}`);
  }
  if (!Object.hasOwn(CONTRACT_MARKDOWN, version)) {
    throw new Error(`Unknown contract version: ${version}`);
  }
  return CONTRACT_MARKDOWN[version];
}
