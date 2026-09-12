import { NextResponse } from "next/server";
import { getShipStationOrders } from "@/lib/shipstation";
import { getPortalSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  if (!await getPortalSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await getShipStationOrders();
  return NextResponse.json({ ...result, syncedAt: new Date().toISOString() });
}
