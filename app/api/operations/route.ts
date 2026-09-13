import { getPortalSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { lookupInboundTracking } from "@/lib/inbound-tracking";

export async function GET() {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  const [payments, deliveries, charges] = await Promise.all([
    db.from("marsh_payments").select("*").order("created_at", { ascending: false }).limit(50),
    db.from("marsh_incoming_deliveries").select("*").order("created_at", { ascending: false }).limit(50),
    db.from("marsh_charges").select("*").order("charge_date", { ascending: false }).order("created_at", { ascending: false }).limit(50),
  ]);
  if (payments.error || deliveries.error || charges.error) return Response.json({ error: "Could not load operations records." }, { status: 500 });
  return Response.json({ payments: payments.data, deliveries: deliveries.data, charges: charges.data });
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
    if (!String(body.trackingNumber || "").trim()) return Response.json({ error: "Tracking number is required." }, { status: 400 });
    const supplyTypes=["mats","boxes","tape","thankYouCards","polyBags","ink"];
    const supplyType=supplyTypes.includes(body.supplyType)?body.supplyType:"";
    const quantity=Number(body.quantity);
    if(!supplyType||!Number.isFinite(quantity)||quantity<=0) return Response.json({error:"Choose a supply type and enter a valid quantity."},{status:400});
    const supplyLabels:Record<string,string>={mats:"Blank coir mats",boxes:"Shipping boxes",tape:"Packing tape rolls",thankYouCards:"Thank-you cards",polyBags:"Poly bags",ink:"Black ink"};
    const trackingNumber=String(body.trackingNumber).trim().slice(0,120);
    const tracking=await lookupInboundTracking(trackingNumber,String(body.carrier||"Other"));
    const { error } = await db.from("marsh_incoming_deliveries").insert({
      description:supplyLabels[supplyType], supplier:null, supply_type:supplyType, quantity,
      carrier:tracking.carrier, tracking_number:trackingNumber, tracking_url:tracking.trackingUrl||null, tracking_provider:tracking.slug,
      eta_start:tracking.etaStart, eta_end:tracking.etaEnd, status:tracking.status, tracking_message:tracking.message, last_tracking_check:new Date().toISOString(),
      submitted_by: session.userId, submitted_by_name: session.name,
    });
    if (error) return Response.json({ error: "Could not save the delivery." }, { status: 500 });
    return Response.json({ ok: true });
  }
  if (body.type === "charge") {
    if (session.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403 });
    const amount = Number(body.amount);
    const description = String(body.description || "").trim().slice(0, 240);
    if (!Number.isFinite(amount) || amount <= 0) return Response.json({ error: "Enter a valid charge amount." }, { status: 400 });
    if (description.length < 2) return Response.json({ error: "Enter a description for the charge." }, { status: 400 });
    const { error } = await db.from("marsh_charges").insert({ amount, description, charge_date: body.chargeDate || new Date().toISOString().slice(0, 10), created_by: session.userId, created_by_name: session.name });
    if (error) return Response.json({ error: "Could not save the charge." }, { status: 500 });
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
    if(status === "delivered" && session.role !== "admin") return Response.json({error:"An admin must confirm that supplies were received."},{status:403});
    if(status === "delivered") {
      const {data:applied,error}=await db.from("marsh_incoming_deliveries").update({status,delivered_at:new Date().toISOString(),inventory_applied:true}).eq("id",body.id).eq("inventory_applied",false).select("id,status,supply_type,quantity").maybeSingle();
      if(error) return Response.json({error:"Could not receive delivery."},{status:500});
      if(!applied) return Response.json({error:"This delivery was already received or could not be updated."},{status:409});
      return Response.json({ok:true,delivery:applied,inventoryAddition:{key:applied.supply_type,quantity:Number(applied.quantity)}});
    }
    const { data:updated,error } = await db.from("marsh_incoming_deliveries").update({ status, delivered_at: null }).eq("id", body.id).eq("inventory_applied",false).select("id,status").maybeSingle();
    if (error) return Response.json({ error: "Could not update delivery." }, { status: 500 });
    if(!updated) return Response.json({error:"This delivery was already received or could not be updated."},{status:409});
    return Response.json({ ok: true, delivery:updated });
  }
  if(body.type === "refresh_delivery") {
    const {data:item}=await db.from("marsh_incoming_deliveries").select("tracking_number,carrier,inventory_applied").eq("id",body.id).single();
    if(!item) return Response.json({error:"Delivery not found."},{status:404});
    const tracking=await lookupInboundTracking(item.tracking_number,item.carrier);
    const awaitingReceipt=tracking.status==="delivered"&&!item.inventory_applied;
    const {error}=await db.from("marsh_incoming_deliveries").update({carrier:tracking.carrier,tracking_url:tracking.trackingUrl||null,tracking_provider:tracking.slug,eta_start:tracking.etaStart,eta_end:tracking.etaEnd,status:awaitingReceipt?"in_transit":tracking.status,tracking_message:awaitingReceipt?"Carrier shows delivered — awaiting receipt confirmation.":tracking.message,last_tracking_check:new Date().toISOString()}).eq("id",body.id);
    if(error) return Response.json({error:"Could not refresh tracking."},{status:500});
    return Response.json({ok:true});
  }
  return Response.json({ error: "Unknown update." }, { status: 400 });
}

export async function DELETE(request: Request) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  const type = String(body.type || "delivery");
  if (!id) return Response.json({ error: "Record ID is required." }, { status: 400 });

  const db = getSupabaseAdmin();
  if (type === "payment") {
    const { data, error } = await db.from("marsh_payments").delete().eq("id", id).select("id").maybeSingle();
    if (error) return Response.json({ error: "Could not delete the payment." }, { status: 500 });
    if (!data) return Response.json({ error: "Payment not found." }, { status: 404 });
    return Response.json({ ok: true });
  }
  if (type === "charge") {
    const { data, error } = await db.from("marsh_charges").delete().eq("id", id).select("id").maybeSingle();
    if (error) return Response.json({ error: "Could not delete the charge." }, { status: 500 });
    if (!data) return Response.json({ error: "Charge not found." }, { status: 404 });
    return Response.json({ ok: true });
  }
  if (type !== "delivery") return Response.json({ error: "Unknown record type." }, { status: 400 });

  const { data: delivery, error: lookupError } = await db.from("marsh_incoming_deliveries").select("id,inventory_applied").eq("id", id).maybeSingle();
  if (lookupError) return Response.json({ error: "Could not check the shipment." }, { status: 500 });
  if (!delivery) return Response.json({ error: "Incoming shipment not found." }, { status: 404 });
  const { error } = await db.from("marsh_incoming_deliveries").delete().eq("id", id);
  if (error) return Response.json({ error: "Could not delete the incoming shipment." }, { status: 500 });
  return Response.json({ ok: true });
}
