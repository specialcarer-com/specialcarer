"use client";

import { useState } from "react";
import {
  TopBar,
  Button,
  Input,
  IconCard,
  IconCheck,
  IconPlus,
  IconTrash,
} from "../../_components/ui";

type Card = { id: string; brand: string; last4: string; exp: string; primary: boolean };

const SEED: Card[] = [
  { id: "p1", brand: "Visa", last4: "4242", exp: "08/27", primary: true },
  { id: "p2", brand: "Mastercard", last4: "5577", exp: "11/26", primary: false },
];

export default function PaymentMethodPage() {
  const [cards, setCards] = useState<Card[]>(SEED);
  const [adding, setAdding] = useState(false);
  const [num, setNum] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");

  function makePrimary(id: string) {
    setCards((cs) => cs.map((c) => ({ ...c, primary: c.id === id })));
  }

  function remove(id: string) {
    setCards((cs) => cs.filter((c) => c.id !== id));
  }

  function add() {
    const last4 = num.replace(/\s/g, "").slice(-4) || "0000";
    setCards((cs) => [
      ...cs,
      { id: `p${cs.length + 1}`, brand: "Card", last4, exp: exp || "12/29", primary: cs.length === 0 },
    ]);
    setNum("");
    setExp("");
    setCvc("");
    setName("");
    setAdding(false);
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-28">
      <TopBar title="Payment method" back="/m/profile" />

      <ul className="mt-2 flex flex-col gap-3 px-5">
        {cards.length === 0 && (
          <li className="rounded-card bg-white p-6 text-center text-sm text-subheading shadow-card">
            No payment methods yet.
          </li>
        )}
        {cards.map((c) => (
          <li
            key={c.id}
            className={`flex items-center gap-3 rounded-card bg-white p-4 shadow-card ${
              c.primary ? "ring-2 ring-primary" : ""
            }`}
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-50 text-primary">
              <IconCard />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-bold text-heading">
                {c.brand} •••• {c.last4}
              </p>
              <p className="mt-0.5 text-[12px] text-subheading">Expires {c.exp}</p>
              {c.primary && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-pill bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  <IconCheck /> Primary
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {!c.primary && (
                <button
                  onClick={() => makePrimary(c.id)}
                  className="rounded-pill bg-muted px-3 py-1 text-[11.5px] font-semibold text-heading"
                >
                  Set primary
                </button>
              )}
              <button
                onClick={() => remove(c.id)}
                className="grid h-7 w-full place-items-center rounded-pill bg-[#FFE9E9] text-[#D9534F]"
                aria-label="Remove"
              >
                <IconTrash />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="mt-4 flex flex-col gap-3 px-5">
          <Input
            label="Card number"
            inputMode="numeric"
            placeholder="4242 4242 4242 4242"
            value={num}
            onChange={(e) => setNum(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Expiry"
              placeholder="MM/YY"
              value={exp}
              onChange={(e) => setExp(e.target.value)}
            />
            <Input
              label="CVC"
              inputMode="numeric"
              placeholder="123"
              value={cvc}
              onChange={(e) => setCvc(e.target.value)}
            />
          </div>
          <Input
            label="Name on card"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="outline" block onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button block onClick={add} disabled={num.length < 4}>
              Add card
            </Button>
          </div>
          <p className="text-center text-[11px] text-subheading">
            Cards are tokenised by Stripe. We never store your full card number.
          </p>
        </div>
      )}

      {!adding && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
          <Button block onClick={() => setAdding(true)}>
            <span className="inline-flex items-center justify-center gap-2">
              <IconPlus /> Add new card
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}
