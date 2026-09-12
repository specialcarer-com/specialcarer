"use client";

/**
 * The single client component in PR C3b — copies a regulator-template
 * body into the clipboard and flashes "Copied!" for 1.5s.
 *
 * Everything else in the case detail page is server-rendered.
 */
import { useState } from "react";

type Props = { text: string; label?: string };

export default function CopyToClipboardButton({
  text,
  label = "Copy to clipboard",
}: Props) {
  const [copied, setCopied] = useState(false);
  async function onClick() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
