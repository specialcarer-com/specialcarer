import { CARE_TIPS } from "@/content/care-tips";
import type { CareTipsSource } from "./types";

/**
 * Reads tips from the in-repo TS constant. The widget treats sources as
 * async so a future `supabaseCareTipsSource` is a 1-file swap.
 */
export const staticCareTipsSource: CareTipsSource = {
  getAll: () => CARE_TIPS,
};

/** The default source — change this line when swapping to Supabase. */
export const defaultCareTipsSource: CareTipsSource = staticCareTipsSource;
