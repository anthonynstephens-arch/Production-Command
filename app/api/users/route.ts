import { getPortalSession, hashPin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const session = await getPortalSession();
  if (session?.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403 });
  const { data, error } = await getSupabaseAdmin().from("marsh_portal_users").select("id,display_name,email,role,active,must_change_pin,last_login,login_count,created_at").order("display_name");
  return error ? Response.json({ error: error.message }, { status: 400 }) : Response.json({ users: data });
}

export async function POST(request: Request) {
  const session = await getPortalSession();
  if (session?.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.name !== "string" || body.name.trim().length < 2 || !["admin","partner"].includes(body.role) || !/^\d{4,8}$/.test(body.pin ?? "")) return Response.json({ error: "Enter a name, role, and unique 4–8 digit PIN." }, { status: 400 });
  const { salt, hash } = hashPin(body.pin);
  const password = typeof body.password === "string" && body.password.length >= 8 ? hashPin(body.password) : null;
  const { error } = await getSupabaseAdmin().from("marsh_portal_users").insert({ display_name: body.name.trim(), email: typeof body.email === "string" && body.email.includes("@") ? body.email.trim().toLowerCase() : null, role: body.role, pin_salt: salt, pin_hash: hash, password_salt:password?.salt ?? null, password_hash:password?.hash ?? null, must_change_pin:true });
  return error ? Response.json({ error: error.code === "23505" ? "That PIN is already assigned." : error.message }, { status: 400 }) : Response.json({ ok: true }, { status: 201 });
}
