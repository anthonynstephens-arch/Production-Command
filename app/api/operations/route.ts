import { getPortalSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { lookupInboundTracking } from "@/lib/inbound-tracking";

export async function GET() {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  const [payments, deliveries] = await Promise.all([
    db.from("marsh_payments").select("*").order("created_at", { ascending: false }).limit(50),
    db.from("marsh_incoming_deliveries").select("*").order("created_at", { ascending: false }).limit(50),
  ]);
  if (payments.error || deliveries.error) return Response.json({ error: "Could not load operations records." }, { status: 500 });
  return Response.json({ payments: payments.data, deliveries: deliveries.data });
}

export async function POST(request: Request) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const db = getSupabaseAdmin();
  if (body.type === "payment") {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return Response.json({ error: "Enter a valid payment amount." }, { status: 400 });
    const confirmed = session.role === "admin";
    const { error } = await db.from("marsh_payments").insert({
      amount, payment_date: body.paymentDate || new Date().toISOString().slice(0, 10), method: String(body.method || "Other").slice(0, 60),
      reference: String(body.reference || "").slice(0, 120) || null, note: String(body.note || "").slice(0, 500) || null,
      submitted_by: session.userId, submitted_by_name: session.name, submitted_by_role: session.role,
      status: confirmed ? "confirmed" : "pending", confirmed_at: confirmed ? new Date().toISOString() : null, confirmed_by: confirmed ? session.userId : null,
    });
    if (error) return Response.json({ error: "Could not save the payment." }, { status: 500 });
    return Response.json({ ok: true });
  }
  if (body.type === "delivery") {
    if (!String(body.description || "").trim() || !String(body.trackingNumber || "").trim()) return Response.json({ error: "Item and tracking number are required." }, { status: 400 });
    const trackingNumber=String(body.trackingNumber).trim().slice(0,120);
    const tracking=await lookupInboundTracking(trackingNumber,String(body.carrier||"Other"));
    const { error } = await db.from("marsh_incoming_deliveries").insert({
      description: String(body.description).trim().slice(0, 200), supplier:String(body.supplier||"").trim().slice(0,120)||null,
      carrier:tracking.carrier, tracking_number:trackingNumber, tracking_url:tracking.trackingUrl||null, tracking_provider:tracking.slug,
      eta_start:tracking.etaStart, eta_end:tracking.etaEnd, status:tracking.status, tracking_message:tracking.message, last_tracking_check:new Date().toISOString(),
      submitted_by: session.userId, submitted_by_name: session.name,
    });
    if (error) return Response.json({ error: "Could not save the delivery." }, { status: 500 });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Unknown record type." }, { status: 400 });
}

export async function PATCH(request: Request) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const db = getSupabaseAdmin();
  if (body.type === "confirm_payment") {
    if (session.role !== "admin") return Response.json({ error: "Admin confirmation required." }, { status: 403 });
    const { error } = await db.from("marsh_payments").update({ status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_by: session.userId }).eq("id", body.id).eq("status", "pending");
    if (error) return Response.json({ error: "Could not confirm payment." }, { status: 500 });
    return Response.json({ ok: true });
  }
  if (body.type === "delivery_status") {
    const status = ["expected", "in_transit", "delivered"].includes(body.status) ? body.status : "expected";
    const { error } = await db.from("marsh_incoming_deliveries").update({ status, delivered_at: status === "delivered" ? new Date().toISOString() : null }).eq("id", body.id);
    if (error) return Response.json({ error: "Could not update delivery." }, { status: 500 });
    return Response.json({ ok: true });
  }
  if(body.type === "refresh_delivery") {
    const {data:item}=await db.from("marsh_incoming_deliveries").select("tracking_number,carrier").eq("id",body.id).single();
    if(!item) return Response.json({error:"Delivery not found."},{status:404});
    const tracking=await lookupInboundTracking(item.tracking_number,item.carrier);
    const {error}=await db.from("marsh_incoming_deliveries").update({carrier:tracking.carrier,tracking_url:tracking.trackingUrl||null,tracking_provider:tracking.slug,eta_start:tracking.etaStart,eta_end:tracking.etaEnd,status:tracking.status,tracking_message:tracking.message,last_tracking_check:new Date().toISOString()}).eq("id",body.id);
    if(error) return Response.json({error:"Could not refresh tracking."},{status:500});
    return Response.json({ok:true});
  }
  return Response.json({ error: "Unknown update." }, { status: 400 });
}
