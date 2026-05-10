import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { groupedSlots, type PageBannerSlot } from "@/lib/page-banners/registry";
import PageBannerRow from "./PageBannerRow";

export const dynamic = "force-dynamic";

type Row = {
  page_key: string;
  media_url: string;
  media_kind: "image" | "video";
  alt: string | null;
  focal_x: number;
  focal_y: number;
  poster_url: string | null;
  storage_path: string | null;
  active: boolean;
  updated_at: string;
};

export default async function PageBannersAdmin() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("page_hero_banners")
    .select(
      "page_key, media_url, media_kind, alt, focal_x, focal_y, poster_url, storage_path, active, updated_at",
    );
  const rows = (data ?? []) as Row[];
  const byKey = new Map(rows.map((r) => [r.page_key, r]));

  const groups = groupedSlots();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">
          CMS · Page banners
        </h1>
        <p className="mt-1 text-sm text-slate-600 max-w-2xl">
          Upload an image or short video for each marketing page&rsquo;s top
          banner. Changes go live within ~60 seconds (cache TTL). Recommended
          image size is 1600×800 (any 2:1 to 16:9 works); video should be MP4
          and under ~10 MB so it loads fast.
        </p>
      </header>

      {Object.entries(groups).map(([groupName, slots]) => (
        <section key={groupName} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {groupName}
          </h2>
          <ul className="space-y-3">
            {slots.map((slot: PageBannerSlot) => {
              const row = byKey.get(slot.key);
              return (
                <li key={slot.key}>
                  <PageBannerRow
                    slot={slot}
                    initial={row ?? null}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
