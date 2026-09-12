import { getShipStationOrders } from "@/lib/shipstation";
import Dashboard from "./ui/dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const result = await getShipStationOrders();
  return <Dashboard initialOrders={result.orders} initialConnected={result.connected} initialMessage={result.message} />;
}
