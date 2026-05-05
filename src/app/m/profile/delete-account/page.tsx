"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TopBar,
  Button,
  Input,
  IconTrash,
} from "../../_components/ui";
import { createClient } from "@/lib/supabase/client";

export default function DeleteAccountPage() {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (confirmText !== "DELETE") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not delete account");
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/m/login?deleted=1");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-28">
      <TopBar title="Delete account" back="/m/profile" />

      <div className="px-5 pt-2">
        <div className="rounded-card bg-[#FFE9E9] p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[#D9534F]">
              <IconTrash />
            </span>
            <div>
              <p className="text-[15px] font-bold text-[#7A1F1F]">
                This action is permanent
              </p>
              <p className="mt-1 text-[13px] leading-snug text-[#7A1F1F]">
                Your profile, bookings history, messages and saved payment methods will be deleted.
                Outstanding bookings must be cancelled first.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <p className="text-[14px] text-heading">
            To continue, type <span className="font-bold text-[#D9534F]">DELETE</span> below.
          </p>
          <Input
            label="Confirmation"
            placeholder="DELETE"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
          />
          {error && (
            <p className="rounded-2xl bg-[#FFE9E9] px-4 py-3 text-sm text-[#D9534F]">{error}</p>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
        <Button
          block
          variant="danger"
          disabled={confirmText !== "DELETE" || loading}
          onClick={submit}
        >
          {loading ? "Deleting…" : "Permanently delete account"}
        </Button>
      </div>
    </div>
  );
}
