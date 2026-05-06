"use client";

import {
  TopBar,
  BottomNav,
  ComingSoon,
  IconFamily,
  IconUser,
  IconBell,
  IconCheck,
} from "../_components/ui";

/**
 * Family sharing placeholder.
 *
 * Real implementation (last of the four — touches RLS hardest):
 *   - New tables: families, family_members (role: primary / member),
 *     family_invites (token, expires_at, accepted_at).
 *   - RLS rewrite on bookings, chats, journal entries to be visible to
 *     any family_member with access to the bookee.
 *   - Email-based invite flow with a secure /family/accept/<token>.
 *   - Identity switcher in TopBar so the active family member can
 *     see the right context.
 *   - Audit log: who saw what, when (privacy hygiene).
 */
export default function FamilyPage() {
  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Family sharing" back="/m/profile" />

      <ComingSoon
        hero={<IconFamily />}
        title="Bring the whole family in"
        description="Invite siblings, partners and adult children to share access to a loved one's bookings, chats and care journal — so everyone stays in the loop without forwarding messages."
        bullets={[
          {
            icon: <IconUser />,
            text: "Invite up to 5 family members to view bookings, chat and the care journal.",
          },
          {
            icon: <IconBell />,
            text: "Choose who gets notified when a carer arrives, posts a journal entry or sends a message.",
          },
          {
            icon: <IconCheck />,
            text: "Granular permissions — only the primary contact can book or pay; everyone else views and comments.",
          },
        ]}
        secondary={{ label: "Back to profile", href: "/m/profile" }}
      />

      <BottomNav active="profile" />
    </main>
  );
}
