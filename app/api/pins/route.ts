import { getPortalSession, hashPin, setPortalSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!/^\d{4,8}$/.test(body.pin ?? "")) return Response.json({ error: "Choose a 4–8 digit PIN." }, { status: 400 });
  const { salt, hash } = hashPin(body.pin);
  const { error } = await getSupabaseAdmin().from("marsh_portal_users").update({ pin_salt:salt, pin_hash:hash, must_change_pin:false }).eq("id",session.userId);
  if (error) return Response.json({ error:error.code === "23505" ? "That PIN is already assigned to another account." : error.message }, { status:400 });
  await setPortalSession({ userId:session.userId, name:session.name, role:session.role, mustChangePin:false });
  return Response.json({ ok:true });
}
