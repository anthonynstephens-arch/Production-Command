import { clearPortalSession } from "@/lib/auth";
export async function POST() { await clearPortalSession(); return Response.json({ ok: true }); }
