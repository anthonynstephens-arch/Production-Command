import { getPortalSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const DESIGN_STUDIO_URL =
  process.env.DESIGN_STUDIO_URL || "https://detroit-design-studio.vercel.app";

export async function GET(request: Request) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return Response.json({ error: "Admin access required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const designId = String(url.searchParams.get("designId") || "").trim();
  const order = String(url.searchParams.get("order") || "").trim();

  if (!/^DD-\d{8}-[A-Z0-9]{8}$/i.test(designId) || !/^#?[A-Z0-9-]{1,32}$/i.test(order)) {
    return Response.json({ error: "Invalid design lookup." }, { status: 400 });
  }

  const upstream = new URL("/api/production/design", DESIGN_STUDIO_URL);
  upstream.searchParams.set("designId", designId);
  upstream.searchParams.set("order", order);

  try {
    const response = await fetch(upstream, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(() => ({ error: "Invalid Design Studio response." }));
    return Response.json(data, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Design Studio is unavailable." }, { status: 502 });
  }
}
