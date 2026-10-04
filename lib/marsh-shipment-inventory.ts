import { designKey } from "./mat-availability";
import type { PortalOrder } from "./shipstation";
import { getSupabaseAdmin } from "./supabase-admin";

const ACCOUNT_SLUG = "marsh-supply";

export async function syncMarshShipmentInventory(orders: PortalOrder[]) {
  const shipments = orders
    .filter(
      (order) =>
        (order.status === "shipped" || order.status === "delivered") &&
        order.quantity > 0,
    )
    .map((order) => ({
      id: order.shipmentId ? `shipment:${order.shipmentId}` : `order:${order.id}:${order.trackingNumber || order.shipDate || "shipped"}`,
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
