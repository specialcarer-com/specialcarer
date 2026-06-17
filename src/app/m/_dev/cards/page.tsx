import * as React from "react";
import { notFound } from "next/navigation";
import {
  CarerCard,
  CarerCardSkeleton,
  type CarerCardData,
} from "@/components/m/CarerCard";

/**
 * Dev-only visual gallery for <CarerCard> (PR-R1). Lets a reviewer eyeball
 * all three variants + skeletons + edge cases without wiring real data.
 *
 * Hard-gated: 404 only on real prod (VERCEL_ENV=production), available on dev
 * + Vercel previews. Not linked from any nav.
 */
export const dynamic = "force-static";

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

export default function CardsDevPage() {
  // 404 on real production (Vercel target = 'production'). Allowed on dev + Vercel previews.
  if (process.env.VERCEL_ENV === "production") notFound();

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
