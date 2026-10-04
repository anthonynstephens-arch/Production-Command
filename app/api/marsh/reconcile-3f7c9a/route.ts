import { NextResponse } from "next/server";
import { getShipStationOrders } from "@/lib/shipstation";
import { syncMarshShipmentInventory } from "@/lib/marsh-shipment-inventory";

export const runtime = "nodejs";

export async function GET() {
  const result = await getShipStationOrders();
  if (!result.connected) {
    return NextResponse.json({ ok: false, error: result.message || "ShipStation unavailable" }, { status: 503 });
  }
  const inventorySync = await syncMarshShipmentInventory(result.orders);
  return NextResponse.json({ ok: inventorySync.ok, inventorySync, orderCount: result.orders.length });
}
