import { getPortalSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const ACCOUNT_SLUG = "marsh-supply";

const itemMap = {
  mats: { item_key: "blank_mats", unit: "mats" },
  boxes: { item_key: "shipping_boxes", unit: "boxes" },
  ink: { item_key: "ink", unit: "percent" },
  tape: { item_key: "packing_tape", unit: "rolls" },
  tapeCoverage: { item_key: "packing_tape_coverage", unit: "mats_per_roll" },
  tapeUsage: { item_key: "packing_tape_usage", unit: "mat_uses" },
  thankYouCards: { item_key: "thank_you_cards", unit: "cards" },
  polyBags: { item_key: "poly_bags", unit: "bags" },
} as const;

type SupplyKey = keyof typeof itemMap;

export async function GET() {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("marsh_inventory")
    .select("item_key,quantity")
    .eq("account_slug", ACCOUNT_SLUG);

  if (error) return Response.json({ error: "Could not load inventory." }, { status: 500 });

  const inventory: Partial<Record<SupplyKey, number>> = {};
  for (const [key, definition] of Object.entries(itemMap) as [SupplyKey, (typeof itemMap)[SupplyKey]][]) {
    const row = data?.find((item) => item.item_key === definition.item_key);
    if (row) inventory[key] = Number(row.quantity);
  }

  return Response.json({ inventory });
}

export async function POST(request: Request) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const shipments = Array.isArray(body.shipments) ? body.shipments.slice(0, 500).map((shipment: unknown) => {
    const record = shipment && typeof shipment === "object" ? shipment as Record<string, unknown> : {};
    const designs = Array.isArray(record.designs) ? record.designs.slice(0, 20).map((design: unknown) => {
      const item = design && typeof design === "object" ? design as Record<string, unknown> : {};
      return { key: String(item.key || "").slice(0, 80), quantity: Math.max(0, Math.trunc(Number(item.quantity) || 0)) };
    }).filter((design: { key: string; quantity: number }) => design.key && design.quantity > 0) : [];
    return { id: String(record.id || "").slice(0, 160), units: Math.max(0, Math.trunc(Number(record.units) || 0)), designs };
  }).filter((shipment: { id: string; units: number }) => shipment.id && shipment.units > 0) : [];

  if (!shipments.length) return Response.json({ ok: true, processedShipments: 0, processedUnits: 0 });

  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc("sync_marsh_shipment_inventory", {
    p_account_slug: ACCOUNT_SLUG,
    p_shipments: shipments,
  });
  if (error) return Response.json({ error: "Could not apply shipment inventory usage." }, { status: 500 });
  return Response.json({ ok: true, ...data });
}

export async function PATCH(request: Request) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const key = body.key as SupplyKey;
  const value = Number(body.value);
  if (!(key in itemMap) || !Number.isFinite(value) || value < 0) {
    return Response.json({ error: "Enter a valid inventory level." }, { status: 400 });
  }

  const normalized = key === "ink" ? Math.min(100, value) : value;
  const definition = itemMap[key];
  const db = getSupabaseAdmin();
  const { error } = await db.from("marsh_inventory").upsert({
    account_slug: ACCOUNT_SLUG,
    item_key: definition.item_key,
    quantity: normalized,
    unit: definition.unit,
    updated_at: new Date().toISOString(),
    // Portal sessions are backed by marsh_portal_users, while older database
    // installations may still constrain this column to auth.users. Keeping
    // the actor nullable avoids rejecting valid portal-admin inventory edits.
    updated_by: null,
  }, { onConflict: "account_slug,item_key" });

  if (error) return Response.json({ error: "Could not save inventory." }, { status: 500 });
  return Response.json({ ok: true, key, value: normalized });
}
