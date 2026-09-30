/**
 * Versioned MSA + DPA template registry. Markdown is bundled at build time
 * (npm run contracts:sync / contracts:check), not read from a runtime disk.
 * Versions are immutable — add a new version and bump CURRENT_*_VERSION.
 */

import "server-only";
export { getContractMarkdown } from "./registry";

export const CURRENT_MSA_VERSION = "msa-v1.1-2026-08";
export const CURRENT_DPA_VERSION = "dpa-v1.0-2026-05";
export const CURRENT_WORKER_B_VERSION = "wkr-v1.0-2026-05";

export type ContractVersion =
  | typeof CURRENT_MSA_VERSION
  | typeof CURRENT_DPA_VERSION
  | typeof CURRENT_WORKER_B_VERSION
  | (string & { readonly __brand?: "ContractVersion" });

export type ContractType = "msa" | "dpa" | "worker_b";

export function inferContractType(version: string): ContractType | null {
  if (version.startsWith("msa-")) return "msa";
  if (version.startsWith("dpa-")) return "dpa";
  if (version.startsWith("wkr-")) return "worker_b";
  return null;
}

export const CONTRACT_LABELS: Record<ContractType, string> = {
  msa: "Master Services Agreement",
  dpa: "Data Processing Addendum",
  worker_b: "Limb (b) Worker Agreement",
};
