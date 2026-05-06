import { notFound } from "next/navigation";
import { TopBar, BottomNav } from "../../_components/ui";
import RecipientEditor from "../_components/RecipientEditor";
import { getRecipient } from "@/lib/recipients/server";

export const dynamic = "force-dynamic";

export default async function EditRecipientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipient = await getRecipient(id);
  if (!recipient) notFound();

  const titles = {
    child: "Edit child",
    senior: "Edit senior",
    home: "Edit home",
  } as const;

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title={titles[recipient.kind]} back="/m/household" />
      <RecipientEditor
        mode="edit"
        kind={recipient.kind}
        initial={recipient}
      />
      <BottomNav active="profile" />
    </main>
  );
}
