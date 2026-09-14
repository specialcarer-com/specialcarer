/**
 * Presentation-only component for the read-only care-plan view.
 * Shared between the web (`/family/recipients/[id]/care-plan`) and
 * mobile (`/m/family/recipients/[id]/care-plan`) routes so both
 * surfaces show identical content.
 */
import type { FamilyCarePlanView } from "@/lib/care-plan/family-view";

export default function CarePlanView({ view }: { view: FamilyCarePlanView }) {
  const { recipient, plan, medications, allergies } = view;

  if (!plan) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-900">
          Your family&apos;s care plan will appear here once care starts.
        </p>
        <p className="mt-1 text-sm text-slate-600">
          No care plan has been created for {recipient.display_name} yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Recipient">
        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          <dt className="text-slate-500">Name</dt>
          <dd className="text-slate-900">
            {plan.recipient_name ?? recipient.display_name}
          </dd>
          {plan.recipient_dob ? (
            <>
              <dt className="text-slate-500">Date of birth</dt>
              <dd className="text-slate-900">{plan.recipient_dob}</dd>
            </>
          ) : null}
          {(plan.address_line1 ?? plan.city ?? plan.postcode) ? (
            <>
              <dt className="text-slate-500">Address</dt>
              <dd className="text-slate-900">
                {[plan.address_line1, plan.address_line2, plan.city, plan.postcode]
                  .filter(Boolean)
                  .join(", ")}
              </dd>
            </>
          ) : null}
        </dl>
      </SectionCard>

      {plan.goals && plan.goals.length > 0 ? (
        <SectionCard title="Care goals">
          <ul className="list-disc pl-5 text-sm text-slate-900 space-y-1">
            {plan.goals.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {plan.special_instructions ? (
        <SectionCard title="Special instructions">
          <p className="whitespace-pre-wrap text-sm text-slate-900">
            {plan.special_instructions}
          </p>
        </SectionCard>
      ) : null}

      {plan.routine_notes ? (
        <SectionCard title="Routine notes">
          <p className="whitespace-pre-wrap text-sm text-slate-900">
            {plan.routine_notes}
          </p>
        </SectionCard>
      ) : null}

      <SectionCard title="Medications">
        {medications.length === 0 ? (
          <p className="text-sm text-slate-600">No medications recorded.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Dose</th>
                <th className="py-2 pr-3">Schedule</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {medications.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-3 font-medium text-slate-900">
                    {m.name}
                  </td>
                  <td className="py-2 pr-3 text-slate-700">{m.dose ?? "—"}</td>
                  <td className="py-2 pr-3 text-slate-700">
                    {m.schedule ?? "—"}
                  </td>
                  <td className="py-2 text-slate-700">{m.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title="Allergies">
        {allergies.length === 0 ? (
          <p className="text-sm text-slate-600">No allergies recorded.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Substance</th>
                <th className="py-2 pr-3">Severity</th>
                <th className="py-2 pr-3">Reaction</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allergies.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 pr-3 font-medium text-slate-900">
                    {a.substance}
                  </td>
                  <td className="py-2 pr-3 text-slate-700">
                    {a.severity ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-slate-700">
                    {a.reaction ?? "—"}
                  </td>
                  <td className="py-2 text-slate-700">{a.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <p className="text-xs text-slate-500">
        Read-only view for family members. Contact the primary carer or admin
        to update the plan.
      </p>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white border border-slate-200 p-6">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">{title}</h2>
      {children}
    </section>
  );
}
