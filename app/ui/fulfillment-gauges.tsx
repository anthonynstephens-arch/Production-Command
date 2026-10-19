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
    { key: "fulfillment", label: "Order → fulfillment", sample: timing.fulfillment, color: "#087f5b" },
    { key: "delivery", label: "Order → delivery", sample: timing.delivery, color: "#347bd4" },
    { key: "transit", label: "Carrier transit", sample: timing.transit, color: "#7960b5" },
    { key: "pending", label: "Pending order age", sample: timing.pending, color: "#b77a20" },
  ];
  // A common, labeled scale compares elapsed time without inventing service targets.
  const scale = Math.max(7, Math.ceil(Math.max(...gauges.map(gauge => gauge.sample.days ?? 0)) / 7) * 7);
  return <section className="fulfillment-timing" aria-labelledby="fulfillment-timing-title">
    <div className="fulfillment-timing-heading">
      <h2 id="fulfillment-timing-title">Fulfillment timing</h2>
      <p>Average calendar days · synced orders · shared scale 0–{scale} days</p>
    </div>
    <div className="fulfillment-gauges">
      {gauges.map(({ key, label, sample, color }) => <article className="fulfillment-gauge" key={key} style={{ "--gauge-color": color } as CSSProperties}>
        <h3>{label}</h3>
        <div className="timing-dial" role="img" aria-label={`${label}: ${now === null ? "loading" : sample.days === null ? "no dated orders" : `${formatDays(sample.days)} average days from ${sample.count} orders`}`}>
          <svg viewBox="0 0 180 108" aria-hidden="true">
            <path className="timing-dial-track" d="M 18 88 A 72 72 0 0 1 162 88" pathLength="100" />
            {sample.days !== null && <path className="timing-dial-fill" d="M 18 88 A 72 72 0 0 1 162 88" pathLength="100" strokeDasharray={`${sample.days / scale * 100} 100`} />}
          </svg>
          <div className="timing-dial-value" aria-hidden="true"><strong>{now === null || sample.days === null ? "—" : formatDays(sample.days)}</strong><span>{now === null ? "Loading" : sample.days === null ? "No data yet" : "days avg."}</span></div>
        </div>
      </article>)}
    </div>
  </section>;
}
