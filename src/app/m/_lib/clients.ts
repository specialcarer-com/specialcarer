export type Client = {
  id: string;
  name: string;
  city: string;
  service: "Childcare" | "Elderly care" | "Postnatal support" | "Special-needs";
  avatar: string;
  status: "Active" | "Past";
  startedAt: string;
  phone: string;
  email: string;
  notes: string;
  totalBookings: number;
  totalHours: number;
};

export const CLIENTS: Client[] = [
  {
    id: "cli_001",
    name: "Bessie Cooper",
    city: "Camden, London",
    service: "Childcare",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200",
    status: "Active",
    startedAt: "Mar 2025",
    phone: "+44 7700 900123",
    email: "bessie@example.com",
    notes:
      "Two children — Lily (4) and Tom (7). Lily has a peanut allergy. School pick-up at 3:15pm.",
    totalBookings: 18,
    totalHours: 84,
  },
  {
    id: "cli_002",
    name: "Cody Fisher",
    city: "Bristol",
    service: "Special-needs",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200",
    status: "Active",
    startedAt: "Apr 2025",
    phone: "+44 7700 900456",
    email: "cody@example.com",
    notes:
      "9-year-old with autism. Prefers calm routines, sensory toys in the green box on the shelf.",
    totalBookings: 12,
    totalHours: 56,
  },
  {
    id: "cli_003",
    name: "Robert Fox",
    city: "Manchester",
    service: "Elderly care",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200",
    status: "Past",
    startedAt: "Jan 2025",
    phone: "+44 7700 900789",
    email: "robert@example.com",
    notes:
      "Mobility-limited, walks short distances with a stick. Loves crosswords and chess.",
    totalBookings: 6,
    totalHours: 28,
  },
];

export function getClient(id: string): Client | undefined {
  return CLIENTS.find((c) => c.id === id);
}
