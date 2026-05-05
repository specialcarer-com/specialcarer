"use client";

import { useState } from "react";
import { TopBar, Toggle, Button, IconPlus, IconTrash } from "../../_components/ui";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type Day = (typeof DAYS)[number];

type DayState = { active: boolean; slots: string[] };

export default function AvailabilityPage() {
  const [state, setState] = useState<Record<Day, DayState>>(() => {
    const init: Record<Day, DayState> = {} as Record<Day, DayState>;
    for (const d of DAYS) {
      init[d] = {
        active: d !== "Sunday",
        slots: d === "Saturday" ? ["10:00 AM - 12:00 PM"] : ["10:00 AM - 12:00 PM", "3:00 PM - 6:00 PM"],
      };
    }
    return init;
  });
  const [saved, setSaved] = useState(false);

  function toggleDay(d: Day, active: boolean) {
    setState((s) => ({ ...s, [d]: { ...s[d], active } }));
  }

  function addSlot(d: Day) {
    setState((s) => ({
      ...s,
      [d]: { ...s[d], slots: [...s[d].slots, "9:00 AM - 12:00 PM"] },
    }));
  }

  function updateSlot(d: Day, i: number, v: string) {
    setState((s) => {
      const next = [...s[d].slots];
      next[i] = v;
      return { ...s, [d]: { ...s[d], slots: next } };
    });
  }

  function removeSlot(d: Day, i: number) {
    setState((s) => ({
      ...s,
      [d]: { ...s[d], slots: s[d].slots.filter((_, idx) => idx !== i) },
    }));
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-28">
      <TopBar title="Availability" back="/m/profile" />

      <ul className="mt-2 flex flex-col gap-3 px-5">
        {DAYS.map((d) => {
          const s = state[d];
          return (
            <li key={d} className="rounded-card bg-white p-4 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-bold text-heading">{d}</p>
                <Toggle checked={s.active} onChange={(v) => toggleDay(d, v)} />
              </div>
              {s.active && (
                <div className="mt-3 flex flex-col gap-2">
                  {s.slots.map((slot, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2"
                    >
                      <input
                        value={slot}
                        onChange={(e) => updateSlot(d, i, e.target.value)}
                        className="flex-1 bg-transparent text-[13.5px] text-heading focus:outline-none"
                      />
                      <button
                        onClick={() => removeSlot(d, i)}
                        className="grid h-7 w-7 place-items-center rounded-full bg-white text-subheading"
                        aria-label="Remove slot"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addSlot(d)}
                    className="inline-flex items-center gap-1 self-start rounded-pill bg-primary-50 px-3 py-1.5 text-[12.5px] font-semibold text-primary"
                  >
                    <IconPlus /> Add time
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
        <Button block onClick={() => setSaved(true)}>
          {saved ? "Saved" : "Save availability"}
        </Button>
      </div>
    </div>
  );
}
