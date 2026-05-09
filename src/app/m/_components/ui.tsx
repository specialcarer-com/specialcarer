"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
  forwardRef,
  useState,
} from "react";

/* ──────────────────────────────────────────────────────────────────
   Button
   ────────────────────────────────────────────────────────────────── */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger";
  size?: "lg" | "md" | "sm";
  block?: boolean;
};

export function Button({
  variant = "primary",
  size = "lg",
  block,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const sizes = {
    lg: "h-14 text-[16px] px-6 rounded-btn",
    md: "h-12 text-[15px] px-5 rounded-btn",
    sm: "h-10 text-[14px] px-4 rounded-pill",
  };
  const variants = {
    primary:
      "bg-primary text-white font-bold shadow-sm active:bg-primary-600 disabled:bg-line disabled:text-subheading disabled:shadow-none",
    ghost:
      "bg-primary-50 text-primary font-bold active:bg-primary-100 disabled:bg-muted disabled:text-subheading",
    outline:
      "bg-white text-secondary border border-secondary font-bold active:bg-secondary-50 disabled:text-subheading disabled:border-line",
    danger:
      "bg-white border border-[#E33] text-[#C22] font-bold active:bg-[#FBEBEB]",
  };
  return (
    <button
      className={`sc-no-select inline-flex items-center justify-center gap-2 transition active:scale-[0.99] ${
        sizes[size]
      } ${variants[variant]} ${block ? "w-full" : ""} ${className}`}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Input + Textarea
   ────────────────────────────────────────────────────────────────── */
type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
  rightSlot?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, rightSlot, className = "", id, ...rest },
  ref
) {
  const generatedId = id || `in-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={generatedId}
          className="block text-[14px] font-semibold text-heading mb-2"
        >
          {label}
        </label>
      )}
      <div
        className={`flex items-center w-full h-14 rounded-btn border bg-white px-4 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 ${
          error ? "border-[#E33]" : "border-line"
        }`}
      >
        <input
          ref={ref}
          id={generatedId}
          className={`flex-1 bg-transparent outline-none text-[15px] text-heading placeholder:text-[#A3A3A3] ${className}`}
          {...rest}
        />
        {rightSlot}
      </div>
      {(hint || error) && (
        <p
          className={`mt-1.5 text-[12px] ${
            error ? "text-[#C22]" : "text-subheading"
          }`}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
});

export function PasswordInput(props: InputProps) {
  const [show, setShow] = useState(false);
  return (
    <Input
      {...props}
      type={show ? "text" : "password"}
      rightSlot={
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? "Hide password" : "Show password"}
          className="ml-2 p-1 text-subheading sc-no-select"
        >
          {show ? <IconEyeOff /> : <IconEye />}
        </button>
      }
    />
  );
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  /** Optional hint text shown below the field (grey, smaller). */
  hint?: string;
};
export function TextArea({
  label,
  error,
  hint,
  className = "",
  id,
  ...rest
}: TextAreaProps) {
  const generatedId = id || `ta-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={generatedId}
          className="block text-[14px] font-semibold text-heading mb-2"
        >
          {label}
        </label>
      )}
      <textarea
        id={generatedId}
        rows={4}
        className={`w-full rounded-btn border bg-white px-4 py-3 text-[15px] text-heading placeholder:text-[#A3A3A3] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${
          error ? "border-[#E33]" : "border-line"
        } ${className}`}
        {...rest}
      />
      {hint && !error && <p className="mt-1.5 text-[12px] text-subheading">{hint}</p>}
      {error && <p className="mt-1.5 text-[12px] text-[#C22]">{error}</p>}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   TopBar
   Used for sub-screens (back chevron + title + optional bell).
   ────────────────────────────────────────────────────────────────── */
export function TopBar({
  title,
  back,
  right,
}: {
  title?: string;
  back?: string | (() => void);
  right?: ReactNode;
}) {
  const onBack = typeof back === "function" ? back : undefined;
  const href = typeof back === "string" ? back : undefined;
  return (
    <div className="sc-safe-top sticky top-0 z-30 bg-white">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-2 min-w-0">
          {(href || onBack) && (
            href ? (
              <Link
                href={href}
                className="-ml-2 p-2 sc-no-select"
                aria-label="Back"
              >
                <IconChevronLeft />
              </Link>
            ) : (
              <button
                onClick={onBack}
                className="-ml-2 p-2 sc-no-select"
                aria-label="Back"
              >
                <IconChevronLeft />
              </button>
            )
          )}
          {title && (
            <h1 className="text-[18px] font-bold text-heading truncate">
              {title}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-2">{right}</div>
      </div>
    </div>
  );
}

export function NotificationBell({ href = "/m/notifications", hasUnread = true }: { href?: string; hasUnread?: boolean }) {
  return (
    <Link
      href={href}
      aria-label="Notifications"
      className="relative grid place-items-center w-10 h-10 rounded-full bg-muted sc-no-select"
    >
      <IconBell />
      {hasUnread && (
        <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-[#E33] sc-pulse" />
      )}
    </Link>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Bottom navigation (5 tabs)
   ────────────────────────────────────────────────────────────────── */
export function BottomNav({
  active,
  role = "seeker",
}: {
  active: "home" | "bookings" | "jobs" | "chat" | "profile";
  role?: "seeker" | "carer";
}) {
  // For seekers, "Jobs" tab is replaced with "Saved" (saved carers).
  // For carers, we keep "Jobs" as the feed.
  const items =
    role === "carer"
      ? [
          { key: "home", label: "Home", href: "/m/home", icon: <IconHome /> },
          { key: "bookings", label: "Schedule", href: "/m/bookings", icon: <IconCal /> },
          { key: "jobs", label: "Jobs", href: "/m/jobs", icon: <IconBag /> },
          { key: "chat", label: "Chat", href: "/m/chat", icon: <IconChat /> },
          { key: "profile", label: "Profile", href: "/m/profile", icon: <IconUser /> },
        ]
      : [
          { key: "home", label: "Home", href: "/m/home", icon: <IconHome /> },
          { key: "bookings", label: "Bookings", href: "/m/bookings", icon: <IconCal /> },
          { key: "jobs", label: "Post Job", href: "/m/post-job", icon: <IconBag /> },
          { key: "chat", label: "Chat", href: "/m/chat", icon: <IconChat /> },
          { key: "profile", label: "Profile", href: "/m/profile", icon: <IconUser /> },
        ];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 bg-white shadow-nav border-t border-line sc-safe-bottom sc-no-select"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
    >
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const isActive = it.key === active;
          return (
            <li key={it.key} className="relative">
              <Link
                href={it.href}
                className="flex flex-col items-center justify-center pt-3 pb-1 gap-1"
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-b-full bg-primary" />
                )}
                <span className={isActive ? "text-primary" : "text-subheading"}>
                  {it.icon}
                </span>
                <span
                  className={`text-[11px] ${
                    isActive ? "text-primary font-bold" : "text-subheading"
                  }`}
                >
                  {it.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Card / Tag / Avatar / SectionTitle
   ────────────────────────────────────────────────────────────────── */
export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`bg-white rounded-card shadow-card p-4 ${className}`}
    >
      {children}
    </div>
  );
}

export function Tag({
  children,
  tone = "primary",
}: {
  children: ReactNode;
  tone?: "primary" | "amber" | "green" | "red" | "neutral";
}) {
  const tones = {
    primary: "bg-primary-50 text-primary border-primary/20",
    amber: "bg-status-requested text-[#8C5C00] border-[#E5C285]",
    green: "bg-status-completed text-[#2C7A3F] border-[#A6DBB1]",
    red: "bg-status-cancelled text-[#A33] border-[#E5B3B3]",
    neutral: "bg-muted text-subheading border-line",
  };
  return (
    <span
      className={`inline-flex items-center px-3 h-7 rounded-pill border text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Avatar({
  src,
  name,
  size = 44,
  ring = false,
}: {
  src?: string | null;
  name?: string;
  size?: number;
  ring?: boolean;
}) {
  const initials =
    (name || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "U";
  return (
    <div
      style={{ width: size, height: size }}
      className={`grid place-items-center rounded-full bg-primary-50 text-primary font-bold overflow-hidden flex-shrink-0 ${
        ring ? "ring-2 ring-primary" : ""
      }`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name || ""} className="w-full h-full object-cover" />
      ) : (
        <span style={{ fontSize: Math.max(12, size / 2.6) }}>{initials}</span>
      )}
    </div>
  );
}

export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mt-6 mb-3 px-4">
      <h2 className="text-[16px] font-bold text-heading">{title}</h2>
      {action}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Toggle (iOS-style green)
   ────────────────────────────────────────────────────────────────── */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 items-center rounded-pill transition sc-no-select ${
        checked ? "bg-[#34C759]" : "bg-[#D1D5DB]"
      }`}
      aria-label={label}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Tabs (segmented underline — used on profile screens)
   ────────────────────────────────────────────────────────────────── */
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex border-b border-line bg-white">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`flex-1 py-3 text-[14px] font-semibold relative ${
              isActive ? "text-primary" : "text-subheading"
            }`}
          >
            {t.label}
            {isActive && (
              <span className="absolute left-1/2 -translate-x-1/2 -bottom-px h-0.5 w-12 bg-primary rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Logo (used in onboarding / auth screens)
   "Hand-cradling-house" SVG inspired by the Figma logo, recoloured
   with our brand teal + secondary navy.
   ────────────────────────────────────────────────────────────────── */
/**
 * Brand mark — the hands + heart + family illustration cradling a home,
 * paired with the SpecialCarer wordmark.
 *
 * Pass `withText={false}` for tight headers / nav usage. Pass `tone="plain"`
 * to drop the soft teal tile (e.g. when placing on a coloured hero band).
 */
export function AppLogo({
  size = 96,
  withText = true,
  tone = "tinted",
}: {
  size?: number;
  withText?: boolean;
  tone?: "tinted" | "plain";
}) {
  const mark = (
    <div
      style={{ width: size, height: size }}
      className={`grid place-items-center rounded-3xl ${
        tone === "tinted" ? "bg-primary-50" : ""
      }`}
    >
      <Image
        src="/m/brand/logo-mark.png"
        alt="SpecialCarer"
        width={Math.round(size * 0.86)}
        height={Math.round(size * 0.86 * 0.535)}
        priority
        className="h-auto w-auto"
        style={{ maxWidth: "86%", maxHeight: "86%" }}
      />
    </div>
  );
  if (!withText) return mark;
  return (
    <div className="flex flex-col items-center gap-2">
      {mark}
      <p className="text-primary font-bold text-[18px] tracking-tight">SpecialCarer</p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Page indicators (used on onboarding)
   ────────────────────────────────────────────────────────────────── */
export function Dots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => {
        const active = i === current;
        return (
          <span
            key={i}
            className={`h-1.5 rounded-pill transition-all ${
              active ? "bg-primary w-6" : "bg-line w-1.5"
            }`}
          />
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Star rating
   ────────────────────────────────────────────────────────────────── */
export function Stars({
  value,
  size = 14,
}: {
  value: number;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={n <= Math.round(value) ? "#F5B400" : "#E5E7EB"}
        >
          <path d="M12 2l2.9 6.9L22 9.7l-5.5 4.7L18.2 22 12 18.4 5.8 22l1.7-7.6L2 9.7l7.1-.8L12 2z" />
        </svg>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Icons (lightweight, inline SVGs — no external icon dep)
   ────────────────────────────────────────────────────────────────── */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconChevronLeft = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);
export const IconChevronRight = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const IconBell = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <path d="M6 8a6 6 0 1112 0v3l1.5 3.5h-15L6 11V8z" />
    <path d="M10 18a2 2 0 004 0" />
  </svg>
);
export const IconHome = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
    <path d="M3 11l9-7 9 7v9a2 2 0 01-2 2h-4v-6h-6v6H5a2 2 0 01-2-2v-9z" />
  </svg>
);
export const IconCal = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);
export const IconBag = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
    <path d="M4 8h16l-1 12a2 2 0 01-2 2H7a2 2 0 01-2-2L4 8z" />
    <path d="M9 8V6a3 3 0 016 0v2" />
  </svg>
);
export const IconChat = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
    <path d="M21 12a8 8 0 01-11.7 7.1L4 21l1.9-5.3A8 8 0 1121 12z" />
  </svg>
);
export const IconUser = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0116 0" />
  </svg>
);
export const IconSearch = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);
export const IconFilter = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </svg>
);
export const IconPin = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
    <path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
);
export const IconAward = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="9" r="6" />
    <path d="M9 14l-2 7 5-3 5 3-2-7" />
  </svg>
);
export const IconStar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="#F5B400">
    <path d="M12 2l2.9 6.9L22 9.7l-5.5 4.7L18.2 22 12 18.4 5.8 22l1.7-7.6L2 9.7l7.1-.8L12 2z" />
  </svg>
);
export const IconPhone = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <path d="M5 4h4l2 5-3 2a12 12 0 005 5l2-3 5 2v4a2 2 0 01-2 2A17 17 0 013 6a2 2 0 012-2z" />
  </svg>
);
export const IconMail = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
);
export const IconChatBubble = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <path d="M21 12a8 8 0 01-11.7 7.1L4 21l1.9-5.3A8 8 0 1121 12z" />
  </svg>
);
export const IconEye = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IconEyeOff = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <path d="M3 3l18 18" />
    <path d="M10.5 6.6A10 10 0 0112 6c6 0 10 6 10 6a18 18 0 01-3.7 4.3M6.5 6.5A18 18 0 002 12s4 7 10 7c1.5 0 2.9-.3 4.1-.9" />
  </svg>
);
export const IconInfo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v.01M12 11v5" />
  </svg>
);
export const IconLanguage = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
    <path d="M3 6h12M9 3v3M11 6c0 4-3 8-8 9M5 10c1 3 5 6 9 6" />
    <path d="M14 21l4-9 4 9M16 17h4" />
  </svg>
);
export const IconCert = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="3" width="18" height="14" rx="2" />
    <path d="M9 21l3-2 3 2v-4" />
  </svg>
);
export const IconClock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const IconCamera = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <path d="M3 8h4l2-3h6l2 3h4v11H3z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);
export const IconLock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 018 0v4" />
  </svg>
);
export const IconLogout = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
    <path d="M15 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M10 17l-5-5 5-5M5 12h12" />
  </svg>
);
export const IconTrash = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" />
  </svg>
);
export const IconCard = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 10h18" />
  </svg>
);
export const IconPlus = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconSend = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 11l18-8-8 18-2-7-8-3z" />
  </svg>
);
export const IconCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
    <path d="M4 12l5 5 11-11" />
  </svg>
);

/* ──────────────────────────────────────────────────────────────────
   Credential badges — clinical & nurse

   Two small pills used wherever a carer is rendered in a list or
   header. They communicate, at a glance, that this carer is allowed
   to take complex clinical bookings. Designed to sit next to (not
   on top of) the existing "Verified" pill — distinct colours so a
   nurse displays both badges without visual collision.

     • Clinical → indigo, stethoscope icon (RN/HCA-certified)
     • Nurse    → burgundy, cross-in-shield (NMC PIN / state RN)

   `compact` strips the label so the icon-only chip can ride inside
   tight cards (search results).
   ────────────────────────────────────────────────────────────────── */

export type CredentialKind = "clinical" | "nurse";

const CRED_STYLES: Record<
  CredentialKind,
  { bg: string; text: string; label: string }
> = {
  clinical: { bg: "#E8EEF8", text: "#1F4FA8", label: "Clinical" },
  nurse: { bg: "#F8E9EC", text: "#8B2A3D", label: "Nurse" },
};

function IconStethoscope() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 3v6a4 4 0 008 0V3" />
      <path d="M9 13v3a5 5 0 0010 0v-2" />
      <circle cx="19" cy="11" r="2" />
    </svg>
  );
}

function IconNurseCross() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

export function CredentialBadge({
  kind,
  compact = false,
  className = "",
}: {
  kind: CredentialKind;
  compact?: boolean;
  className?: string;
}) {
  const style = CRED_STYLES[kind];
  return (
    <span
      role="img"
      aria-label={`${style.label} credentialed`}
      title={`${style.label} credentialed`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ${className}`}
      style={{ background: style.bg, color: style.text }}
    >
      {kind === "nurse" ? <IconNurseCross /> : <IconStethoscope />}
      {!compact && <span>{style.label}</span>}
    </span>
  );
}

