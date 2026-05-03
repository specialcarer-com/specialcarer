import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";
import { getAllPosts, getPostBySlug } from "@/lib/blog/posts";
import { renderMarkdown } from "@/lib/blog/render";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Article not found — SpecialCarer" };
  return {
    title: `${post.title} — SpecialCarer`,
    description: post.excerpt,
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    <MarketingShell>
      <article className="px-6 py-16 sm:py-20 max-w-3xl mx-auto">
        <Link
          href="/blog"
          className="text-sm text-brand-700 hover:underline"
        >
          ← All articles
        </Link>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-medium">
            {post.category}
          </span>
          <span>{dateFmt.format(new Date(post.publishedAt))}</span>
          <span>· {post.readingTimeMin} min read</span>
          <span>· {post.author}</span>
        </div>
        <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
          {post.title}
        </h1>
        <p className="mt-5 text-lg text-slate-600 leading-relaxed">
          {post.excerpt}
        </p>

        <div className="mt-10 prose-slate max-w-none">
          {renderMarkdown(post.bodyMd)}
        </div>

        <div className="mt-16 bg-brand-50 rounded-2xl p-6 sm:p-8 text-center">
          <h2 className="text-xl font-semibold text-slate-900">
            Looking for vetted, on-demand care?
          </h2>
          <Link
            href="/find-care"
            className="mt-4 inline-block px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition"
          >
            Find care now
          </Link>
        </div>
      </article>
    </MarketingShell>
  );
}
