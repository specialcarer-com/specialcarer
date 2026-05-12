import type { ServiceType } from "@/lib/ai/types";

/**
 * Audience determines which user role sees a tip. `both` means the tip is
 * generic enough to surface for seekers and caregivers.
 */
export type TipAudience = "seeker" | "caregiver" | "both";

export type CareTip = {
  id: string;
  title: string;
  body: string;
  audience: TipAudience;
  /** Verticals this tip applies to. Empty array = applies to all verticals. */
  verticals: ServiceType[];
  /** 1-12. Empty array = year-round. */
  months: number[];
  tags: string[];
};

/**
 * Strategy interface for tip sources. The widget calls only `getAll()` —
 * any filtering (audience, month, vertical) happens in selection logic, so
 * a future Supabase-backed source can be a 1-file drop-in.
 */
export interface CareTipsSource {
  getAll(): Promise<CareTip[]> | CareTip[];
}
