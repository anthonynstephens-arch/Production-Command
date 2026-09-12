import { getShipStationOrders } from "@/lib/shipstation";
import Dashboard from "./ui/dashboard";
import { getPortalSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getPortalSession();
  if (!session) redirect("/login");
  if (session.mustChangePin) redirect("/change-pin");
  const result = await getShipStationOrders();
  return <Dashboard initialOrders={result.orders} initialConnected={result.connected} initialMessage={result.message} session={session} />;
}