/**
 * Convenience wrapper: pass a carer's flags and we render the right
 * combination. A nurse always implies clinical, but only one nurse
 * badge is shown (with the clinical badge alongside) so there's no
 * visual stacking problem.
 */
export function CarerBadges({
  isClinical,
  isNurse,
  compact = false,
  className = "",
}: {
  isClinical?: boolean;
  isNurse?: boolean;
  compact?: boolean;
  className?: string;
}) {
  if (!isClinical && !isNurse) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {isNurse && <CredentialBadge kind="nurse" compact={compact} />}
      {(isClinical || isNurse) && (
        <CredentialBadge kind="clinical" compact={compact} />
      )}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────
   ComingSoon — shared shell for placeholder feature pages
   ──────────────────────────────────────────────────────────────────

   Used by /m/track/[id], /m/journal, /m/family, /m/memberships.

   Why a shared component instead of 4 bespoke pages:
     1. Visual consistency — all four read as "polished placeholder"
        in the same dialect, which is what App Reviewers (and seekers)
        expect from a marketplace's Coming Soon screens.
     2. The same URL stays put when the real feature ships — we just
        replace the page contents, no router changes, no broken
        deeplinks from emails or push notifications.
     3. If the user rejects the visual treatment we can update one
        component instead of four.

   Design intent:
     - Hero icon in a tinted circle (uses the brand teal at 10% so it
       sits comfortably on the bg-screen).
     - Title + benefit-led description (NOT "under construction" — we
       sell the value of the feature, then say when it's coming).
     - A 3-bullet "What you'll be able to do" preview so the page
       has substance and reviewers see we've thought it through.
     - Optional "Notify me" CTA — by default it's a soft no-op that
       just toasts. A future revision can swap this for a real
       Supabase notify list. We keep the CTA so the page doesn't
       feel dead.
     - Optional secondary action — e.g. on /m/track we want a
       "Back to booking" link.
*/

export function ComingSoon({
  title,
  description,
  bullets,
  hero,
  primary,
  secondary,
  badge = "Coming soon",
}: {
  title: string;
  description: string;
  bullets: { icon: ReactNode; text: string }[];
  hero: ReactNode;
  primary?: { label: string; href?: string; onClick?: () => void };
  secondary?: { label: string; href: string };
  badge?: string;
}) {
  return (
    <div className="px-5 pt-4 pb-12">
      <div className="rounded-card bg-white p-6 shadow-card text-center">
        <div
          className="mx-auto w-20 h-20 rounded-full grid place-items-center"
          style={{ background: "rgba(3,158,160,0.12)", color: "#039EA0" }}
          aria-hidden
        >
          {hero}
        </div>

        <span
          className="mt-5 inline-flex items-center gap-1 rounded-pill px-3 py-1 text-[11px] font-semibold uppercase tracking-wide"
          style={{ background: "#FFF6E5", color: "#9A6B00" }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: "#E0A100" }}
          />
          {badge}
        </span>

        <h2 className="mt-4 text-[22px] font-bold text-heading leading-tight">
          {title}
        </h2>
        <p className="mt-2 text-[14px] text-subheading leading-relaxed">
          {description}
        </p>
      </div>

      <div className="mt-5 rounded-card bg-white p-5 shadow-card">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-subheading">
          What you&apos;ll be able to do
        </p>
        <ul className="mt-3 space-y-3">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full"
                style={{ background: "rgba(3,158,160,0.10)", color: "#039EA0" }}
              >
                {b.icon}
              </span>
              <span className="flex-1 text-[14px] text-heading leading-relaxed">
                {b.text}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {(primary || secondary) && (
        <div className="mt-6 space-y-3">
          {primary &&
            (primary.href ? (
              <Link
                href={primary.href}
                className="block w-full text-center font-bold text-white bg-primary rounded-full py-3 sc-no-select"
              >
                {primary.label}
              </Link>
            ) : (
              <button
                onClick={primary.onClick}
                className="block w-full text-center font-bold text-white bg-primary rounded-full py-3 sc-no-select"
              >
                {primary.label}
              </button>
            ))}
          {secondary && (
            <Link
              href={secondary.href}
              className="block w-full text-center font-bold text-primary bg-white border border-primary rounded-full py-3 sc-no-select"
            >
              {secondary.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/* Extra icons used by the four placeholder feature pages.
   Note: the shared `stroke` spread above already sets fill:"none" —
   don't repeat it on the JSX or TS will warn about duplicate props. */
export const IconMapPin = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" {...stroke}>
    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);
export const IconJournal = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" {...stroke}>
    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" />
    <path d="M5 4v13a3 3 0 0 0 3 3" />
    <path d="M9 9h6M9 13h6M9 17h4" />
  </svg>
);
export const IconFamily = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" {...stroke}>
    <circle cx="8" cy="8" r="3" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M2.5 19c.6-3.2 3-5 5.5-5s4.9 1.8 5.5 5" />
    <path d="M14 19c.4-2.2 1.9-3.5 3.5-3.5s3 1.3 3.5 3.5" />
  </svg>
);
export const IconCrown = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" {...stroke}>
    <path d="M3 8l3.5 3L12 5l5.5 6L21 8l-1.5 10h-15L3 8Z" />
    <path d="M5 18h14" />
  </svg>
);
/* IconCheck already exists earlier in this file — reuse it. */
