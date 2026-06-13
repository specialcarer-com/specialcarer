import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AdminLoginForm } from "./admin-login-form";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata = {
  title: "Admin sign-in — SpecialCarers",
  // Keep the admin login out of search indexes — discoverable by direct URL only.
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <div
      className={`${jakarta.variable} font-display min-h-screen bg-[#F4EFE6] text-[#0F1416] flex items-center justify-center px-6 py-16`}
    >
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-[0_1px_2px_rgba(15,20,22,0.04),0_8px_24px_rgba(15,20,22,0.06)] border border-[#0F1416]/5 p-8">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#039EA0]/10 text-[#039EA0] border border-[#039EA0]/20 text-[11px] font-bold uppercase tracking-wider">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-[#F4A261]"
              aria-hidden
            />
            Admin
          </span>

          <h1 className="mt-5 text-3xl font-bold tracking-tight">
            Admin sign-in
          </h1>
          <p className="mt-2 text-[#0F1416]/60">
            For SpecialCarers admins only
          </p>

          <div className="mt-8">
            <AdminLoginForm />
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-[#0F1416]/60">
          Not an admin?{" "}
          <Link
            href="/login"
            className="font-medium text-[#039EA0] hover:text-[#028688] underline"
          >
            Go to user sign-in
          </Link>
        </p>
      </div>
    </div>
  );
}
