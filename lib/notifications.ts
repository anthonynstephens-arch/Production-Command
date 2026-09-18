import webpush from "web-push";
import { getSupabaseAdmin } from "./supabase-admin";
import { getShipStationOrders } from "./shipstation";
import { buildInvoice } from "./invoice";
const origin = "https://production-command-six.vercel.app";
const emailOrigin =
  "https://www.detroitdecalandapparel.com/pages/production-command";
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
function emailExtras(payload: Record<string, unknown>) {
  const items = Array.isArray(payload.detail_items)
    ? payload.detail_items.slice(0, 30)
    : [];
  const normalized = items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const heading = String(record.heading ?? "").slice(0, 180);
    const lines = Array.isArray(record.lines)
      ? record.lines.map((line) => String(line).slice(0, 500)).slice(0, 8)
      : [];
    return heading ? [{ heading, lines }] : [];
  });
  const detailsText = normalized
    .map((item) => [item.heading, ...item.lines.map((line) => `- ${line}`)].join("\n"))
    .join("\n\n");
  const detailsHtml = normalized
    .map(
      (item) =>
        `<div style="margin-top:12px;padding:14px;border:1px solid #d7e2de;border-radius:10px;background:#f7faf9"><strong style="font-size:15px">${escapeHtml(item.heading)}</strong>${item.lines.map((line) => `<div style="margin-top:6px;font-size:14px;line-height:1.4;color:#425d54">${escapeHtml(line)}</div>`).join("")}</div>`,
    )
    .join("");
  const firstLoginText = payload.first_login_pending
    ? "\n\nFirst time signing in? Check the access instructions sent to this email address, then use your temporary PIN and choose a new PIN when prompted."
    : "";
  const firstLoginHtml = payload.first_login_pending
    ? '<div style="margin-top:18px;padding:13px;border-radius:9px;background:#fff7df;color:#6f5312;font-size:14px;line-height:1.45"><strong>First time signing in?</strong><br>Check the access instructions sent to this email address, then use your temporary PIN and choose a new PIN when prompted.</div>'
    : "";
  return { detailsText, detailsHtml, firstLoginText, firstLoginHtml };
}
const currency = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const detroitClock = () => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts().map(part => [part.type, part.value]));

