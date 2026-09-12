export type PortalOrder = {
  id: string;
  orderNumber: string;
  customer: string;
  item: string;
  quantity: number;
  status: "pending" | "shipped" | "delivered";
  orderDate: string;
  shipDate?: string;
  trackingNumber?: string;
  carrier?: string;
};

type ShipStationShipment = {
  shipment_id?: string;
  external_shipment_id?: string;
  order_number?: string;
  ship_to?: { name?: string };
  items?: Array<{ name?: string; quantity?: number }>;
  shipment_status?: string;
  created_at?: string;
  ship_date?: string;
  tracking_number?: string;
  carrier_code?: string;
};

type LegacyShipStationOrder = {
  orderId?: number;
  orderNumber?: string;
  orderStatus?: string;
  customerName?: string;
  orderDate?: string;
  shipDate?: string;
  trackingNumber?: string;
  carrierCode?: string;
  items?: Array<{ name?: string; quantity?: number }>;
};

const demoOrders: PortalOrder[] = [
  { id: "demo-1", orderNumber: "MS-1087", customer: "Danielle Carter", item: "Whatupdoe Welcome Mat", quantity: 1, status: "pending", orderDate: "2026-09-12T13:20:00Z" },
  { id: "demo-2", orderNumber: "MS-1086", customer: "Marcus Hill", item: "Did You Call First Mat", quantity: 2, status: "pending", orderDate: "2026-09-12T10:05:00Z" },
  { id: "demo-3", orderNumber: "MS-1084", customer: "Keisha Brown", item: "Whatupdoe Welcome Mat", quantity: 1, status: "shipped", orderDate: "2026-09-10T14:15:00Z", shipDate: "2026-09-12T09:10:00Z", trackingNumber: "1Z8Y03W90378124510", carrier: "UPS" },
  { id: "demo-4", orderNumber: "MS-1079", customer: "Terrence Williams", item: "Whatupdoe Welcome Mat", quantity: 1, status: "delivered", orderDate: "2026-09-06T15:35:00Z", shipDate: "2026-09-08T12:30:00Z", trackingNumber: "9400111899560000001024", carrier: "USPS" },
];

function normalizeStatus(value?: string): PortalOrder["status"] {
  const status = value?.toLowerCase() ?? "pending";
  if (status.includes("deliver")) return "delivered";
  if (status.includes("ship") || status.includes("label")) return "shipped";
  return "pending";
}

export async function getShipStationOrders(): Promise<{ orders: PortalOrder[]; connected: boolean; message?: string }> {
  const apiKey = process.env.SHIPSTATION_API_KEY;
  const apiSecret = process.env.SHIPSTATION_API_SECRET;
  if (!apiKey) return { orders: demoOrders, connected: false, message: "Add the ShipStation API key to activate live syncing." };

  try {
    // Accounts that provide both an API key and secret use ShipStation's
    // orders API.  It includes awaiting-shipment orders and the customer's
    // name; the shipments API only returns shipments and therefore makes
    // every result appear shipped.
    if (apiSecret) {
      const legacy = await fetch("https://ssapi.shipstation.com/orders?pageSize=100&sortBy=OrderDate&sortDir=DESC", {
        headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`, Accept: "application/json" },
        cache: "no-store",
      });
      if (!legacy.ok) throw new Error(`ShipStation authentication failed (${legacy.status}).`);
      const payload = await legacy.json() as { orders?: LegacyShipStationOrder[] };
      const orders = (payload.orders ?? []).filter(order => order.orderStatus?.toLowerCase() !== "cancelled").map((order, index): PortalOrder => ({
        id: String(order.orderId ?? `legacy-${index}`), orderNumber: order.orderNumber ?? "Unnumbered", customer: order.customerName?.trim() || "Customer",
        item: order.items?.map(item => item.name).filter(Boolean).join(", ") || "Marsh Supply order",
        quantity: order.items?.reduce((sum, item) => sum + (item.quantity ?? 1), 0) ?? 1,
        status: normalizeStatus(order.orderStatus), orderDate: order.orderDate ?? new Date().toISOString(), shipDate: order.shipDate,
        trackingNumber: order.trackingNumber, carrier: order.carrierCode?.toUpperCase(),
      }));
      return { orders, connected: true, message: "Connected to ShipStation orders." };
    }

    const response = await fetch("https://api.shipstation.com/v2/shipments?page_size=100&sort_dir=desc", {
      headers: { "api-key": apiKey, Accept: "application/json" },
      cache: "no-store",
    });
    if (response.ok) {
      const payload = await response.json() as { shipments?: ShipStationShipment[] };
      const orders = (payload.shipments ?? []).map((shipment, index): PortalOrder => ({
        id: shipment.shipment_id ?? shipment.external_shipment_id ?? `shipment-${index}`,
        orderNumber: shipment.order_number ?? "Unnumbered",
        customer: shipment.ship_to?.name ?? "Customer",
        item: shipment.items?.map((item) => item.name).filter(Boolean).join(", ") || "Marsh Supply order",
        quantity: shipment.items?.reduce((sum, item) => sum + (item.quantity ?? 1), 0) ?? 1,
        status: normalizeStatus(shipment.shipment_status), orderDate: shipment.created_at ?? new Date().toISOString(), shipDate: shipment.ship_date,
        trackingNumber: shipment.tracking_number, carrier: shipment.carrier_code?.toUpperCase(),
      }));
      return { orders, connected: true };
    }
    throw new Error(`ShipStation API returned ${response.status}.`);
  } catch (error) {
    return { orders: demoOrders, connected: false, message: error instanceof Error ? error.message : "ShipStation sync unavailable" };
  }
}
