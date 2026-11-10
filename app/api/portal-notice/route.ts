import { randomUUID } from "crypto";
import { getPortalSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
export const dynamic = "force-dynamic";
const fields = "revision,title,message,enabled,updated_at";
const account = "marsh-supply";

export async function GET() {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  const { data: notice, error } = await db.from("marsh_portal_notice").select(fields).eq("account_slug", account).maybeSingle();
  if (error) return Response.json({ error: "Could not load portal notice." }, { status: 500 });
  let acknowledged = false;
  if (notice?.enabled) {
    const result = await db.from("marsh_notice_acknowledgments").select("user_id").eq("revision", notice.revision).eq("user_id", session.userId).maybeSingle();
    if (result.error) return Response.json({ error: "Could not load acknowledgment." }, { status: 500 });
    acknowledged = !!result.data;
  }
  return Response.json({ notice, acknowledged }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (typeof body.enabled !== "boolean" || title.length > 160 || message.length > 5000 || (body.enabled && (!title || !message)))
    return Response.json({ error: "Enter a title and message before enabling the popup (160 / 5,000 characters maximum)." }, { status: 400 });
  const db = getSupabaseAdmin();
  const current = await db.from("marsh_portal_notice").select(fields).eq("account_slug", account).maybeSingle();
  if (current.error) return Response.json({ error: "Could not load portal notice." }, { status: 500 });
  if ((current.data?.revision ?? null) !== (body.expectedRevision ?? null))
    return Response.json({ error: "This notice changed. Reload it before saving." }, { status: 409 });
  const values = { account_slug: account, revision: randomUUID(), title, message, enabled: body.enabled, updated_at: new Date().toISOString(), updated_by: session.userId };
  const result = current.data
    ? await db.from("marsh_portal_notice").update(values).eq("account_slug", account).eq("revision", current.data.revision).select(fields).maybeSingle()
    : await db.from("marsh_portal_notice").insert(values).select(fields).single();
  if (result.error) return Response.json({ error: "Could not save portal notice. Reload and try again." }, { status: 500 });
  if (!result.data) return Response.json({ error: "This notice changed. Reload it before saving." }, { status: 409 });
  return Response.json({ notice: result.data, acknowledged: false });
}

export async function POST(request: Request) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const db = getSupabaseAdmin();
  const { data: notice, error } = await db.from("marsh_portal_notice").select("revision,enabled").eq("account_slug", account).maybeSingle();
  if (error) return Response.json({ error: "Could not load portal notice." }, { status: 500 });
  if (!notice?.enabled || notice.revision !== body.revision || body.acknowledged !== true)
    return Response.json({ error: "This notice changed. Reload and acknowledge the current message." }, { status: 409 });
  const result = await db.from("marsh_notice_acknowledgments").upsert({ revision: notice.revision, user_id: session.userId }, { onConflict: "revision,user_id", ignoreDuplicates: true });
  if (result.error) return Response.json({ error: "Could not save acknowledgment. Please retry." }, { status: 500 });
  return Response.json({ ok: true });
}
