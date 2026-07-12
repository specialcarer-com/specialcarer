import { createClient } from "@/lib/supabase/server";
import { handleUsualSlot } from "@/lib/predictions/usual-slot-handler";
import type { UsualSlotClient } from "@/lib/predictions/usualSlot";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return handleUsualSlot({
    userId: user?.id ?? null,
    client: supabase as unknown as UsualSlotClient,
  });
}
