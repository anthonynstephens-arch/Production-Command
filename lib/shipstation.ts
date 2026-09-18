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
  service?: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: { name?: string; company?: string; street1?: string; street2?: string; street3?: string; city?: string; state?: string; postalCode?: string; country?: string };
  items?: Array<{ name: string; quantity: number }>;
};

type ShipStationOrder = {
  order_id?: string;
  order_number?: string;
  order_status?: string;
  ship_to?: { name?: string; company_name?: string; address_line1?: string; address_line2?: string; address_line3?: string; city_locality?: string; state_province?: string; postal_code?: string; country_code?: string; phone?: string; email?: string };
  bill_to?: { name?: string };
  customer_name?: string;
  items?: Array<{ name?: string; quantity?: number }>;
  created_at?: string;
  ordered_at?: string;
  shipped_at?: string;
  tracking_number?: string;
  carrier_code?: string;
  service_code?: string;
  customer_email?: string;
};

type LegacyAddress = { name?: string; company?: string; street1?: string; street2?: string; street3?: string; city?: string; state?: string; postalCode?: string; country?: string; phone?: string; residential?: boolean };

type LegacyShipStationOrder = {
  orderId?: number;
  orderNumber?: string;
  orderStatus?: string;
  customerName?: string;
  shipTo?: LegacyAddress;
  billTo?: { name?: string };
  orderDate?: string;
  shipDate?: string;
  trackingNumber?: string;
  carrierCode?: string;
  serviceCode?: string;
  customerEmail?: string;
  items?: Array<{ name?: string; quantity?: number }>;
};

type LegacyShipStationShipment = {
  shipmentId?: number;
  orderId?: number;
  orderNumber?: string;
  shipDate?: string;
  createDate?: string;
  trackingNumber?: string;
  carrierCode?: string;
  serviceCode?: string;
  voided?: boolean;
};

const demoOrders: PortalOrder[] = [
  { id: "demo-1", orderNumber: "MS-1087", customer: "Danielle Carter", item: "Whatupdoe Welcome Mat", quantity: 1, status: "pending", orderDate: "2026-09-12T13:20:00Z" },
  { id: "demo-2", orderNumber: "MS-1086", customer: "Marcus Hill", item: "Did You Call First Mat", quantity: 2, status: "pending", orderDate: "2026-09-12T10:05:00Z" },
  { id: "demo-3", orderNumber: "MS-1084", customer: "Keisha Brown", item: "Whatupdoe Welcome Mat", quantity: 1, status: "shipped", orderDate: "2026-09-10T14:15:00Z", shipDate: "2026-09-12T09:10:00Z", trackingNumber: "1Z8Y03W90378124510", carrier: "UPS" },
  { id: "demo-4", orderNumber: "MS-1079", customer: "Terrence Williams", item: "Whatupdoe Welcome Mat", quantity: 1, status: "delivered", orderDate: "2026-09-06T15:35:00Z", shipDate: "2026-09-08T12:30:00Z", trackingNumber: "9400111899560000001024", carrier: "USPS" },
];

type RawLineItem = { name?: string; quantity?: number };

function fulfillmentItems(items?: RawLineItem[]) {
  return (items ?? [])
    .map(item => ({ name: item.name?.trim() || "Marsh Supply order", quantity: Math.max(0, Number(item.quantity ?? 1)) }))
    .filter(item => item.quantity > 0 && !/^(discount|coupon|promo(?:tion)?|order discount|automatic discount|price adjustment)(?:\b|\s*[:—–-])/i.test(item.name));
}

