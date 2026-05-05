"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar, PasswordInput, Button } from "../../_components/ui";
import { createClient } from "@/lib/supabase/client";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    if (next.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (next !== confirmPw) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: updErr } = await supabase.auth.updateUser({ password: next });
    setLoading(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    router.push("/m/profile");
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-28">
      <TopBar title="Change password" back="/m/profile" />
      <div className="flex flex-col gap-4 px-5 pt-2">
        <PasswordInput
          label="Current password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="••••••••"
        />
        <PasswordInput
          label="New password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="At least 8 characters"
        />
        <PasswordInput
          label="Confirm new password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          placeholder="Repeat new password"
        />
        {error && (
          <p className="rounded-2xl bg-[#FFE9E9] px-4 py-3 text-sm text-[#D9534F]">
            {error}
          </p>
        )}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
        <Button block onClick={submit} disabled={loading}>
          {loading ? "Updating…" : "Update password"}
        </Button>
      </div>
    </div>
  );
}
