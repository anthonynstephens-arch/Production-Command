import { getPortalSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const ACCOUNT_SLUG = "marsh-supply";
const designs: Record<string, string> = { whatupdoe: "Whatupdoe", "did-you-call-first": "Did You Call First?", "upside-down-welcome": "Upside Down Welcome", "marsh-supply": "Marsh Supply" };

export async function GET() {
  if (!await getPortalSession()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await getSupabaseAdmin().from("marsh_finished_mats").select("design_key,design_name,quantity,updated_at").eq("account_slug", ACCOUNT_SLUG).order("design_name");
  if (error) return Response.json({ error: "Could not load printed mats." }, { status: 500 });
  return Response.json({ designs: data ?? [] });
}

export async function POST(request: Request) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const designKey = String(body.designKey || "");
  const quantity = Math.trunc(Number(body.quantity));
  if (!designs[designKey] || !Number.isFinite(quantity) || quantity < 1 || quantity > 10000) return Response.json({ error: "Choose a design and valid print quantity." }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().rpc("marsh_print_finished_mats", { p_account_slug: ACCOUNT_SLUG, p_design_key: designKey, p_design_name: designs[designKey], p_quantity: quantity });
  if (error) return Response.json({ error: error.message.includes("Not enough blank mats") ? "Not enough blank mats are available for this print run." : "Could not record this print run." }, { status: 400 });
  return Response.json({ ok: true, ...data });
}
