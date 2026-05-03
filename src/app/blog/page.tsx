import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";
import { getAllPosts } from "@/lib/blog/posts";

export const metadata: Metadata = {
  title: "Blog — SpecialCarer",
  description:
    "Practical writing on care, family, and the people behind it. From SpecialCarer.",
};

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export default function Page() {
  const posts = getAllPosts();
  return (
    <MarketingShell>
      <section className="px-6 py-16 sm:py-20 max-w-4xl mx-auto">
        <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
          Blog
        </span>
        <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
          Practical writing on care.
        </h1>
        <p className="mt-4 text-lg text-slate-600 max-w-2xl">
          Short, useful pieces for families, caregivers, and the employers who
          want to support both.
        </p>
      </section>

      <section className="px-6 py-8 max-w-4xl mx-auto">
        <ul className="space-y-6">
          {posts.map((p) => (
            <li
              key={p.slug}
              className="bg-white rounded-2xl border border-slate-100 p-6 hover:border-brand-100 hover:shadow-sm transition"
            >
              <Link href={`/blog/${p.slug}`} className="block">
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-medium">
                    {p.category}
                  </span>
                  <span>{dateFmt.format(new Date(p.publishedAt))}</span>
                  <span>· {p.readingTimeMin} min read</span>
                </div>
                <h2 className="mt-3 text-xl font-semibold text-slate-900">
                  {p.title}
                </h2>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {p.excerpt}
                </p>
                <span className="mt-4 inline-block text-sm text-brand-700 font-medium">
                  Read article →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </MarketingShell>
  );
}
