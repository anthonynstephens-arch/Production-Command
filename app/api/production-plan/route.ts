import { getPortalSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const ACCOUNT_SLUG = "marsh-supply";
export const dynamic = "force-dynamic";
const fields = "run_id,stage,scheduled_date,scheduled_time,whatupdoe,did_you_call_first,upside_down_welcome,marsh_supply,updated_at,printing_started_at,drying_started_at,drying_ends_at,packaging_started_at,completed_at";
const withClock = (plan: Record<string, unknown> | null) => plan ? { ...plan, server_now: new Date().toISOString() } : null;
const keys = ["whatupdoe", "did_you_call_first", "upside_down_welcome", "marsh_supply"] as const;

export async function GET() {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  const advanced = await db.rpc("marsh_advance_production_drying");
  if (advanced.error) return Response.json({ error: "Could not refresh production progress." }, { status: 500 });
  const { data, error } = await db.from("marsh_production_plan")
    .select(fields)
    .eq("account_slug", ACCOUNT_SLUG).maybeSingle();
  if (error) return Response.json({ error: "Could not load the production plan." }, { status: 500 });
  return Response.json({ plan: withClock(data) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const date = String(body.scheduled_date ?? "");
  const time = String(body.scheduled_time ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    return Response.json({ error: "Choose a date and time in Detroit." }, { status: 400 });
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ||
      ![1, 3, 5].includes(parsed.getUTCDay()) || Number(time.slice(0, 2)) > 23 || Number(time.slice(3)) > 59)
    return Response.json({ error: "Production runs must be scheduled on a Monday, Wednesday, or Friday." }, { status: 400 });
  const nowParts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date());
  const part = (type: string) => nowParts.find((item) => item.type === type)?.value ?? "";
  const todayDetroit = `${part("year")}-${part("month")}-${part("day")}`;
  if (date < todayDetroit) return Response.json({ error: "Choose today or a future date." }, { status: 400 });
  if (date === todayDetroit && time <= `${part("hour")}:${part("minute")}`)
    return Response.json({ error: "Choose a future start time in Detroit." }, { status: 400 });
  const counts = Object.fromEntries(keys.map((key) => [key, Number(body[key])])) as Record<typeof keys[number], number>;
  if (keys.some((key) => !Number.isSafeInteger(counts[key]) || counts[key] < 0) ||
      keys.reduce((total, key) => total + counts[key], 0) !== 40)
    return Response.json({ error: "The four design quantities must add up to exactly 40 mats." }, { status: 400 });
  const db = getSupabaseAdmin();
  const current = await db.from("marsh_production_plan").select(fields).eq("account_slug", ACCOUNT_SLUG).maybeSingle();
  if (current.error) return Response.json({ error: "Could not check the current run." }, { status: 500 });
  if (current.data && !["scheduled","completed"].includes(current.data.stage))
    return Response.json({ error: "Complete the current run before scheduling another." }, { status: 409 });
  if ((current.data?.updated_at ?? null) !== (body.expected_updated_at ?? null))
    return Response.json({ error: "The schedule changed. Refresh and try again." }, { status: 409 });
  const startingNew = !current.data || current.data.stage === "completed";
  const values = { account_slug: ACCOUNT_SLUG, scheduled_date: date, scheduled_time: time,
    ...counts, updated_at: new Date().toISOString(), updated_by: session.userId,
    ...(startingNew ? { run_id: crypto.randomUUID(), stage: "scheduled", printing_started_at: null,
      drying_started_at: null, drying_ends_at: null, packaging_started_at: null, completed_at: null } : {}) };
  const result = current.data
    ? await db.from("marsh_production_plan").update(values).eq("account_slug", ACCOUNT_SLUG)
        .eq("updated_at", current.data.updated_at).eq("run_id", current.data.run_id).select(fields).maybeSingle()
    : await db.from("marsh_production_plan").insert(values).select(fields).single();
  if (result.error) return Response.json({ error: "Could not save the production plan." }, { status: 500 });
  if (!result.data) return Response.json({ error: "The run changed. Refresh and try again." }, { status: 409 });
  return Response.json({ plan: withClock(result.data) });
}

export async function PATCH(request: Request) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(body.run_id)) ||
      !["printing","drying","packaging","completed"].includes(body.stage))
    return Response.json({ error: "Choose a valid production stage." }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().rpc("marsh_set_production_stage", {
    expected_run: body.run_id, requested_stage: body.stage, actor: session.userId
  });
  if (error) return Response.json({ error: error.code === "P0001" ? error.message : "Could not update the production stage." }, { status: error.code === "P0001" ? 409 : 500 });
  return Response.json({ plan: withClock(data) });
}
