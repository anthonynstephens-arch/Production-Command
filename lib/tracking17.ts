import type { PortalOrder } from "./shipstation";

type TrackingRow = { number?: string; package_status?: string };
type TrackingResponse = {
  code?: number;
  data?: {
    accepted?: TrackingRow[];
  };
};

const endpoint = "https://api.17track.net/track/v2.4";
const cleanNumber = (number: string) => number.replace(/\s/g, "").toUpperCase();

async function request<T>(path: string, body: unknown, key: string): Promise<T> {
  const response = await fetch(`${endpoint}/${path}`, {
    method: "POST",
    headers: { "17token": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`17TRACK HTTP ${response.status}`);
  const payload = await response.json() as T & { code?: number };
  if (payload.code !== 0) throw new Error(`17TRACK response ${payload.code}`);
  return payload;
}

/** Only registered tracking numbers can report delivery. Register recent new
 * shipments once; querying already registered numbers never consumes quota. */
export async function apply17TrackDelivery(orders: PortalOrder[]): Promise<PortalOrder[]> {
  const key = process.env.TRACK17_API_KEY;
  if (!key) return orders;

  const shipped = orders.filter(order => order.status === "shipped" && order.trackingNumber);
  const numbers = [...new Set(shipped.map(order => cleanNumber(order.trackingNumber!)))];
  if (!numbers.length) return orders;

  const delivered = new Set<string>();
  try {
    for (let index = 0; index < numbers.length; index += 40) {
      const batch = numbers.slice(index, index + 40);
      const existing = await request<TrackingResponse>("gettracklist", { number: batch.join(","), page_no: 1 }, key);
      const registered = new Set<string>();
      for (const row of existing.data?.accepted ?? []) {
        if (!row.number) continue;
        const number = cleanNumber(row.number);
        registered.add(number);
        if (row.package_status?.toLowerCase() === "delivered") delivered.add(number);
      }

      // Avoid spending the free registration quota on old ShipStation history.
      const recent = shipped.filter(order =>
        order.trackingNumber && batch.includes(cleanNumber(order.trackingNumber)) &&
        Date.parse(order.shipDate ?? "") > Date.now() - 30 * 86400000,
      );
      const newNumbers = [...new Set(recent.map(order => cleanNumber(order.trackingNumber!)))].filter(number => !registered.has(number));
      if (newNumbers.length) {
        await request<TrackingResponse>("register", newNumbers.map(number => ({ number })), key);
      }
    }
  } catch {
    // Keep ShipStation's confirmed shipped state on tracking service failures.
  }

  return orders.map(order => order.trackingNumber && delivered.has(cleanNumber(order.trackingNumber))
    ? { ...order, status: "delivered" } : order);
}
