"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

const TEAL = "#039EA0";

type Props = {
  url: string;
  name: string;
  onClose: () => void;
};

function shareMessage(name: string): string {
  return `Check out ${name}'s caregiver profile on SpecialCarer — trusted, DBS-checked care.`;
}

export default function ShareProfileModal({ url, name, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const msg = shareMessage(name);
  const eUrl = encodeURIComponent(url);
  const eMsg = encodeURIComponent(msg);

  const links: { key: string; label: string; href: string }[] = [
    { key: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${eMsg}%20${eUrl}` },
    {
      key: "email",
      label: "Email",
      href: `mailto:?subject=${encodeURIComponent("My SpecialCarer profile")}&body=${eMsg}%20${eUrl}`,
    },
    { key: "x", label: "X", href: `https://twitter.com/intent/tweet?text=${eMsg}&url=${eUrl}` },
    {
      key: "linkedin",
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${eUrl}`,
    },
    { key: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${eUrl}` },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share my profile"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-card bg-white p-6 shadow-card sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-heading">
            Share my profile
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[20px] leading-none text-[#0F1416]/50"
          >
            ×
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-btn border border-[#E5E0D5] p-2">
          <input
            readOnly
            value={url}
            aria-label="Profile link"
            className="min-w-0 flex-1 bg-transparent px-1 text-[13px] text-[#0F1416]/80 outline-none"
          />
          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded-btn px-3 py-1.5 text-[13px] font-bold text-white"
            style={{ background: TEAL }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <ul className="mt-4 grid grid-cols-3 gap-2">
          {links.map((l) => (
            <li key={l.key}>
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center rounded-btn border border-[#E5E0D5] px-2 py-2.5 text-[13px] font-semibold text-heading hover:bg-[#F4EFE6]"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-col items-center">
          <div className="rounded-card border border-[#E5E0D5] bg-white p-3">
            <QRCodeSVG value={url} size={140} fgColor="#0F1416" bgColor="#FFFFFF" />
          </div>
          <p className="mt-2 text-[12px] text-[#0F1416]/60">
            Scan to open your profile
          </p>
        </div>
      </div>
    </div>
  );
}
