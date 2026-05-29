"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PasswordInput, Button } from "../_components/ui";
import { createClient } from "@/lib/supabase/client";

export default function MobileResetPasswordPage() {
  const router = useRouter();
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setAuthed(Boolean(data.user));
    });
  }, []);

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
    const { error: updErr } = await supabase.auth.updateUser({
      password: next,
    });
    setLoading(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    router.replace("/m/home");
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-28">
      <div className="px-5 pt-12">
        <h1 className="text-2xl font-bold text-ink">Set a new password</h1>
        <p className="mt-2 text-sm text-slate-600">
          Choose a new password to finish resetting your account.
        </p>
      </div>

      {authed === false ? (
        <div className="mx-5 mt-6 rounded-2xl bg-[#FFE9E9] px-4 py-3 text-sm text-[#D9534F]">
          Your reset link has expired or is invalid.{" "}
          <a href="/m/login" className="font-semibold underline">
            Request a new one
          </a>
          .
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 px-5 pt-6">
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
            <Button
              block
              onClick={submit}
              disabled={loading || authed === null}
            >
              {loading ? "Updating…" : "Set new password"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
