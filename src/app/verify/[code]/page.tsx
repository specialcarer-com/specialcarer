import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Verify certificate — SpecialCarer",
};

type VerifyResponse =
  | {
      valid: true;
      carer_name: string;
      course_title: string;
      ceu_credits: number;
      passed_at: string;
    }
  | { valid: false };

async function lookup(code: string): Promise<VerifyResponse> {
  // Use the public origin if available, falling back to localhost (the
  // route is on the same Next.js app and will resolve when called
  // server-to-server).
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    "http://localhost:3000";
  const url = base.startsWith("http") ? base : `https://${base}`;
  try {
    const res = await fetch(
      `${url}/api/training/verify/${encodeURIComponent(code)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return { valid: false };
    return (await res.json()) as VerifyResponse;
  } catch {
    return { valid: false };
  }
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const result = await lookup(code);

  return (
    <main className="min-h-[100dvh] bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
          Certificate verification
        </p>
        <p className="mt-1 text-sm font-mono text-slate-700">
          Code: {code.toUpperCase().slice(0, 8)}
        </p>

        {result.valid ? (
          <div className="mt-6 space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1 text-sm font-semibold">
              ✓ Verified
            </div>
            <p className="text-base text-slate-900">
              <strong>{result.carer_name}</strong> completed{" "}
              <strong>{result.course_title}</strong> on{" "}
              <strong>{fmt(result.passed_at)}</strong>, earning{" "}
              <strong>{result.ceu_credits.toFixed(2)} CEU credits</strong>.
            </p>
            <p className="text-xs text-slate-500">
              Issued by SpecialCarer · All Care 4 U Group Ltd · Companies
              House 09428739
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 border border-rose-200 text-rose-800 px-3 py-1 text-sm font-semibold">
              ✗ Not found
            </div>
            <p className="text-sm text-slate-700">
              We couldn&rsquo;t verify this certificate. Check that you copied
              the 8-character code exactly as printed.
            </p>
          </div>
        )}

        <div className="mt-6">
          <Link
            href="/"
            className="text-sm font-semibold text-slate-900 hover:underline"
          >
            ← Back to SpecialCarer
          </Link>
        </div>
      </div>
    </main>
  );
}
