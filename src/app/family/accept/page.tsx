"use client";

/**
 * P1-B11: family invite landing page.
 *
 * Reached from the invite email link `/family/accept?token=...`. We
 * validate the token via GET /api/family/accept, then either
 *   - auto-accept (signed-in caller → POST) and redirect to the thread,
 *   - or render a magic-link sign-in CTA carrying the token through.
 */
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Summary = {
  invite_id: string;
  inviter_name: string;
  expires_at: string;
  booking_summary: string | null;
};

function AcceptInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; summary: Summary }
    | { kind: "needs_signin"; summary: Summary }
    | { kind: "accepted"; thread_id: string }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ kind: "error", message: "Missing invitation token." });
      return;
    }
    void (async () => {
      const res = await fetch(
        `/api/family/accept?token=${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setState({
          kind: "error",
          message: body.error ?? "This invitation is no longer valid.",
        });
        return;
      }
      const summary = (await res.json()) as Summary;

      // Try to accept right away; if the caller is signed out the
      // endpoint will return 401 with needs_signin=true.
      const post = await fetch("/api/family/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (post.ok) {
        const json = (await post.json()) as { thread_id: string };
        setState({ kind: "accepted", thread_id: json.thread_id });
        // Brief pause so the user sees confirmation before redirect.
        setTimeout(() => {
          router.push(`/m/chat/${json.thread_id}`);
        }, 1200);
        return;
      }
      if (post.status === 401) {
        setState({ kind: "needs_signin", summary });
        return;
      }
      const body = (await post.json().catch(() => ({}))) as { error?: string };
      setState({
        kind: "error",
        message: body.error ?? "Could not accept this invitation.",
      });
    })();
  }, [token, router]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{
        background: "#F4EFE6",
        color: "#0F1416",
        fontFamily:
          "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-card"
        style={{ boxShadow: "0 4px 24px rgba(15, 23, 42, 0.06)" }}
      >
        <h1
          className="text-2xl font-bold"
          style={{ color: "#0F1416" }}
        >
          Family invitation
        </h1>

        {state.kind === "loading" && (
          <p className="mt-4 text-sm" style={{ color: "#5C6770" }}>
            Checking your invitation…
          </p>
        )}

        {state.kind === "error" && (
          <p className="mt-4 text-sm" style={{ color: "#A22" }}>
            {state.message}
          </p>
        )}

        {state.kind === "needs_signin" && (
          <>
            <p className="mt-4 text-[15px]" style={{ color: "#0F1416" }}>
              <strong>{state.summary.inviter_name}</strong> invited you to chat
              with their carer
              {state.summary.booking_summary
                ? ` about ${state.summary.booking_summary}`
                : ""}
              .
            </p>
            <p className="mt-3 text-sm" style={{ color: "#5C6770" }}>
              Sign in to accept. You can see all messages in the chat, but you
              won&apos;t be able to trigger SOS, edit tasks, or pay.
            </p>
            <a
              href={`/m/login?next=${encodeURIComponent(
                `/family/accept?token=${token ?? ""}`,
              )}`}
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full font-bold text-white"
              style={{ background: "#039EA0" }}
            >
              Sign in to accept
            </a>
          </>
        )}

        {state.kind === "ready" && (
          <>
            <p className="mt-4 text-[15px]">
              <strong>{state.summary.inviter_name}</strong> invited you to a
              chat
              {state.summary.booking_summary
                ? ` about ${state.summary.booking_summary}`
                : ""}
              .
            </p>
          </>
        )}

        {state.kind === "accepted" && (
          <p className="mt-4 text-[15px]" style={{ color: "#0F1416" }}>
            You&apos;re in. Taking you to the chat…
          </p>
        )}
      </div>
    </div>
  );
}

export default function AcceptPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: "#F4EFE6" }}
        />
      }
    >
      <AcceptInner />
    </Suspense>
  );
}
