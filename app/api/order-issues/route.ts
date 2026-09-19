import { getPortalSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getShipStationOrders } from "@/lib/shipstation";
import { orderDetailLines } from "@/lib/notifications";

const ACCOUNT_SLUG = "marsh-supply";
const reasons = new Set(["Incomplete address", "Cannot ship to PO box", "Address verification failed", "Missing customer information", "Inventory unavailable", "Other"]);

export async function GET() {
  if (!await getPortalSession()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [{ data, error }, shipstation] = await Promise.all([
    getSupabaseAdmin().from("marsh_order_issues").select("*").eq("account_slug", ACCOUNT_SLUG).is("resolved_at", null).order("created_at", { ascending: false }),
    getShipStationOrders(),
  ]);
  if (error) return Response.json({ error: "Could not load order issues." }, { status: 500 });
  if (!shipstation.connected) return Response.json({ issues: data ?? [] });

  const orderIds = new Set(shipstation.orders.map(order => order.id));
  const orderNumbers = new Set(shipstation.orders.map(order => order.orderNumber));
  const issues = (data ?? []).filter(issue => orderIds.has(issue.order_id) || orderNumbers.has(issue.order_number));
  return Response.json({ issues });
}

export async function POST(request: Request) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const orderId = String(body.orderId || "").slice(0, 160);
  const orderNumber = String(body.orderNumber || "").slice(0, 160);
  const reason = String(body.reason || "");
  const note = String(body.note || "").trim().slice(0, 1000) || null;
  if (!orderId || !orderNumber || !reasons.has(reason)) return Response.json({ error: "Choose a valid issue reason." }, { status: 400 });
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("marsh_order_issues").upsert({ account_slug: ACCOUNT_SLUG, order_id: orderId, order_number: orderNumber, reason, note, created_by_name: session.name, created_at: new Date().toISOString(), resolved_at: null, resolved_by_name: null }, { onConflict: "account_slug,order_id" }).select("*").single();
  if (error) return Response.json({ error: "Could not flag this order." }, { status: 500 });
  const shipstation = await getShipStationOrders();
  const order = shipstation.orders.find(item => item.id === orderId || item.orderNumber === orderNumber);
  await db.rpc("enqueue_marsh_notification", { event_key: `shipping-issue:${orderId}:${Date.now()}`, event_kind: "shipping_issue", category: "shipping_issues", event_payload: { order_id: orderId, order_number: orderNumber, reason, note, reported_by: session.name, title: `Shipping issue: ${orderNumber}`, body: `${reason}${note ? ` — ${note}` : ""}`, detail_items: [{ heading: `Order ${orderNumber}`, lines: order ? orderDetailLines(order) : ["Complete order details are temporarily unavailable from ShipStation."] }], target_url: "https://production-command-six.vercel.app/#order-queue" }, exclude_user: session.userId });
  return Response.json({ issue: data });
}

export async function DELETE(request: Request) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const orderId = new URL(request.url).searchParams.get("orderId")?.slice(0, 160);
  if (!orderId) return Response.json({ error: "Order is required." }, { status: 400 });
  const { error } = await getSupabaseAdmin().from("marsh_order_issues").update({ resolved_at: new Date().toISOString(), resolved_by_name: session.name }).eq("account_slug", ACCOUNT_SLUG).eq("order_id", orderId).is("resolved_at", null);
  if (error) return Response.json({ error: "Could not resolve this issue." }, { status: 500 });
  return Response.json({ ok: true });
}
