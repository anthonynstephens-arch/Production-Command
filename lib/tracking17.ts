import type { PortalOrder } from "./shipstation";

export type ShipmentTracking = {
  status: string; location: string | null; message: string;
  etaStart: string | null; etaEnd: string | null; etaSource: string | null;
  lastEventAt: string | null; checkedAt: string;
  events: Array<{ time: string | null; location: string | null; description: string }>;
};
type Event = { time_iso?: string; time_utc?: string; location?: string; description?: string; description_translation?: { description?: string }; address?: { city?: string; state?: string; country?: string } };
type TrackingRow = { number?: string; package_status?: string; track_info?: {
  latest_status?: { status?: string; sub_status_descr?: string };
  latest_event?: Event;
  time_metrics?: { estimated_delivery_date?: { from?: string; to?: string; source?: string } };
  tracking?: { providers?: Array<{ events?: Event[] }> };
} };
type TrackingResponse = { code?: number; data?: { accepted?: TrackingRow[]; rejected?: Array<{ number?: string }> } };
const endpoint = "https://api.17track.net/track/v2.4";
const cleanNumber = (number: string) => number.replace(/\s/g, "").toUpperCase();
async function request(path: string, body: unknown, key: string): Promise<TrackingResponse> {
  const response = await fetch(`${endpoint}/${path}`, {
    method: "POST", headers: { "17token": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`17TRACK HTTP ${response.status}`);
  const payload = await response.json() as TrackingResponse;
  if (payload.code !== 0) throw new Error(`17TRACK response ${payload.code}`);
  return payload;
}
const location = (event?: Event) => event?.location || [event?.address?.city, event?.address?.state, event?.address?.country].filter(Boolean).join(", ") || null;
export function normalizeTracking(row: TrackingRow): ShipmentTracking {
  const info = row.track_info;
  const events = (info?.tracking?.providers ?? []).flatMap(provider => provider.events ?? [])
    .sort((a,b) => (Date.parse(b.time_iso || b.time_utc || "") || 0) - (Date.parse(a.time_iso || a.time_utc || "") || 0));
  const latest = info?.latest_event || events[0];
  const eta = info?.time_metrics?.estimated_delivery_date;
  return {
    status: info?.latest_status?.status || row.package_status || "NotFound",
    location: location(latest),
    message: latest?.description_translation?.description || latest?.description || info?.latest_status?.sub_status_descr || "Awaiting carrier update",
    etaStart: eta?.from || null, etaEnd: eta?.to || null, etaSource: eta?.source || null,
    lastEventAt: latest?.time_iso || latest?.time_utc || null, checkedAt: new Date().toISOString(),
    events: events.map(event => ({ time: event.time_iso || event.time_utc || null, location: location(event), description: event.description_translation?.description || event.description || "Carrier update" })),
  };
}
/** Query registered numbers without per-refresh realtime charges. */
export async function apply17TrackDelivery(orders: PortalOrder[]): Promise<PortalOrder[]> {
  const key = process.env.TRACK17_API_KEY;
  const eligible = orders.filter(order => order.status !== "delivered" && order.trackingNumber);
  const numbers = [...new Set(eligible.map(order => cleanNumber(order.trackingNumber!)))];
  const results = new Map<string, ShipmentTracking>();
  const errors = new Set<string>();
  if (key) for (let index = 0; index < numbers.length; index += 40) {
    const batch = numbers.slice(index, index + 40);
    try {
      const existing = await request("gettracklist", { number: batch.join(","), page_no: 1 }, key);
      const registered = new Set((existing.data?.accepted ?? []).map(row => cleanNumber(row.number || "")));
      const missing = batch.filter(number => !registered.has(number));
      if (missing.length) await request("register", missing.map(number => ({ number, lang: "en" })), key);
      const details = await request("gettrackinfo", batch.map(number => ({ number })), key);
      for (const row of details.data?.accepted ?? []) if (row.number) results.set(cleanNumber(row.number), normalizeTracking(row));
      for (const row of existing.data?.accepted ?? []) if (row.number && !results.has(cleanNumber(row.number))) results.set(cleanNumber(row.number), normalizeTracking(row));
    } catch { batch.forEach(number => errors.add(number)); }
  }
  return orders.map(order => {
    if (order.status === "delivered" || !order.trackingNumber) return order;
    const number = cleanNumber(order.trackingNumber);
    const tracking = results.get(number);
    return { ...order, status: tracking?.status.toLowerCase() === "delivered" ? "delivered" : ["intransit", "outfordelivery", "availableforpickup"].includes(tracking?.status.toLowerCase() || "") ? "shipped" : order.status,
      tracking, trackingError: !key ? "17TRACK is not configured" : errors.has(number) ? "Tracking temporarily unavailable; try syncing again" : !tracking ? "Awaiting first carrier update" : undefined };
  });
}
