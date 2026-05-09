import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar, TopBar } from "../../_components/ui";
import UnblockButton from "./unblock-button";

export const dynamic = "force-dynamic";

type BlockRow = {
  caregiver_id: string;
  reason: string | null;
  created_at: string;
};

type CarerProfile = {
  user_id: string;
  display_name: string | null;
  city: string | null;
  photo_url: string | null;
};

export default async function BlocksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/m/login?redirectTo=/m/profile/blocks");
  }

  const { data: blockData } = await supabase
    .from("blocked_caregivers")
    .select("caregiver_id, reason, created_at")
    .eq("seeker_id", user.id)
    .order("created_at", { ascending: false });
  const blocks = (blockData ?? []) as BlockRow[];

  let carersById = new Map<string, CarerProfile>();
  if (blocks.length > 0) {
    const ids = blocks.map((b) => b.caregiver_id);
    const { data: profileData } = await supabase
      .from("caregiver_profiles")
      .select("user_id, display_name, city, photo_url")
      .in("user_id", ids);
    carersById = new Map(
      ((profileData ?? []) as CarerProfile[]).map((p) => [p.user_id, p]),
    );
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-8">
      <TopBar title="Blocked carers" back="/m/profile" />

      <div className="px-5 pt-4">
        <p className="text-[13px] text-subheading">
          Blocked carers won&rsquo;t appear in your search results, instant
          matches, or browse list.
        </p>
      </div>

      {blocks.length === 0 ? (
        <div className="mt-6 px-5">
          <div className="rounded-card bg-white p-6 text-center shadow-card">
            <p className="text-[14px] text-heading font-semibold">
              No blocked carers
            </p>
            <p className="mt-1 text-[12px] text-subheading">
              You haven&rsquo;t blocked anyone yet.
            </p>
            <Link
              href="/m/search"
              className="mt-3 inline-block text-primary font-bold text-[13px]"
            >
              Browse carers
            </Link>
          </div>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3 px-5">
          {blocks.map((b) => {
            const carer = carersById.get(b.caregiver_id);
            const name = carer?.display_name ?? "Carer";
            return (
              <li
                key={b.caregiver_id}
                className="flex items-center gap-3 rounded-card bg-white p-4 shadow-card"
              >
                <Avatar
                  src={carer?.photo_url ?? undefined}
                  name={name}
                  size={48}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-heading">
                    {name}
                  </p>
                  <p className="text-[12px] text-subheading truncate">
                    {carer?.city ?? "—"}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </p>
                </div>
                <UnblockButton caregiverId={b.caregiver_id} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
