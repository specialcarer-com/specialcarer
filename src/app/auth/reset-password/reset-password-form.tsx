"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

type Props = { redirectTo: string };

export function ResetPasswordForm({ redirectTo }: Props) {
  const t = useTranslations("auth");
  const tv = useTranslations("validation");
  const router = useRouter();
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  // Confirm the recovery session is in place. The callback should have
  // verified the recovery token before redirecting here; if for some reason
  // there is no session, send the user back to login to start over.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setAuthed(Boolean(data.user));
    });
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (next.length < 8) {
      setError(tv("passwordTooShort"));
      return;
    }
    if (next !== confirmPw) {
      setError(tv("passwordsDontMatch"));
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

    router.replace(redirectTo);
  }

  if (authed === false) {
    return (
      <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">
        {t("resetExpiredPrefix")}{" "}
        <a href="/login" className="font-semibold underline">
          {t("requestNewLink")}
        </a>
        .
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="new-password"
          className="text-sm font-medium text-slate-700"
        >
          {t("newPassword")}
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder={t("newPasswordPlaceholder")}
          className="rounded-xl border border-slate-300 px-4 py-3 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand"
          required
          minLength={8}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="confirm-password"
          className="text-sm font-medium text-slate-700"
        >
          {t("confirmNewPassword")}
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          placeholder={t("confirmNewPasswordPlaceholder")}
          className="rounded-xl border border-slate-300 px-4 py-3 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand"
          required
          minLength={8}
        />
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || authed === null}
        className="mt-2 inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-base font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
      >
        {loading ? t("updating") : t("setNewPassword")}
      </button>
    </form>
  );
}
