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
  const quantity = Number(body.quantity);
  if (!Object.hasOwn(designs, designKey) || !Number.isSafeInteger(quantity) || quantity === 0 || Math.abs(quantity) > 10000) return Response.json({ error: "Choose a design and enter a whole quantity between -10,000 and 10,000, excluding zero." }, { status: 400 });
  if (quantity < 0) {
    const supabase = getSupabaseAdmin();
    const { data: current, error: readError } = await supabase.from("marsh_finished_mats")
      .select("quantity").eq("account_slug", ACCOUNT_SLUG).eq("design_key", designKey).single();
    if (readError || !current) return Response.json({ error: "Could not load printed stock. Please refresh and try again." }, { status: 500 });
    const nextQuantity = current.quantity + quantity;
    if (nextQuantity < 0) return Response.json({ error: `Only ${current.quantity} printed mats are on hand for this design.` }, { status: 400 });
    // Compare-and-set prevents a concurrent print run or shipment from being overwritten.
    const { data: updated, error: updateError } = await supabase.from("marsh_finished_mats")
      .update({ quantity: nextQuantity, updated_at: new Date().toISOString() })
      .eq("account_slug", ACCOUNT_SLUG).eq("design_key", designKey).eq("quantity", current.quantity)
      .select("quantity").maybeSingle();
    if (updateError) return Response.json({ error: "Could not adjust printed stock." }, { status: 500 });
    if (!updated) return Response.json({ error: "Stock changed while saving. Refresh and try again." }, { status: 409 });
    return Response.json({ ok: true, finishedMats: updated.quantity });
  }
  const { data, error } = await getSupabaseAdmin().rpc("marsh_print_finished_mats", { p_account_slug: ACCOUNT_SLUG, p_design_key: designKey, p_design_name: designs[designKey], p_quantity: quantity });
  if (error) return Response.json({ error: error.message.includes("Not enough blank mats") ? "Not enough blank mats are available for this print run." : "Could not record this print run." }, { status: 400 });
  return Response.json({ ok: true, ...data });
}
