"use client";

/**
 * P0-A4-bis-2: rendered inside the chat screen when the booking has no
 * carer assigned yet. The chat backend returns 409 `chat_no_carer_yet`
 * in that state; the seeker still landed on the page (e.g. via a deep
 * link), so we explain instead of redirecting.
 */
export function EmptyChatState({
  otherPartyName,
}: {
  otherPartyName?: string | null;
}) {
  const subject = otherPartyName?.trim()
    ? `your ${otherPartyName} carer`
    : "your carer";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div
        aria-hidden
        className="grid h-16 w-16 place-items-center rounded-full bg-primary-50 text-primary"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a8 8 0 01-11.7 7.1L4 21l1.9-5.3A8 8 0 1121 12z" />
        </svg>
      </div>
      <p className="text-[16px] font-bold text-heading">No carer yet</p>
      <p className="text-[13px] text-subheading leading-relaxed max-w-[260px]">
        You&rsquo;ll be able to message {subject} as soon as they accept this booking.
      </p>
    </div>
  );
}
