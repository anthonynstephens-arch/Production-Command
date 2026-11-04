import { getPortalSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!await getPortalSession()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const headers = { "Cache-Control": "private, no-store" };
  const key = process.env.TRACK17_API_KEY;
  if (!key) return Response.json({ error: "17TRACK is not configured." }, { status: 503, headers });
  try {
    const response = await fetch("https://api.17track.net/track/v2.4/getquota", {
      method: "POST", headers: { "17token": key, "Content-Type": "application/json" },
      body: "[]", cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json();
    const data = payload.data;
    if (!response.ok || payload.code !== 0 || !data ||
      ![data.quota_total, data.quota_used, data.quota_remain].every(value => Number.isSafeInteger(value) && value >= 0)) {
      throw new Error("Invalid quota response");
    }
    return Response.json({ total: data.quota_total, used: data.quota_used, remaining: data.quota_remain,
      checkedAt: new Date().toISOString() }, { headers });
  } catch {
    return Response.json({ error: "Tracking quota is temporarily unavailable. Try refreshing." }, { status: 502, headers });
  }
}
