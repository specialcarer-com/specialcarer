import Link from "next/link";
import { getTranslations } from "next-intl/server";

type TabKey = "visiting" | "live-in" | "browse";

const TABS: { key: TabKey; labelKey: string; href: string }[] = [
  { key: "visiting", labelKey: "tabVisiting", href: "/book/visiting" },
  { key: "live-in", labelKey: "tabLiveIn", href: "/book/live-in" },
  { key: "browse", labelKey: "tabBrowse", href: "/find-care" },
];

export async function BookingTypeTabs({ current }: { current: TabKey }) {
  const t = await getTranslations("booking");
  return (
    <nav
      aria-label="Booking type"
      className="mb-6 flex justify-start sm:justify-end overflow-x-auto -mx-1 px-1"
    >
      <ul className="inline-flex items-center gap-1 rounded-full bg-slate-100 p-1 whitespace-nowrap">
        {TABS.map((tab) => {
          const active = tab.key === current;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "inline-flex items-center rounded-full px-3 sm:px-4 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60",
                ].join(" ")}
              >
                {t(tab.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
