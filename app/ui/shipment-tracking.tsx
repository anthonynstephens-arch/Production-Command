import type { PortalOrder } from "@/lib/shipstation";
function date(value?: string | null, time = false) {
  if (!value) return "Pending carrier estimate";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00-04:00` : value);
  if (!Number.isFinite(parsed.getTime())) return "Pending carrier estimate";
  return parsed.toLocaleString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric", year: "numeric", ...(time ? { hour: "numeric", minute: "2-digit" } : {}) });
}
export default function ShipmentTrackingDetails({ order }: { order: PortalOrder }) {
  const tracking = order.tracking;
  return <div className="shipment-tracking" onClick={event => event.stopPropagation()}>
    <a href={`https://t.17track.net/en#nums=${encodeURIComponent(order.trackingNumber || "")}`} target="_blank" rel="noreferrer">{order.carrier || "Carrier"} · {order.trackingNumber}</a>
    <strong>{tracking?.status?.replace(/([a-z])([A-Z])/g,"$1 $2") || "Awaiting tracking"}</strong>
    <span>Current location: <b>{tracking?.location || "Awaiting carrier scan"}</b></span>
    <span>Estimated delivery: <b>{date(tracking?.etaStart || tracking?.etaEnd)}{tracking?.etaStart && tracking?.etaEnd && tracking.etaStart.slice(0,10) !== tracking.etaEnd.slice(0,10) ? ` – ${date(tracking.etaEnd)}` : ""}</b></span>
    <small>{order.trackingError || tracking?.message}</small>
    {tracking?.lastEventAt && <small>Last scan: {date(tracking.lastEventAt,true)}</small>}
    {tracking?.checkedAt && <small>17TRACK checked: {date(tracking.checkedAt,true)}</small>}
    {!!tracking?.events.length && <details><summary>Tracking history ({tracking.events.length})</summary><ol>{tracking.events.map((event,index) => <li key={index}><b>{event.description}</b><span>{event.location || "Location not provided"}</span><small>{date(event.time,true)}</small></li>)}</ol></details>}
  </div>;
}
