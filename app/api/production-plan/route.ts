import { getPortalSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const ACCOUNT_SLUG = "marsh-supply";
const keys = ["whatupdoe", "did_you_call_first", "upside_down_welcome", "marsh_supply"] as const;

export async function GET() {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await getSupabaseAdmin().from("marsh_production_plan")
    .select("scheduled_date,scheduled_time,whatupdoe,did_you_call_first,upside_down_welcome,marsh_supply,updated_at")
    .eq("account_slug", ACCOUNT_SLUG).maybeSingle();
  if (error) return Response.json({ error: "Could not load the production plan." }, { status: 500 });
  return Response.json({ plan: data });
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
  const { data, error } = await getSupabaseAdmin().from("marsh_production_plan")
    .upsert({ account_slug: ACCOUNT_SLUG, scheduled_date: date, scheduled_time: time,
      ...counts, updated_at: new Date().toISOString(), updated_by: session.userId },
    { onConflict: "account_slug" })
    .select("scheduled_date,scheduled_time,whatupdoe,did_you_call_first,upside_down_welcome,marsh_supply,updated_at").single();
  if (error) return Response.json({ error: "Could not save the production plan." }, { status: 500 });
  return Response.json({ plan: data });
}
