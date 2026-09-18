import { randomUUID } from "crypto";
import { getPortalSession } from "@/lib/auth";
import { dispatchNotifications } from "@/lib/notifications";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const appOrigin = "https://production-command-six.vercel.app";
const categories = new Set([
  "general",
  "shipping_issues",
  "billing",
  "supplies",
  "chat",
]);
type DetailItem = { heading: string; lines: string[] };

export async function POST(request: Request) {
  const session = await getPortalSession();
  if (session?.role !== "admin" || session.mustChangePin)
    return Response.json({ error: "Admin access required." }, { status: 403 });
  const input = await request.json().catch(() => ({}));
  const category = categories.has(input.category)
    ? String(input.category)
    : "general";
  let title =
    typeof input.title === "string" ? input.title.trim().slice(0, 120) : "";
  let body =
    typeof input.body === "string" ? input.body.trim().slice(0, 2000) : "";
  let targetUrl =
    typeof input.targetUrl === "string" ? input.targetUrl.trim() : appOrigin;
  try {
    const parsed = new URL(targetUrl);
    if (parsed.origin !== appOrigin) targetUrl = appOrigin;
  } catch {
    targetUrl = appOrigin;
  }
  const db = getSupabaseAdmin(),
    details: DetailItem[] = [];
  if (category === "shipping_issues") {
    const { data, error } = await db
      .from("marsh_order_issues")
      .select("order_number,reason,note,created_by_name,created_at")
      .eq("account_slug", "marsh-supply")
      .is("resolved_at", null)
      .order("created_at", { ascending: false });
    if (error)
      return Response.json(
        { error: "Could not load current shipping issues." },
        { status: 500 },
      );
    if (!data?.length)
      return Response.json(
        { error: "There are no unresolved orders unable to ship." },
        { status: 400 },
      );
    title =
      title ||
      `${data.length} ${data.length === 1 ? "order is" : "orders are"} unable to ship`;
    body =
      body || "The following orders need attention before they can be shipped.";
    targetUrl = appOrigin + "/#order-queue";
    for (const issue of data)
      details.push({
        heading: `Order ${issue.order_number}`,
        lines: [
          `Reason: ${issue.reason}`,
          ...(issue.note ? [`Details: ${issue.note}`] : []),
          `Flagged by: ${issue.created_by_name}`,
        ],
      });
  } else if (category === "billing") {
    const { data, error } = await db.rpc("marsh_notification_balance");
    if (error)
      return Response.json(
        { error: "Could not load the current balance." },
        { status: 500 },
      );
    const balance = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(data || 0));
    title = title || "Production Command balance update";
    body = body || `${balance} is currently outstanding.`;
    targetUrl = appOrigin + "/#operations";
    details.push({ heading: "Current balance", lines: [balance] });
  } else if (category === "supplies") {
    const { data, error } = await db
      .from("marsh_inventory")
      .select("item_key,quantity")
      .eq("account_slug", "marsh-supply")
      .in("item_key", [
        "blank_mats",
        "shipping_boxes",
        "thank_you_cards",
        "poly_bags",
        "packing_tape",
        "ink",
      ]);
    if (error)
      return Response.json(
        { error: "Could not load current supplies." },
        { status: 500 },
      );
    const labels: Record<string, string> = {
      blank_mats: "Blank mats",
      shipping_boxes: "Shipping boxes",
      thank_you_cards: "Thank-you cards",
      poly_bags: "Poly bags",
      packing_tape: "Packing tape rolls",
      ink: "Black ink",
    };
    title = title || "Production Command supply update";
    body = body || "Current fulfillment supply levels are listed below.";
    targetUrl = appOrigin + "/#supplies";
    for (const item of data ?? [])
      details.push({
        heading: labels[item.item_key] || item.item_key,
        lines: [
          `${Number(item.quantity).toLocaleString()}${item.item_key === "ink" ? "%" : ""} available`,
        ],
      });
  } else {
    title =
      title ||
      (category === "chat"
        ? "Production Command team update"
        : "Production Command update");
    if (!body)
      return Response.json({ error: "Enter a message." }, { status: 400 });
    if (category === "chat") targetUrl = appOrigin + "/?chat=group";
  }
  const eventId = `broadcast:${randomUUID()}`;
  const { data: users, error } = await db
    .from("marsh_portal_users")
    .select("id,last_login,login_count")
    .eq("active", true);
  if (error)
    return Response.json(
      { error: "Could not load portal users." },
      { status: 500 },
    );
  const ids = (users ?? []).map((user) => user.id);
  if (!ids.length)
    return Response.json(
      { error: "No active users are ready for notifications." },
      { status: 400 },
    );
  const [
    { data: preferences, error: preferencesError },
    { data: devices, error: devicesError },
  ] = await Promise.all([
    db
      .from("marsh_notification_preferences")
      .select("user_id,email,channel")
      .in("user_id", ids),
    db.from("marsh_push_subscriptions").select("id,user_id").in("user_id", ids),
  ]);
  if (preferencesError || devicesError)
    return Response.json(
      { error: "Could not prepare notification recipients." },
      { status: 500 },
    );
  const payloadBase = {
    event_id: eventId,
    event_type: "admin_broadcast",
    occurred_at: new Date().toISOString(),
    sender_name: session.name,
    title,
    body,
    target_url: targetUrl,
    button_label:
      category === "shipping_issues"
        ? "Review shipping issues"
        : "Open Production Command",
    broadcast_category: category,
    detail_items: details,
    category: "broadcast",
    category_enabled: true,
  };
  const rows: Array<Record<string, unknown>> = [];
  for (const pref of preferences ?? []) {
    const user = users?.find((item) => item.id === pref.user_id),
      firstLoginPending = !user?.last_login && !Number(user?.login_count || 0);
    if (pref.email)
      rows.push({
        event_id: eventId,
        event_type: "admin_broadcast",
        recipient_id: pref.user_id,
        channel: "email",
        payload: {
          ...payloadBase,
          recipient_email: pref.email,
          first_login_pending: firstLoginPending,
        },
        deduplication_key: `${eventId}:${pref.user_id}:email`,
      });
    if (pref.channel === "push" || pref.channel === "both")
      for (const device of (devices ?? []).filter(
        (item) => item.user_id === pref.user_id,
      ))
        rows.push({
          event_id: eventId,
          event_type: "admin_broadcast",
          recipient_id: pref.user_id,
          channel: "push",
          device_id: device.id,
          payload: payloadBase,
          deduplication_key: `${eventId}:${pref.user_id}:push:${device.id}`,
        });
  }
  if (!rows.length)
    return Response.json(
      { error: "No users have a saved email address or enabled push device." },
      { status: 400 },
    );
  const { error: queueError } = await db
    .from("marsh_notification_queue")
    .insert(rows);
  if (queueError)
    return Response.json(
      { error: "Could not queue the notification." },
      { status: 500 },
    );
  await dispatchNotifications().catch((error) =>
    console.error("[notifications/broadcast] dispatch failed", error),
  );
  const emailCount = rows.filter((row) => row.channel === "email").length,
    pushCount = rows.filter((row) => row.channel === "push").length;
  return Response.json({
    ok: true,
    message: `${title} queued for ${emailCount} email recipient${emailCount === 1 ? "" : "s"} and ${pushCount} push device${pushCount === 1 ? "" : "s"}.`,
  });
}
