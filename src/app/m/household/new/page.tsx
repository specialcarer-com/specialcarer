import { redirect } from "next/navigation";
import { TopBar, BottomNav } from "../../_components/ui";
import RecipientEditor from "../_components/RecipientEditor";
import type { RecipientKind } from "@/lib/recipients/types";

export const dynamic = "force-dynamic";

const VALID: RecipientKind[] = ["child", "senior", "home"];

export default async function NewRecipientPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const params = await searchParams;
  const kind = (params.kind ?? "child") as RecipientKind;
  if (!VALID.includes(kind)) {
    redirect("/m/household");
  }

  const titles: Record<RecipientKind, string> = {
    child: "Add a child",
    senior: "Add a senior",
    home: "Add a home",
  };

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title={titles[kind]} back="/m/household" />
      <RecipientEditor mode="create" kind={kind} />
      <BottomNav active="profile" />
    </main>
  );
}