async function queueDailySummary() {
  const clock = detroitClock();
  if (Number(clock.hour) < 8) return;
  const day = `${clock.year}-${clock.month}-${clock.day}`;
  const eventId = `daily-summary:${day}`;
  const db = getSupabaseAdmin();
  const { count } = await db.from("marsh_notification_queue").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  if (count) return;
  const [shipstation, inventory, issues, state, balance, users, preferences, devices] = await Promise.all([
    getShipStationOrders(),
    db.from("marsh_inventory").select("item_key,quantity").eq("account_slug", "marsh-supply"),
    db.from("marsh_order_issues").select("order_id,order_number,reason,note").eq("account_slug", "marsh-supply").is("resolved_at", null),
    db.from("marsh_dashboard_state").select("orders_in_production").eq("account_slug", "marsh-supply").maybeSingle(),
    db.rpc("marsh_notification_balance"),
    db.from("marsh_portal_users").select("id,last_login,login_count").eq("active", true),
    db.from("marsh_notification_preferences").select("user_id,email,channel"),
    db.from("marsh_push_subscriptions").select("id,user_id"),
  ]);
  if (!shipstation.connected || inventory.error || issues.error || state.error || balance.error || users.error || preferences.error || devices.error) return;
  const orders = shipstation.orders;
  const pending = orders.filter(order => order.status === "pending");
  const committed = pending.reduce((sum, order) => sum + order.quantity, 0);
  const levels = Object.fromEntries((inventory.data ?? []).map(item => [item.item_key, Number(item.quantity)]));
  const tapeCapacity = Math.max(0, Number(levels.packing_tape || 0) * Math.max(1, Number(levels.packing_tape_coverage || 1)) - Number(levels.packing_tape_usage || 0) - committed);
  const available = {
    mats: Math.max(0, Number(levels.blank_mats || 0) - committed), boxes: Math.max(0, Number(levels.shipping_boxes || 0) - committed),
    cards: Math.max(0, Number(levels.thank_you_cards || 0) - committed), bags: Math.max(0, Number(levels.poly_bags || 0) - committed), tape: tapeCapacity,
  };
  const capacity = Math.min(available.mats, available.boxes, available.cards, available.bags, available.tape);
  const issueOrders = new Map(orders.map(order => [order.id, order]));
  const detailItems: Array<{heading:string;lines:string[]}> = [
    { heading: "Overview", lines: [`Pipeline: ${pending.length} orders (${committed} units)`, `Shipping issues: ${issues.data?.length || 0}`, `New in 7 days: ${orders.filter(order => Date.now() - new Date(order.orderDate).getTime() <= 7 * 86400000).length}`, `Available capacity: ${capacity} orders`] },
    { heading: "Production and payment", lines: [`Awaiting production: ${Math.max(0, pending.length - Number(state.data?.orders_in_production || 0))} orders`, `In production: ${Number(state.data?.orders_in_production || 0)} orders`, `Balance due: ${currency(Number(balance.data || 0))}`] },
    { heading: "Inventory after commitments", lines: [`Blank mats: ${available.mats}`, `Shipping boxes: ${available.boxes}`, `Packing tape capacity: ${available.tape} mats`, `Thank-you cards: ${available.cards}`, `Poly bags: ${available.bags}`, `Black ink: ${Number(levels.ink || 0)}%`] },
  ];
  for (const issue of issues.data ?? []) {
    const order = issueOrders.get(issue.order_id);
    detailItems.push({ heading: `Issue — Order ${issue.order_number}`, lines: [
      `Reason: ${issue.reason}${issue.note ? ` — ${issue.note}` : ""}`,
      ...(order ? orderDetailLines(order) : ["Order details are not currently available from ShipStation."]),
    ]});
  }
  const payload = { event_id: eventId, event_type: "daily_summary", category: "broadcast", title: "Daily Production Command summary", body: `${pending.length} orders are in the pipeline, ${issues.data?.length || 0} have shipping issues, and capacity is ${capacity} additional orders.`, target_url: origin, button_label: "Open Production Command", detail_items: detailItems };
  const rows: Array<Record<string, unknown>> = [];
  for (const pref of preferences.data ?? []) {
    const user = users.data?.find(item => item.id === pref.user_id);
    if (!user) continue;
    if (pref.email) rows.push({ event_id: eventId, event_type: "daily_summary", recipient_id: pref.user_id, channel: "email", payload: { ...payload, first_login_pending: !user.last_login && !Number(user.login_count || 0) }, deduplication_key: `${eventId}:${pref.user_id}:email` });
    if (pref.channel === "push" || pref.channel === "both") for (const device of (devices.data ?? []).filter(item => item.user_id === pref.user_id)) rows.push({ event_id: eventId, event_type: "daily_summary", recipient_id: pref.user_id, channel: "push", device_id: device.id, payload, deduplication_key: `${eventId}:${pref.user_id}:push:${device.id}` });
  }
  if (rows.length) await db.from("marsh_notification_queue").insert(rows);
}

