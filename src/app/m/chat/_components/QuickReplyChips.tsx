"use client";

import { getQuickReplies, type ChatRole } from "@/lib/chat/quick-replies";

type Props = {
  role: ChatRole;
  onSelect: (text: string) => void;
  disabled?: boolean;
};

export function QuickReplyChips({ role, onSelect, disabled = false }: Props) {
  const chips = getQuickReplies(role);
  if (chips.length === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label="Quick replies"
      className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onSelect(chip.text)}
          disabled={disabled}
          className="shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition active:bg-[#039EA0]/10 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: "#F4EFE6",
            borderColor: "rgba(3, 158, 160, 0.3)",
            color: "#0F1416",
          }}
        >
          {chip.text}
        </button>
      ))}
    </div>
  );
}
