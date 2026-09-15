import { getPortalSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// IANA zones follow daylight saving time automatically; assignments use stable account IDs.
const locations: Record<string, { timeZone: string; location: string }> = {
  "faee73b9-e4ff-458d-97cf-114a8a11ea45": { timeZone: "America/Detroit", location: "Michigan" },
  "b8dfd8d6-202f-41d4-875c-e7effe9d73c3": { timeZone: "America/Detroit", location: "Michigan" },
  "e2761c26-f600-4328-af12-1dbecb411959": { timeZone: "America/Chicago", location: "Texas" },
  "78af12bc-fe0c-46b0-b41d-d6efd5d66861": { timeZone: "America/Los_Angeles", location: "California" },
};

export async function GET() {
  const session = await getPortalSession();
  if (!session || session.mustChangePin) return Response.json({ error: "Please sign in to view portal access." }, { status: 401 });
  const { data, error } = await getSupabaseAdmin().from("marsh_portal_users")
    .select("id,display_name,last_login").eq("active", true).order("display_name");
  if (error) return Response.json({ error: "Could not load portal access. Please retry." }, { status: 500 });
  return Response.json({ users: data.map(user => ({ ...user, ...(locations[user.id] || { timeZone: "UTC", location: "UTC" }) })) }, { headers: { "Cache-Control": "no-store" } });
}
