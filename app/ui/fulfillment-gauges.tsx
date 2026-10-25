"use client";

import { useEffect, useState, type CSSProperties } from "react";
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
  const scale = Math.max(7, Math.ceil(Math.max(...gauges.map(({ sample }) => sample.days ?? 0)) / 7) * 7);
  const colors = ["#087f5b", "#347bd4", "#7960b5", "#b77a20"];
  return <section className="fulfillment-timing" aria-labelledby="fulfillment-timing-title">
    <div className="fulfillment-timing-heading">
      <h2 id="fulfillment-timing-title">Fulfillment timing</h2>
    </div>
    <div className="fulfillment-gauges">
      {gauges.map(({ key, label, sample }, index) => <article className="fulfillment-gauge" key={key} style={{ "--meter-color": colors[index] } as CSSProperties}>
        <h3>{label}</h3>
        <div className="timing-meter">
          <svg viewBox="0 0 180 108" aria-hidden="true">
            <path className="timing-meter-track" d="M 18 88 A 72 72 0 0 1 162 88" pathLength="100" />
            {now !== null && sample.days !== null && <path className="timing-meter-fill" d="M 18 88 A 72 72 0 0 1 162 88" pathLength="100" strokeDasharray={`${Math.min(100, sample.days / scale * 100)} 100`} />}
          </svg>
        <div className="timing-total">
          <strong>{now === null || sample.days === null ? "—" : formatDays(sample.days)}</strong>
          <span>{now === null ? "Loading" : sample.days === null ? "No data yet" : "days avg."}</span>
        </div>
        </div>
        <div className="timing-meter-scale" aria-label={`Meter scale: zero to ${scale} days`}><span>0</span><span>{scale} days</span></div>
        <p className="timing-sample">{now === null ? "Loading orders…" : `${sample.count} ${key === "pending" ? "pending" : "delivered"} ${sample.count === 1 ? "order" : "orders"}`}</p>
      </article>)}
    </div>
    <p className="timing-note">Fulfillment + carrier transit = order to delivery (minor rounding differences may occur). All three use the same orders with confirmed order, ship and delivery dates. Pending age includes all currently pending orders.</p>
  </section>;
}