export function orderDetailLines(order: Awaited<ReturnType<typeof getShipStationOrders>>["orders"][number]) {
  const address = order.shippingAddress;
  return [
    `Customer: ${order.customer}`,
    `Items: ${(order.items?.length ? order.items : [{ name: order.item, quantity: order.quantity }]).map(item => `${item.quantity} × ${item.name}`).join("; ")}`,
    `Total quantity: ${order.quantity}`,
    `Ordered: ${new Date(order.orderDate).toLocaleString("en-US", { timeZone: "America/Detroit" })}`,
    `Ship to: ${address ? [address.name, address.company, address.street1, address.street2, address.street3, [address.city,address.state,address.postalCode].filter(Boolean).join(", "), address.country].filter(Boolean).join(" · ") : "Not available"}`,
    `Contact: ${[order.customerEmail, order.customerPhone].filter(Boolean).join(" · ") || "Not available"}`,
    `Shipment: ${[order.carrier, order.service, order.trackingNumber].filter(Boolean).join(" · ") || "Tracking not assigned"}`,
  ];
}
export async function notificationConfig() {
  const { data, error } = await getSupabaseAdmin()
    .from("marsh_notification_config")
    .select("key,value");
  if (error) throw new Error("Notification configuration unavailable");
  return Object.fromEntries(data.map((r) => [r.key, r.value])) as Record<
    string,
    string
  >;
}
export function validPushEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname.endsWith(".push.services.mozilla.com") ||
        u.hostname === "web.push.apple.com" ||
        u.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
