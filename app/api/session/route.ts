import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { setPortalSession, verifyPin } from "@/lib/auth";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    console.error("Marsh portal sign-in configuration error", error);
    return Response.json({ error: "Portal sign-in has not been connected yet. Ask the administrator to finish the deployment setup." }, { status: 503 });
  }
  const { data: attempt } = await supabase.from("marsh_pin_attempts").select("failed_count,blocked_until").eq("ip_address", ip).maybeSingle();
  if (attempt?.blocked_until && new Date(attempt.blocked_until).getTime() > Date.now()) return Response.json({ error: "Too many incorrect attempts. Try again in 15 minutes." }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "email" ? "email" : "pin";
  const pin = typeof body.pin === "string" ? body.pin : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (mode === "pin" && !/^\d{4,8}$/.test(pin)) return Response.json({ error: "Enter your 4–8 digit PIN." }, { status: 400 });
  if (mode === "email" && (!email.includes("@") || password.length < 8)) return Response.json({ error: "Enter your email and password." }, { status: 400 });
  const { data: users, error } = await supabase.from("marsh_portal_users").select("id,display_name,role,pin_salt,pin_hash,email,password_salt,password_hash,must_change_pin,login_count").eq("active", true);
  if (error) return Response.json({ error: "Sign-in is temporarily unavailable." }, { status: 503 });
  const user = mode === "pin"
    ? users?.find((candidate) => verifyPin(pin, candidate.pin_salt, candidate.pin_hash))
    : users?.find((candidate) => candidate.email?.toLowerCase() === email && candidate.password_salt && candidate.password_hash && verifyPin(password, candidate.password_salt, candidate.password_hash));
  if (!user) {
    const failures = (attempt?.failed_count ?? 0) + 1;
    await supabase.from("marsh_pin_attempts").upsert({ ip_address: ip, failed_count: failures >= 5 ? 0 : failures, blocked_until: failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null, updated_at: new Date().toISOString() });
    return Response.json({ error: failures >= 5 ? "Too many incorrect attempts. Try again in 15 minutes." : "PIN not accepted." }, { status: failures >= 5 ? 429 : 401 });
  }
  await Promise.all([
    supabase.from("marsh_pin_attempts").delete().eq("ip_address", ip),
    supabase.from("marsh_portal_users").update({ last_login: new Date().toISOString(), login_count: user.login_count + 1 }).eq("id", user.id),
    supabase.from("marsh_login_events").insert({ user_id: user.id, ip_address: ip }),
  ]);
  try {
    await setPortalSession({ userId: user.id, name: user.display_name, role: user.role, mustChangePin: user.must_change_pin });
  } catch (error) {
    console.error("Marsh portal session configuration error", error);
    return Response.json({ error: "Portal sign-in has not been connected yet. Ask the administrator to finish the deployment setup." }, { status: 503 });
  }
  return Response.json({ ok: true, mustChangePin: user.must_change_pin });
}
