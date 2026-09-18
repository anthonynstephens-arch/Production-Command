import { getPortalSession, hashPin, verifyPin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const session = await getPortalSession();
  if (session?.role !== "admin" || session.mustChangePin) return Response.json({ error: "Admin access required." }, { status: 403 });
  const { data, error } = await getSupabaseAdmin().from("marsh_portal_users").select("id,display_name,email,role,active,must_change_pin,last_login,login_count,created_at").order("display_name");
  return error ? Response.json({ error: error.message }, { status: 400 }) : Response.json({ users: data });
}

export async function POST(request: Request) {
  const session = await getPortalSession();
  if (session?.role !== "admin" || session.mustChangePin) return Response.json({ error: "Admin access required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.name !== "string" || body.name.trim().length < 2 || !["admin","partner"].includes(body.role) || !/^\d{4,8}$/.test(body.pin ?? "")) return Response.json({ error: "Enter a name, role, and unique 4–8 digit PIN." }, { status: 400 });
  const { data: existing, error: lookupError } = await getSupabaseAdmin().from("marsh_portal_users").select("pin_salt,pin_hash").eq("active",true);
  if (lookupError) return Response.json({error:"Could not verify PIN availability. Please retry."},{status:500});
  if (existing?.some(user=>verifyPin(body.pin,user.pin_salt,user.pin_hash))) return Response.json({error:"That PIN is already assigned. Choose another PIN."},{status:409});
  const { salt, hash } = hashPin(body.pin);
  const password = typeof body.password === "string" && body.password.length >= 8 ? hashPin(body.password) : null;
  const email = typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ? body.email.trim().toLowerCase() : null;
  const db=getSupabaseAdmin();
  const { data:user,error } = await db.from("marsh_portal_users").insert({ display_name: body.name.trim(), email, role: body.role, pin_salt: salt, pin_hash: hash, password_salt:password?.salt ?? null, password_hash:password?.hash ?? null, must_change_pin:true }).select("id").single();
  if(!error&&user)await db.from("marsh_notification_preferences").upsert({user_id:user.id,channel:email?'email':'none',email,chat:true,billing:true,supplies:true,shipping_issues:true,updated_at:new Date().toISOString()});
  return error ? Response.json({ error: error.code === "23505" ? "That PIN is already assigned." : error.message }, { status: 400 }) : Response.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await getPortalSession();
  if (session?.role !== "admin" || session.mustChangePin) return Response.json({ error: "Admin access required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (body.action === "resetPin") {
    if (typeof body.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.userId) || !/^\d{4,8}$/.test(body.pin ?? "")) {
      return Response.json({ error: "Choose a member and enter a temporary 4–8 digit PIN." }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { data: target, error: targetError } = await db
      .from("marsh_portal_users")
      .select("id,display_name")
      .eq("id", body.userId)
      .eq("active", true)
      .maybeSingle();
    if (targetError) return Response.json({ error: "Could not load that member. Please retry." }, { status: 500 });
    if (!target) return Response.json({ error: "That active member could not be found." }, { status: 404 });

    const { data: existing, error: lookupError } = await db
      .from("marsh_portal_users")
      .select("pin_salt,pin_hash")
      .eq("active", true)
      .neq("id", body.userId);
    if (lookupError) return Response.json({ error: "Could not verify PIN availability. Please retry." }, { status: 500 });
    if (existing?.some((user) => verifyPin(body.pin, user.pin_salt, user.pin_hash))) {
      return Response.json({ error: "That PIN is already assigned. Choose another PIN." }, { status: 409 });
    }

    const { salt, hash } = hashPin(body.pin);
    const { data: updated, error } = await db
      .from("marsh_portal_users")
      .update({ pin_salt: salt, pin_hash: hash, must_change_pin: true })
      .eq("id", body.userId)
      .eq("active", true)
      .select("id")
      .maybeSingle();
    if (error) return Response.json({ error: error.code === "23505" ? "That PIN is already assigned." : error.message }, { status: 400 });
    if (!updated) return Response.json({ error: "That active member could not be found." }, { status: 404 });

    return Response.json({ ok: true, memberName: target.display_name });
  }

  if (typeof body.userId !== "string" || typeof body.email !== "string" || !body.email.includes("@") || typeof body.password !== "string" || body.password.length < 8) return Response.json({ error: "Enter a valid email and a temporary password of at least 8 characters." }, { status: 400 });
  const password = hashPin(body.password);
  const db=getSupabaseAdmin(),email=body.email.trim().toLowerCase();
  const { error } = await db.from("marsh_portal_users").update({ email, password_salt:password.salt, password_hash:password.hash }).eq("id",body.userId);
  if(!error){const {data:pref}=await db.from('marsh_notification_preferences').select('channel').eq('user_id',body.userId).maybeSingle();const channel=pref?.channel==='push'||pref?.channel==='both'?'both':'email';await db.from('marsh_notification_preferences').upsert({user_id:body.userId,email,channel,chat:true,billing:true,supplies:true,shipping_issues:true,updated_at:new Date().toISOString()});}
  return error ? Response.json({ error:error.code === "23505" ? "That email is already assigned." : error.message }, { status:400 }) : Response.json({ ok:true });
}
