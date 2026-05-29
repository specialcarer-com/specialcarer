/**
 * P1-B9.1: paperclip icon for the chat composer.
 *
 * Pulled into its own module so the chat thread page can mount it
 * next to the send button without growing the existing ui.tsx barrel
 * (which already has a dozen icons and is shared across /m/*).
 */
export function IconPaperclip({ size = 22 }: { size?: number } = {}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.44 11.05 12.25 20.24a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.75 3.75 0 0 1 5.3 5.3L9.76 17.78a2 2 0 0 1-2.83-2.83l8.49-8.49" />
    </svg>
  );
}
