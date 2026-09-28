"use client";

import { useEffect, useMemo, useState } from "react";
import type { PortalOrder } from "@/lib/shipstation";

function detroitDay(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export default function OperationalCharts({ orders, availability }: {
  orders: PortalOrder[];
  availability: Array<{ label: string; value: number; tone: string }>;
}) {
  const [today, setToday] = useState("");
  useEffect(() => { setToday(detroitDay(new Date())); }, []);
  const days = useMemo(() => {
    if (!today) return [];
    const last = new Date(`${today}T12:00:00Z`);
    const counts = new Map<string, number>();
    for (const order of orders) {
      const time = new Date(order.orderDate);
      if (!Number.isFinite(time.getTime())) continue;
      const key = detroitDay(time);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(last);
      date.setUTCDate(date.getUTCDate() - 13 + index);
      const key = date.toISOString().slice(0, 10);
      return { key, label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date), count: counts.get(key) ?? 0 };
    });
  }, [orders, today]);
  const max = Math.max(1, ...days.map((day) => day.count));
  const points = days.map((day, index) => `${24 + index * 42},${172 - day.count / max * 136}`).join(" ");
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const largest = Math.max(1, ...availability.map((item) => item.value));

  return <section className="operational-charts" aria-label="Order and supply charts">
    <article className="panel trend-panel">
      <div className="analytics-heading"><div><p className="eyebrow">ORDER ACTIVITY</p><h2>Orders received · 14 days</h2></div><strong>{total}<span>new orders</span></strong></div>
      {days.length ? <div className="trend-visual" role="img" aria-label={`Daily orders for the last 14 days: ${days.map((day) => `${day.label} ${day.count}`).join(", ")}`}>
        <svg viewBox="0 0 594 196" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="marsh-trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#438ef1" stopOpacity=".29" /><stop offset="100%" stopColor="#438ef1" stopOpacity="0" /></linearGradient></defs>
          {[36, 104, 172].map((y) => <line key={y} x1="24" x2="570" y1={y} y2={y} stroke="#e8edf5" strokeWidth="1" />)}
          <polygon points={`24,172 ${points} 570,172`} fill="url(#marsh-trend-fill)" />
          <polyline points={points} fill="none" stroke="#438ef1" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          {days.map((day, index) => <circle key={day.key} cx={24 + index * 42} cy={172 - day.count / max * 136} r="4" fill="#fff" stroke="#438ef1" strokeWidth="2.5"><title>{day.label}: {day.count} orders</title></circle>)}
        </svg>
        <div className="trend-labels"><span>{days[0].label}</span><span>{days[6].label}</span><span>{days[13].label}</span></div>
      </div> : <p className="chart-empty">Loading recent order activity…</p>}
    </article>
    <article className="panel availability-panel">
      <div className="analytics-heading"><div><p className="eyebrow">AFTER CURRENT COMMITMENTS</p><h2>Supply runway</h2></div></div>
      <div className="availability-bars">{availability.map((item) => <div className="availability-row" key={item.label}>
        <div><span>{item.label}</span><strong>{item.value.toLocaleString()}</strong></div>
        <div className="availability-track" role="img" aria-label={`${item.value} ${item.label} available after commitments`}><i className={item.tone} style={{ width: `${item.value / largest * 100}%` }} /></div>
      </div>)}</div>
      <p className="availability-note">Available quantities after pending orders. Stock for the scheduled batch is not reserved until it is printed.</p>
    </article>
  </section>;
}