function normalizeStatus(value?: string, _shipDate?: string, trackingNumber?: string, verifiedShipment = false): PortalOrder["status"] {
  const status = value?.toLowerCase() ?? "pending";
  if (status.includes("deliver")) return "delivered";
  // ShipStation and connected stores can label an order "shipped" before a
  // real outbound shipment exists. Only count it as shipped when the order
  // contains shipment evidence that the production team can verify.
  if (verifiedShipment || (trackingNumber && (status.includes("ship") || status.includes("label") || status.includes("complete")))) return "shipped";
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
      const headers = { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`, Accept: "application/json" };
      const [legacy, shipmentResponse] = await Promise.all([fetch("https://ssapi.shipstation.com/orders?pageSize=100&sortBy=OrderDate&sortDir=DESC", {
        headers,
        cache: "no-store", signal: AbortSignal.timeout(12000),
      }), fetch("https://ssapi.shipstation.com/shipments?pageSize=500&sortBy=ShipDate&sortDir=DESC", {
        headers,
        cache: "no-store", signal: AbortSignal.timeout(12000),
      }).catch(() => null)]);
      if (!legacy.ok) throw new Error(`ShipStation authentication failed (${legacy.status}).`);
      const payload = await legacy.json() as { orders?: LegacyShipStationOrder[] };
      const shipmentPayload = shipmentResponse?.ok ? await shipmentResponse.json() as { shipments?: LegacyShipStationShipment[] } : { shipments: [] };
      const shipmentsByOrder = new Map<string, LegacyShipStationShipment>();
      for (const shipment of shipmentPayload.shipments ?? []) {
        if (shipment.voided) continue;
        if (shipment.orderId !== undefined && !shipmentsByOrder.has(`id:${shipment.orderId}`)) shipmentsByOrder.set(`id:${shipment.orderId}`, shipment);
        if (shipment.orderNumber && !shipmentsByOrder.has(`number:${shipment.orderNumber}`)) shipmentsByOrder.set(`number:${shipment.orderNumber}`, shipment);
      }
      const orders = (payload.orders ?? []).filter(order => order.orderStatus?.toLowerCase() !== "cancelled").map((order, index): PortalOrder => {
        const items = fulfillmentItems(order.items);
        const shipment = (order.orderId !== undefined ? shipmentsByOrder.get(`id:${order.orderId}`) : undefined) ?? (order.orderNumber ? shipmentsByOrder.get(`number:${order.orderNumber}`) : undefined);
        const trackingNumber = shipment?.trackingNumber || order.trackingNumber;
        const shipDate = shipment?.shipDate || shipment?.createDate || order.shipDate;
        const carrier = shipment?.carrierCode || order.carrierCode;
        return {
          id: String(order.orderId ?? `legacy-${index}`), orderNumber: order.orderNumber ?? "Unnumbered", customer: order.shipTo?.name?.trim() || order.customerName?.trim() || order.billTo?.name?.trim() || "Customer name unavailable",
          item: items.map(item => item.name).join(", ") || "Marsh Supply order",
          quantity: items.reduce((sum, item) => sum + item.quantity, 0),
          status: normalizeStatus(order.orderStatus, shipDate, trackingNumber, Boolean(shipment)), orderDate: order.orderDate ?? new Date().toISOString(), shipDate,
          trackingNumber, carrier: carrier?.toUpperCase(), service: shipment?.serviceCode || order.serviceCode, customerEmail: order.customerEmail, customerPhone: order.shipTo?.phone,
          shippingAddress: order.shipTo ? { name: order.shipTo.name, company: order.shipTo.company, street1: order.shipTo.street1, street2: order.shipTo.street2, street3: order.shipTo.street3, city: order.shipTo.city, state: order.shipTo.state, postalCode: order.shipTo.postalCode, country: order.shipTo.country } : undefined, items,
        };
      });
      return { orders, connected: true, message: "Connected to ShipStation orders." };
    }

    const response = await fetch("https://api.shipstation.com/v2/orders?page_size=100&sort_dir=desc", {
      headers: { "api-key": apiKey, Accept: "application/json" },
      cache: "no-store", signal: AbortSignal.timeout(12000),
    });
    if (response.ok) {
      const payload = await response.json() as { orders?: ShipStationOrder[] };
      const orders = (payload.orders ?? []).filter(order => order.order_status?.toLowerCase() !== "cancelled").map((order, index): PortalOrder => {
        const items = fulfillmentItems(order.items);
        return {
          id: order.order_id ?? `order-${index}`,
          orderNumber: order.order_number ?? "Unnumbered",
          customer: order.ship_to?.name?.trim() || order.customer_name?.trim() || order.bill_to?.name?.trim() || "Customer name unavailable",
          item: items.map(item => item.name).join(", ") || "Marsh Supply order",
          quantity: items.reduce((sum, item) => sum + item.quantity, 0),
          status: normalizeStatus(order.order_status, order.shipped_at, order.tracking_number), orderDate: order.ordered_at ?? order.created_at ?? new Date().toISOString(), shipDate: order.shipped_at,
          trackingNumber: order.tracking_number, carrier: order.carrier_code?.toUpperCase(), service: order.service_code, customerEmail: order.customer_email || order.ship_to?.email, customerPhone: order.ship_to?.phone,
          shippingAddress: order.ship_to ? { name: order.ship_to.name, company: order.ship_to.company_name, street1: order.ship_to.address_line1, street2: order.ship_to.address_line2, street3: order.ship_to.address_line3, city: order.ship_to.city_locality, state: order.ship_to.state_province, postalCode: order.ship_to.postal_code, country: order.ship_to.country_code } : undefined, items,
        };
      });
      return { orders, connected: true, message: "Connected to ShipStation orders." };
    }
    throw new Error(`ShipStation API returned ${response.status}.`);
  } catch (error) {
    return { orders: demoOrders, connected: false, message: error instanceof Error ? error.message : "ShipStation sync unavailable" };
  }
}
