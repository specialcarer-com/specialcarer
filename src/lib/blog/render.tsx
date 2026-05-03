import { ReactNode } from "react";

// Inline tokens: **bold**, *italic*, `code`, [text](url)
function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let remaining = text;
  let i = 0;
  // Process [link](url) first, then **bold**, then *italic*, then `code`
  const tokenRegex =
    /(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`)/;

  while (remaining.length > 0) {
    const m = remaining.match(tokenRegex);
    if (!m || m.index === undefined) {
      out.push(<span key={`${keyBase}-t${i++}`}>{decodeHtml(remaining)}</span>);
      break;
    }
    if (m.index > 0) {
      out.push(
        <span key={`${keyBase}-t${i++}`}>
          {decodeHtml(remaining.slice(0, m.index))}
        </span>,
      );
    }
    const token = m[0];
    if (token.startsWith("[")) {
      const linkM = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkM) {
        const isExternal = /^https?:\/\//i.test(linkM[2]);
        out.push(
          <a
            key={`${keyBase}-t${i++}`}
            href={linkM[2]}
            className="text-brand-700 hover:underline"
            {...(isExternal
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {decodeHtml(linkM[1])}
          </a>,
        );
      }
    } else if (token.startsWith("**")) {
      out.push(
        <strong key={`${keyBase}-t${i++}`} className="text-slate-900">
          {decodeHtml(token.slice(2, -2))}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      out.push(
        <code
          key={`${keyBase}-t${i++}`}
          className="px-1 py-0.5 rounded bg-slate-100 text-slate-800 text-[0.9em]"
        >
          {decodeHtml(token.slice(1, -1))}
        </code>,
      );
    } else if (token.startsWith("*")) {
      out.push(
        <span
          key={`${keyBase}-t${i++}`}
          className="text-slate-900 font-medium"
        >
          {decodeHtml(token.slice(1, -1))}
        </span>,
      );
    }
    remaining = remaining.slice(m.index + token.length);
  }
  return out;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&amp;/g, "&");
}

export function renderMarkdown(md: string): ReactNode {
  const blocks = md.split(/\n\n+/);
  const elements: ReactNode[] = [];
  let listBuffer: string[] | null = null;
  let listKey = 0;

  const flushList = () => {
    if (listBuffer && listBuffer.length > 0) {
      elements.push(
        <ul
          key={`ul-${listKey++}`}
          className="my-5 list-disc pl-6 space-y-2 text-slate-700"
        >
          {listBuffer.map((item, idx) => (
            <li key={idx}>{renderInline(item.replace(/^- /, ""), `li-${idx}`)}</li>
          ))}
        </ul>,
      );
      listBuffer = null;
    }
  };

  blocks.forEach((block, idx) => {
    const trimmed = block.trim();
    if (!trimmed) return;

    if (/^- /m.test(trimmed) && trimmed.split("\n").every((l) => l.trim().startsWith("- "))) {
      const items = trimmed.split("\n").map((l) => l.trim());
      if (listBuffer) listBuffer.push(...items);
      else listBuffer = items;
      return;
    }

    flushList();

    if (trimmed.startsWith("## ")) {
      elements.push(
        <h2
          key={`h-${idx}`}
          className="mt-10 text-2xl font-semibold text-slate-900"
        >
          {renderInline(trimmed.slice(3), `h${idx}`)}
        </h2>,
      );
      return;
    }
    if (trimmed.startsWith("# ")) {
      elements.push(
        <h1
          key={`h-${idx}`}
          className="mt-10 text-3xl font-semibold text-slate-900"
        >
          {renderInline(trimmed.slice(2), `h${idx}`)}
        </h1>,
      );
      return;
    }
    if (trimmed === "---") {
      elements.push(
        <hr key={`hr-${idx}`} className="my-8 border-slate-200" />,
      );
      return;
    }
    elements.push(
      <p key={`p-${idx}`} className="mt-5 text-slate-700 leading-relaxed">
        {renderInline(trimmed, `p${idx}`)}
      </p>,
    );
  });

  flushList();

  return <>{elements}</>;
}
