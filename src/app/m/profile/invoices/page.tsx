"use client";

import { TopBar, Tag, IconChevronRight } from "../../_components/ui";

type Invoice = {
  id: string;
  number: string;
  date: string;
  amountGbp: number;
  status: "Paid" | "Pending" | "Failed";
  description: string;
};

const INVOICES: Invoice[] = [
  { id: "inv_001", number: "SC-2025-0042", date: "21 Apr 2025", amountGbp: 88.0, status: "Paid", description: "Booking with Aisha Patel · 4 hrs" },
  { id: "inv_002", number: "SC-2025-0039", date: "14 Apr 2025", amountGbp: 132.0, status: "Paid", description: "Booking with Marcus Reid · 6 hrs" },
  { id: "inv_003", number: "SC-2025-0036", date: "07 Apr 2025", amountGbp: 44.0, status: "Pending", description: "Booking with Grace Owens · 2 hrs" },
  { id: "inv_004", number: "SC-2025-0029", date: "24 Mar 2025", amountGbp: 176.0, status: "Paid", description: "Booking with Olivia Reyes · 8 hrs" },
];

export default function InvoicesPage() {
  return (
    <div className="min-h-screen bg-bg-screen pb-8">
      <TopBar title="Invoices" back="/m/profile" />

      <ul className="mt-2 flex flex-col gap-3 px-5">
        {INVOICES.map((inv) => (
          <li
            key={inv.id}
            className="flex items-center gap-3 rounded-card bg-white p-4 shadow-card"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[14.5px] font-bold text-heading">{inv.number}</p>
                <Tag
                  tone={
                    inv.status === "Paid"
                      ? "green"
                      : inv.status === "Pending"
                      ? "amber"
                      : "red"
                  }
                >
                  {inv.status}
                </Tag>
              </div>
              <p className="mt-1 text-[12.5px] text-subheading line-clamp-1">
                {inv.description}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11.5px] text-subheading">{inv.date}</span>
                <span className="text-[15px] font-bold text-heading">
                  £{inv.amountGbp.toFixed(2)}
                </span>
              </div>
            </div>
            <IconChevronRight />
          </li>
        ))}
      </ul>

      <p className="mt-6 px-5 text-center text-[11.5px] text-subheading">
        Need a copy? Contact <a className="text-primary" href="mailto:billing@specialcarer.com">billing@specialcarer.com</a>
      </p>
    </div>
  );
}
