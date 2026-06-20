/**
 * Pure logic for picking which wizard step a returning carer should resume at.
 * Extracted from WizardClient so it can be exercised in unit tests without
 * mounting React.
 */
import type { ProfileReadiness } from "@/lib/care/profile";

export type WizardSnapshot = {
  display_name: string;
};

export function pickInitialStep(
  initial: WizardSnapshot,
  readiness: ProfileReadiness,
): number {
  if (!initial.display_name.trim() || !readiness.hasBio) return 1;
  if (!readiness.hasService) return 2;
  if (!readiness.hasRate || !readiness.hasLocation) return 3;
  if (!readiness.bgChecksCleared) return 4;
  return 5;
}
