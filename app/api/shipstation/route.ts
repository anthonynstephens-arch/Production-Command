import { NextResponse } from "next/server";
import { getShipStationOrders } from "@/lib/shipstation";
import { getPortalSession } from "@/lib/auth";
import { syncMarshShipmentInventory } from "@/lib/marsh-shipment-inventory";

export const runtime = "nodejs";

export async function GET() {
  if (!await getPortalSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await getShipStationOrders();
  const inventorySync = result.connected
    ? await syncMarshShipmentInventory(result.orders)
    : { ok: false, error: "ShipStation is not connected." };
  return NextResponse.json({ ...result, inventorySync, syncedAt: new Date().toISOString() });
}
