import { designKey } from "./mat-availability";
import type { PortalOrder } from "./shipstation";
import { getSupabaseAdmin } from "./supabase-admin";

const ACCOUNT_SLUG = "marsh-supply";
const SHIPMENT_RECONCILIATION_CUTOFF = Date.parse("2026-09-18T03:51:19.685696Z");

export async function syncMarshShipmentInventory(orders: PortalOrder[]) {
  const shipments = orders
    .filter(
      (order) => {
        if ((order.status !== "shipped" && order.status !== "delivered") || order.quantity <= 0) return false;
        const shippedAt = order.shipDate ? Date.parse(order.shipDate) : NaN;
        return Number.isFinite(shippedAt) && shippedAt > SHIPMENT_RECONCILIATION_CUTOFF;
      },
    )
    .map((order) => ({
      id: `order:${order.id}`,
      units: order.quantity,
      designs: (
        order.items?.length
          ? order.items
          : [{ name: order.item, quantity: order.quantity }]
      ).flatMap((item) => {
        const key = designKey(item.name);
        return key ? [{ key, quantity: item.quantity }] : [];
      }),
    }));

  if (!shipments.length) {
    return { ok: true, processedShipments: 0, processedUnits: 0 };
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc("sync_marsh_shipment_inventory", {
    p_account_slug: ACCOUNT_SLUG,
    p_shipments: shipments,
  });

  if (error) {
    console.error("Could not sync Marsh shipment inventory:", error);
    return { ok: false, error: error.message };
  }

  return { ok: true, ...(data ?? {}) };
}
