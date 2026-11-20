import { getPortalSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ document: string }> }) {
  const session = await getPortalSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { document } = await context.params;
  if (document !== "agreement" && document !== "schedule-c") return new Response("Not found", { status: 404 });
  const { data, error } = await getSupabaseAdmin().from("marsh_agreement_documents").select("content_base64").eq("document_key", document).maybeSingle();
  if (error || !data) return new Response("Document unavailable", { status: 503 });
  return new Response(Buffer.from(data.content_base64, "base64"), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${document === "agreement" ? "Marsh-Service-Agreement.pdf" : "Marsh-Schedule-C.pdf"}"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"
  }});
}
