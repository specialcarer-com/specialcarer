import * as React from "react";
import { notFound } from "next/navigation";
import {
  CarerCard,
  CarerCardSkeleton,
  type CarerCardData,
} from "@/components/m/CarerCard";
import { isMobileRedesignEnabled } from "@/lib/mobile-redesign/flag";
import {
  getCarerQualifications,
  getCarerVerifiedStatus,
  qualificationChipLabel,
} from "@/lib/m/carer-qualifications";

/**
 * Dev-only visual gallery for <CarerCard> (PR-R1, extended in PR-R2).
 *
 * PR-R1 added the static sample sections. PR-R2 adds a flag-gated "Live data"
 * section that wires <CarerCard> to the real structured qualifications +
 * canonical verified_status via the src/lib/m/carer-qualifications helpers.
 * Pass ?carerId=<uuid> to render a real carer; with no id (or the flag off)
 * the section is skipped and only the static samples render.
 *
 * Hard-gated: returns 404 in production builds so it never ships. Not linked
 * from any nav. No production carer-card renderer is touched — that is PR-R4.
 */
export const dynamic = "force-dynamic";

const sample: CarerCardData = {
  id: "c1",
  displayName: "Sarah Okafor",
  avatarUrl: null,
  headlineRate: 18,
  distanceKm: 2.4,
  ratingAvg: 4.8,
  ratingCount: 23,
  verified: true,
  qualifications: ["NVQ L3", "RMN"],
};

const online: CarerCardData = {
  id: "c2",
  displayName: "James Patel",
  avatarUrl: null,
  headlineRate: 22.5,
  distanceKm: null,
  ratingAvg: 4.9,
  ratingCount: 1,
  verified: false,
  qualifications: ["Dementia Care"],
};

const sparse: CarerCardData = {
  id: "c3",
  displayName: "Mary",
  avatarUrl: null,
  headlineRate: null,
  distanceKm: 12,
  ratingAvg: null,
  ratingCount: null,
  verified: true,
  qualifications: [],
};

const empty: CarerCardData = {
  id: "c4",
  displayName: "",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-mobile-md">
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-subheading">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Build a CarerCardData from the PR-R2 structured helpers. Returns null on any
 * failure so the gallery still renders its static samples. Dev-only path.
 */
async function loadLiveCarer(
  carerId: string,
): Promise<CarerCardData | null> {
  try {
    const [quals, verified] = await Promise.all([
      getCarerQualifications(carerId),
      getCarerVerifiedStatus(carerId),
    ]);
    return {
      id: carerId,
      displayName: `Carer ${carerId.slice(0, 8)}`,
      avatarUrl: null,
      verified: verified.status === "verified",
      qualifications: quals.map(qualificationChipLabel),
    };
  } catch {
    return null;
  }
}

export default async function CardsDevPage({
  searchParams,
}: {
  searchParams: Promise<{ carerId?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { carerId } = await searchParams;
  const live =
    isMobileRedesignEnabled() && carerId
      ? await loadLiveCarer(carerId)
      : null;

  return (
    <main className="font-display mx-auto flex max-w-[680px] flex-col gap-mobile-xl bg-brand-cream p-mobile-lg">
      <header>
        <h1 className="text-[20px] font-extrabold text-brand-ink">
          CarerCard gallery
        </h1>
        <p className="text-[13px] text-subheading">
          PR-R1 dev preview — not shipped to production.
        </p>
      </header>

      {live && (
        <Section title="Live data (PR-R2, flag on)">
          <div className="flex flex-col gap-mobile-md">
            <CarerCard carer={live} variant="list" href="#" />
            <div className="grid grid-cols-2 gap-mobile-md">
              <CarerCard carer={live} variant="tile" href="#" />
              <CarerCard carer={live} variant="inline" href="#" />
            </div>
          </div>
        </Section>
      )}

      <Section title="Inline (carousel)">
        <div className="flex gap-mobile-md overflow-x-auto pb-mobile-sm">
          <CarerCard carer={sample} variant="inline" href="#" />
          <CarerCard carer={online} variant="inline" href="#" />
          <CarerCard carer={sparse} variant="inline" href="#" />
          <CarerCardSkeleton variant="inline" />
        </div>
      </Section>

      <Section title="Tile (grid)">
        <div className="grid grid-cols-2 gap-mobile-md">
          <CarerCard carer={sample} variant="tile" href="#" />
          <CarerCard carer={online} variant="tile" href="#" />
          <CarerCard carer={sparse} variant="tile" href="#" />
          <CarerCardSkeleton variant="tile" />
        </div>
      </Section>

      <Section title="List (full-width row)">
        <div className="flex flex-col gap-mobile-md">
          <CarerCard carer={sample} variant="list" href="#" />
          <CarerCard carer={online} variant="list" href="#" />
          <CarerCard carer={sparse} variant="list" href="#" />
          <CarerCardSkeleton variant="list" />
        </div>
      </Section>

      <Section title="Empty state">
        <div className="grid grid-cols-3 gap-mobile-md">
          <CarerCard carer={empty} variant="inline" />
          <CarerCard carer={empty} variant="tile" />
          <CarerCard carer={empty} variant="list" />
        </div>
      </Section>
    </main>
  );
}
