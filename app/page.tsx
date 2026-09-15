import { getShipStationOrders } from "@/lib/shipstation";
import Dashboard from "./ui/dashboard";
import { getPortalSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const params=await searchParams;
  const next=params.chat ? `/?chat=${encodeURIComponent(params.chat)}` : params.notifications ? "/?notifications=1" : "/";
  const session = await getPortalSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (session.mustChangePin) redirect("/change-pin");
  const result = await getShipStationOrders();
  return <Dashboard initialOrders={result.orders} initialConnected={result.connected} initialMessage={result.message} session={session} />;
}
