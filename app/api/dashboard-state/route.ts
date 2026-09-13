import { getPortalSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const ACCOUNT_SLUG = "marsh-supply";

export async function GET() {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("marsh_dashboard_state").select("orders_in_production").eq("account_slug", ACCOUNT_SLUG).single();
  if (error) return Response.json({ error: "Could not load production count." }, { status: 500 });
  return Response.json({ ordersInProduction: Number(data.orders_in_production) });
}

export async function PATCH(request: Request) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const value = Number(body.ordersInProduction);
  if (!Number.isInteger(value) || value < 0) return Response.json({ error: "Enter a valid whole-number order count." }, { status: 400 });
  const db = getSupabaseAdmin();
  const { error } = await db.from("marsh_dashboard_state").upsert({ account_slug: ACCOUNT_SLUG, orders_in_production: value, updated_at: new Date().toISOString(), updated_by: session.userId }, { onConflict: "account_slug" });
  if (error) return Response.json({ error: "Could not save production count." }, { status: 500 });
  return Response.json({ ok: true, ordersInProduction: value });
}
