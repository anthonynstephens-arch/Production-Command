import { NextResponse } from "next/server";
import { getShipStationOrders } from "@/lib/shipstation";

export const runtime = "nodejs";

export async function GET() {
  const result = await getShipStationOrders();
  return NextResponse.json({ ...result, syncedAt: new Date().toISOString() });
}
