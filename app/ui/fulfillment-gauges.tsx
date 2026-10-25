"use client";

import { useEffect, useState } from "react";
import type { PortalOrder } from "@/lib/shipstation";
import { fulfillmentTiming } from "@/lib/fulfillment-timing";

const formatDays = (days: number) => days.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export default function FulfillmentGauges({ orders }: { orders: PortalOrder[] }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const timing = fulfillmentTiming(orders, now ?? 0);
  const gauges = [
    { key: "fulfillment", label: "Order → fulfillment", sample: timing.fulfillment },
    { key: "delivery", label: "Order → delivery", sample: timing.delivery },
    { key: "transit", label: "Carrier transit", sample: timing.transit },
    { key: "pending", label: "Pending order age", sample: timing.pending },
  ];
  return <section className="fulfillment-timing" aria-labelledby="fulfillment-timing-title">
    <div className="fulfillment-timing-heading">
      <h2 id="fulfillment-timing-title">Fulfillment timing</h2>
      <p>Average elapsed days · delivered orders placed since Oct 4, 2026</p>
    </div>
    <div className="fulfillment-gauges">
      {gauges.map(({ key, label, sample }) => <article className="fulfillment-gauge" key={key}>
        <h3>{label}</h3>
        <div className="timing-total">
          <strong>{now === null || sample.days === null ? "—" : formatDays(sample.days)}</strong>
          <span>{now === null ? "Loading" : sample.days === null ? "No data yet" : "days avg."}</span>
        </div>
        <p className="timing-sample">{now === null ? "Loading orders…" : `${sample.count} ${key === "pending" ? "pending" : "delivered"} ${sample.count === 1 ? "order" : "orders"}`}</p>
      </article>)}
    </div>
    <p className="timing-note">Fulfillment + carrier transit = order to delivery (minor rounding differences may occur). All three use the same orders with confirmed order, ship and delivery dates. Pending age includes all currently pending orders.</p>
  </section>;
}