async function scanSupplies() {
  const db = getSupabaseAdmin();
  const [stock, result] = await Promise.all([
    db
      .from("marsh_inventory")
      .select("item_key,quantity")
      .eq("account_slug", "marsh-supply"),
    getShipStationOrders(),
  ]);
  if (stock.error || !result.connected) return;
  const levels = Object.fromEntries(
    stock.data.map((r) => [r.item_key, Number(r.quantity)]),
  );
  const committed = result.orders
    .filter((o) => o.status === "pending")
    .reduce((s, o) => s + o.quantity, 0);
  for (const [key, label, unit] of [
    ["blank_mats", "Blank coir mats", "mats"],
    ["shipping_boxes", "Shipping boxes", "boxes"],
    ["thank_you_cards", "Thank-you cards", "cards"],
    ["poly_bags", "Poly bags", "bags"],
    ["packing_tape", "Packing tape", "mat uses"],
    ["ink", "Black ink", "percent"],
  ]) {
    if (levels[key] === undefined) continue;
    const threshold = key === "ink" ? 25 : 0;
    let available = key === "ink" ? levels[key] : levels[key] - committed;
    if (key === "packing_tape") {
      if (
        levels.packing_tape_coverage === undefined ||
        levels.packing_tape_usage === undefined
      )
        continue;
      available =
        levels[key] * Math.max(1, levels.packing_tape_coverage) -
        levels.packing_tape_usage -
        committed;
    }
    const quantity = Math.max(0, available);
    const { error } = await db.rpc("marsh_check_supply", {
      supply_key: key,
      low_now: quantity <= threshold,
      details: {
        supply_name: label,
        quantity,
        unit,
        threshold,
        title: `Low supply: ${label}`,
        body: `${quantity} ${unit} available${key === "ink" ? "" : " after pending orders"}.`,
        target_url: origin + "/#supplies",
      },
    });
    if (error) throw new Error("Supply alert check failed");
  }
}
export async function dispatchNotifications() {
  const db = getSupabaseAdmin(),
    config = await notificationConfig();
  const { data: locked, error: lockError } = await db.rpc(
    "marsh_acquire_notification_worker",
  );
  if (lockError) throw new Error("Worker unavailable");
  if (!locked) return { busy: true };
  try {
    const { error: balanceError } = await db.rpc("marsh_daily_balance");
    if (balanceError) throw new Error("Balance alert check failed");
    await queueDailySummary().catch(() => console.error("Daily summary preparation failed"));
    // Supply provider outages must not prevent chat delivery.
    try {
      await scanSupplies();
    } catch {
      console.error("Notification supply scan failed");
    }
    const { data: jobs, error } = await db.rpc("marsh_claim_notifications");
    if (error) throw new Error("Queue unavailable");
    const outcomes = await Promise.all(
      (jobs || []).map(
        async (job: {
          id: string;
          recipient_id: string;
          channel: string;
          device_id: string;
          event_type: string;
          event_id: string;
          deduplication_key: string;
          attempts: number;
          payload: Record<string, any>;
          created_at: string;
        }) => {
          try {
            const [p, u] = await Promise.all([
              db
                .from("marsh_notification_preferences")
                .select("*")
                .eq("user_id", job.recipient_id)
                .maybeSingle(),
              db
                .from("marsh_portal_users")
                .select("active,must_change_pin")
                .eq("id", job.recipient_id)
                .maybeSingle(),
            ]);
            if (p.error || u.error)
              throw new Error("Could not recheck preferences");
            const pref = p.data,
              user = u.data;
            let eligible =
              Date.now() - new Date(job.created_at).getTime() < 86400000 &&
              user?.active &&
              pref &&
              pref[job.payload.category] &&
              (pref.channel === job.channel || pref.channel === "both");
            if (job.event_type === "admin_broadcast" || job.event_type === "daily_summary")
              eligible = Boolean(
                Date.now() - new Date(job.created_at).getTime() < 86400000 &&
                user?.active &&
                pref &&
                (job.channel === "email"
                  ? pref.email
                  : pref.channel === "push" || pref.channel === "both"),
              );
            if (job.event_type === "balance_due") {
              const { data: balance, error: be } = await db.rpc(
                "marsh_notification_balance",
              );
              if (be) throw new Error("Unable to confirm balance");
              if (Number(balance) <= 0) eligible = false;
              job.payload.balance_amount = Number(balance);
              job.payload.balance_formatted = new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
              }).format(Number(balance));
              job.payload.body = `${job.payload.balance_formatted} remains outstanding.`;
            }
            if (job.event_type === "supplies_low") {
              const [, key, episode] = job.event_id.split(":");
              const { data: condition, error: ce } = await db
                .from("marsh_notification_conditions")
                .select("is_low,episode")
                .eq("key", key)
                .maybeSingle();
              if (ce) throw new Error("Could not confirm inventory alert");
              if (!condition?.is_low || condition.episode !== episode)
                eligible = false;
            }
            if (!eligible) {
              await db
                .from("marsh_notification_queue")
                .update({ status: "skipped" })
                .eq("id", job.id);
              return "skipped";
            }
            if (job.channel === "email") {
              if (!pref.email) throw new Error("Email address missing");
              const resendKey = process.env.RESEND_API_KEY,
                fromEmail = process.env.RESEND_FROM_EMAIL;
              if (resendKey && fromEmail) {
                const title = String(
                    job.payload.title || "Production Command alert",
                  ),
                  body = String(job.payload.body || ""),
                  target = emailOrigin,
                  buttonLabel = String(
                    job.payload.button_label || "Open Production Command",
                  ),
                  extras = emailExtras(job.payload);
                let attachments: Array<{ filename: string; content: string }> | undefined;
                if (job.event_type === "balance_due" || (job.event_type === "admin_broadcast" && job.payload.broadcast_category === "billing")) {
                  const [charges, payments] = await Promise.all([
                    db.from("marsh_charges").select("amount,description,charge_date").order("charge_date"),
                    db.from("marsh_payments").select("amount,payment_date,method,reference,status").order("payment_date"),
                  ]);
                  if (charges.error || payments.error) throw new Error("Could not prepare invoice attachment");
                  const invoice = buildInvoice(charges.data ?? [], payments.data ?? []);
                  attachments = [{ filename: `${invoice.invoiceNumber}.html`, content: Buffer.from(invoice.html).toString("base64") }];
                }
                const response = await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${resendKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    from: fromEmail,
                    to: [pref.email],
                    subject: title,
                    ...(attachments ? { attachments } : {}),
                    text: `${body}${extras.detailsText ? `\n\n${extras.detailsText}` : ""}${extras.firstLoginText}\n\n${buttonLabel}: ${target}`,
                    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:28px;color:#17382d"><h1 style="font-size:22px">${escapeHtml(title)}</h1><p style="font-size:16px;line-height:1.55">${escapeHtml(body)}</p>${extras.detailsHtml}${extras.firstLoginHtml}<a href="${escapeHtml(target)}" style="display:inline-block;margin-top:18px;padding:12px 18px;border-radius:8px;background:#176b52;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(buttonLabel)}</a><p style="margin-top:28px;color:#64766f;font-size:12px">Detroit Decal &amp; Apparel · Production Command</p></div>`,
                  }),
                  signal: AbortSignal.timeout(10000),
                });
                if (!response.ok)
                  throw new Error(`Resend returned ${response.status}`);
              } else {
                const hook = config["email_hook_" + job.event_type];
                if (!hook) {
                  await db
                    .from("marsh_notification_queue")
                    .update({
                      status: "pending",
                      attempts: Math.max(0, job.attempts - 1),
                      available_at: new Date(
                        Date.now() + 3600000,
                      ).toISOString(),
                      last_error:
                        "Email delivery is not configured for this event",
                    })
                    .eq("id", job.id);
                  return "waiting";
                }
                const url = new URL(hook);
                if (url.origin !== "https://hooks.zapier.com")
                  throw new Error("Invalid email webhook");
                const response = await fetch(url, {
                  method: "POST",
                  redirect: "error",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ...job.payload,
                    target_url: emailOrigin,
                    recipient_email: pref.email,
                    notification_preference: pref.channel,
                  }),
                  signal: AbortSignal.timeout(10000),
                });
                if (!response.ok)
                  throw new Error(`Email webhook returned ${response.status}`);
              }
            } else {
              const { data: device, error: de } = await db
                .from("marsh_push_subscriptions")
                .select("*")
                .eq("id", job.device_id)
                .eq("user_id", job.recipient_id)
                .maybeSingle();
              if (de) throw new Error("Could not check device");
              if (!device) {
                await db
                  .from("marsh_notification_queue")
                  .update({ status: "skipped" })
                  .eq("id", job.id);
                return "skipped";
              }
              if (!validPushEndpoint(device.endpoint))
                throw new Error("Unsupported push endpoint");
              await webpush.sendNotification(
                device.subscription,
                JSON.stringify({
                  title: job.payload.title,
                  body: job.payload.body,
                  url: job.payload.target_url,
                  tag: job.deduplication_key,
                }),
                {
                  vapidDetails: {
                    subject: "mailto:info@detroitdecalandapparel.com",
                    publicKey: config.vapid_public,
                    privateKey: config.vapid_private,
                  },
                  TTL: 3600,
                  timeout: 8000,
                },
              );
            }
            const { error: saved } = await db
              .from("marsh_notification_queue")
              .update({ status: "accepted", last_error: null })
              .eq("id", job.id);
            if (saved)
              throw new Error("Delivery accepted but status save failed");
            return "accepted";
          } catch (cause) {
            const code = (cause as { statusCode?: number }).statusCode;
            if (job.channel === "push" && (code === 404 || code === 410)) {
              await db
                .from("marsh_push_subscriptions")
                .delete()
                .eq("id", job.device_id);
              return "expired";
            }
            await db
              .from("marsh_notification_queue")
              .update({
                status: job.attempts >= 5 ? "failed" : "pending",
                available_at: new Date(
                  Date.now() + Math.min(3600, 60 * 2 ** job.attempts) * 1000,
                ).toISOString(),
                last_error:
                  cause instanceof Error
                    ? cause.message.slice(0, 180)
                    : "Delivery failed",
              })
              .eq("id", job.id);
            return "retry";
          }
        },
      ),
    );
    return {
      processed: outcomes.length,
      accepted: outcomes.filter((v) => v === "accepted").length,
    };
  } finally {
    await db
      .from("marsh_notification_worker_lock")
      .update({ until_at: new Date().toISOString() })
      .eq("id", 1);
  }
}
