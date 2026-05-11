/**
 * Versioned MSA + DPA template registry. The markdown files live next
 * to this module and are loaded synchronously at boot via Node's
 * `fs.readFileSync`. Versions are immutable — to amend a contract,
 * add a new version and bump CURRENT_*_VERSION in this file.
 */

import "server-only";
import fs from "node:fs";
import path from "node:path";

export const CURRENT_MSA_VERSION = "msa-v1.0-2026-05";
export const CURRENT_DPA_VERSION = "dpa-v1.0-2026-05";
export const CURRENT_WORKER_B_VERSION = "wkr-v1.0-2026-05";

export type ContractVersion =
  | typeof CURRENT_MSA_VERSION
  | typeof CURRENT_DPA_VERSION
  | typeof CURRENT_WORKER_B_VERSION
  | (string & { readonly __brand?: "ContractVersion" });

export type ContractType = "msa" | "dpa" | "worker_b";

const CONTRACTS_DIR = path.join(process.cwd(), "src", "contracts");

// In-memory cache so we don't hit disk per request.
const cache = new Map<string, string>();

export function getContractMarkdown(version: string): string {
  if (cache.has(version)) return cache.get(version) as string;
  // Defence in depth: only allow plain version slugs (msa-/dpa-…).
  if (!/^[a-z]{3}-v[0-9.]+-\d{4}-\d{2}$/.test(version)) {
    throw new Error(`Invalid contract version: ${version}`);
  }
  const fullPath = path.join(CONTRACTS_DIR, `${version}.md`);
  const md = fs.readFileSync(fullPath, "utf8");
  cache.set(version, md);
  return md;
}

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
