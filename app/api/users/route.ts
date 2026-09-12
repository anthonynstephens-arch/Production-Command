import { getPortalSession, hashPin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const session = await getPortalSession();
  if (session?.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403 });
  const { data, error } = await getSupabaseAdmin().from("marsh_portal_users").select("id,display_name,role,active,last_login,login_count,created_at").order("display_name");
  return error ? Response.json({ error: error.message }, { status: 400 }) : Response.json({ users: data });
}

export async function POST(request: Request) {
  const session = await getPortalSession();
  if (session?.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.name !== "string" || body.name.trim().length < 2 || !["admin","partner"].includes(body.role) || !/^\d{4,8}$/.test(body.pin ?? "")) return Response.json({ error: "Enter a name, role, and unique 4–8 digit PIN." }, { status: 400 });
  const { salt, hash } = hashPin(body.pin);
  const { error } = await getSupabaseAdmin().from("marsh_portal_users").insert({ display_name: body.name.trim(), role: body.role, pin_salt: salt, pin_hash: hash });
  return error ? Response.json({ error: error.code === "23505" ? "That PIN is already assigned." : error.message }, { status: 400 }) : Response.json({ ok: true }, { status: 201 });
}
