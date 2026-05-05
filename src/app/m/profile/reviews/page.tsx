"use client";

import { TopBar, Avatar, Stars } from "../../_components/ui";
import { CAREGIVERS } from "../../_lib/mock";

export default function MyReviewsPage() {
  const carer = CAREGIVERS[0];
  const reviews = carer.reviews;
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / Math.max(1, reviews.length);

  return (
    <div className="min-h-screen bg-bg-screen pb-8">
      <TopBar title="My reviews" back="/m/profile" />

      <div className="px-5 pt-2">
        <div className="rounded-card bg-white p-5 text-center shadow-card">
          <p className="text-[40px] font-bold leading-none text-heading">
            {avg.toFixed(1)}
          </p>
          <div className="mt-2 flex justify-center">
            <Stars value={avg} />
          </div>
          <p className="mt-2 text-[12px] text-subheading">
            Based on {reviews.length} reviews
          </p>
        </div>
      </div>

      <ul className="mt-5 flex flex-col gap-3 px-5">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-card bg-white p-4 shadow-card">
            <div className="flex items-start gap-3">
              <Avatar src={r.avatar} name={r.author} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[14px] font-semibold text-heading">
                    {r.author}
                  </p>
                  <span className="shrink-0 text-[11px] text-subheading">{r.when}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <Stars value={r.rating} size={12} />
                  <span className="text-[11px] text-subheading">{r.service}</span>
                </div>
                <p className="mt-2 text-[13.5px] leading-snug text-heading">
                  {r.text}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
