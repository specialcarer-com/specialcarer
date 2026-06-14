/**
 * Pure handler for GET /api/m/predictions/usual-slot.
 *
 * Auth is modelled as handler input (a resolved `userId` or null) so route
 * tests can cover 200/204/401 without mocking next/headers + cookies
 * (matches the pure-handler pattern across this codebase). Split out of the
 * route file because Next.js route modules may only export route methods.
 */
import { NextResponse } from "next/server";
import { detectUsualSlot, type UsualSlotClient } from "./usualSlot";

export async function handleUsualSlot(args: {
  userId: string | null;
  client: UsualSlotClient;
}): Promise<NextResponse> {
  if (!args.userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const slot = await detectUsualSlot({
    seekerId: args.userId,
    client: args.client,
  });
  if (!slot) {
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json(slot);
}
