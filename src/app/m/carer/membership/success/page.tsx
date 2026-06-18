import Link from "next/link";
import { TopBar, BottomNav, Card, IconCrown } from "../../../_components/ui";

/**
 * Post-checkout landing (Stripe success_url). The carer_memberships row is
 * reconciled asynchronously by the webhook, so we don't assert entitlement
 * here — we confirm the payment flow completed and point the carer back to
 * their membership / profile. The membership page reflects active status once
 * the webhook lands (typically within seconds).
 */
export const dynamic = "force-dynamic";

export default function CarerMembershipSuccessPage() {
  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Welcome" back="/m/carer/membership" />
      <section className="px-5 pt-8 pb-10">
        <Card className="p-6 text-center">
          <span
            className="mx-auto grid h-16 w-16 place-items-center rounded-full text-primary"
            style={{ background: "rgba(3,158,160,0.15)" }}
            aria-hidden
          >
            <IconCrown />
          </span>
          <h1 className="mt-4 text-[22px] font-bold text-heading">
            You&apos;re a Founding Carer
          </h1>
          <p className="mt-2 text-[14px] text-subheading">
            Thank you for joining. Your membership is being activated — it can
            take a few seconds to appear. You can now publish your public
            profile and start matching with families.
          </p>

          <Link
            href="/m/profile/edit"
            className="mt-6 inline-flex h-14 w-full items-center justify-center rounded-btn bg-primary px-6 text-[16px] font-bold text-white shadow-sm active:bg-primary-600"
          >
            Publish my profile
          </Link>
          <Link
            href="/m/carer/membership"
            className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-btn bg-primary-50 px-5 text-[15px] font-bold text-primary active:bg-primary-100"
          >
            View membership
          </Link>
        </Card>
      </section>
      <BottomNav active="profile" />
    </main>
  );
}
