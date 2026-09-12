"use client";

import { useEffect, useMemo, useState } from "react";
import { Boxes, Box, Droplets, PackageCheck, PackageOpen, RefreshCw, Search, Settings2, ShieldCheck, Truck, TrendingUp, AlertTriangle, Minus, Plus, ExternalLink } from "lucide-react";
import type { PortalOrder } from "@/lib/shipstation";

type Supply = { mats: number; boxes: number; ink: number };
type Props = { initialOrders: PortalOrder[]; initialConnected: boolean; initialMessage?: string };

const defaults: Supply = { mats: 250, boxes: 250, ink: 82 };

function Meter({ value, warningAt = 25 }: { value: number; warningAt?: number }) {
  const tone = value <= warningAt ? "danger" : value <= 50 ? "warning" : "healthy";
  return <div className="meter" aria-label={`${value} percent`}><span className={tone} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function SupplyCard({ icon, title, value, unit, detail, onDecrease, onIncrease, percent }: { icon: React.ReactNode; title: string; value: number; unit: string; detail: string; onDecrease: () => void; onIncrease: () => void; percent: number }) {
  return (
    <article className="supply-card">
      <div className="card-top"><span className="icon-box">{icon}</span><span className={percent <= 25 ? "stock low" : "stock"}>{percent <= 25 ? "Low stock" : "In stock"}</span></div>
      <div><p className="eyebrow">{title}</p><div className="supply-value">{value.toLocaleString()} <small>{unit}</small></div></div>
      <Meter value={percent} />
      <div className="supply-footer"><span>{detail}</span><div className="stepper"><button onClick={onDecrease} aria-label={`Decrease ${title}`}><Minus size={15}/></button><button onClick={onIncrease} aria-label={`Increase ${title}`}><Plus size={15}/></button></div></div>
    </article>
  );
}

function StatusBadge({ status }: { status: PortalOrder["status"] }) {
  const labels = { pending: "Pending", shipped: "Shipped", delivered: "Delivered" };
  return <span className={`status ${status}`}><i />{labels[status]}</span>;
}

export default function Dashboard({ initialOrders, initialConnected, initialMessage }: Props) {
  const [supplies, setSupplies] = useState<Supply>(defaults);
  const [orders, setOrders] = useState(initialOrders);
  const [connected, setConnected] = useState(initialConnected);
  const [syncMessage, setSyncMessage] = useState(initialMessage);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | PortalOrder["status"]>("all");
  const [view, setView] = useState<"admin" | "marsh">("admin");

  useEffect(() => {
    const saved = window.localStorage.getItem("marsh-supplies");
    if (saved) { try { setSupplies(JSON.parse(saved)); } catch {} }
  }, []);

  const updateSupply = (key: keyof Supply, delta: number) => {
    if (view !== "admin") return;
    setSupplies((current) => {
      const next = { ...current, [key]: Math.max(0, current[key] + delta) };
      window.localStorage.setItem("marsh-supplies", JSON.stringify(next));
      return next;
    });
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/shipstation", { cache: "no-store" });
      const data = await response.json();
      setOrders(data.orders ?? []); setConnected(Boolean(data.connected)); setSyncMessage(data.message);
    } finally { setSyncing(false); }
  };

  const counts = useMemo(() => ({
    pending: orders.filter((order) => order.status === "pending").length,
    shipped: orders.filter((order) => order.status === "shipped").length,
    delivered: orders.filter((order) => order.status === "delivered").length,
    units: orders.reduce((sum, order) => sum + order.quantity, 0),
  }), [orders]);

  const filtered = orders.filter((order) => (filter === "all" || order.status === filter) && `${order.orderNumber} ${order.customer} ${order.item}`.toLowerCase().includes(query.toLowerCase()));
  const capacity = Math.min(supplies.mats, supplies.boxes);
  const inkPercent = Math.max(0, Math.min(100, supplies.ink));

  return (
    <main>
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Boxes size={22}/></div><div><strong>PRODUCTION COMMAND</strong><span>Marsh Supply Portal</span></div></div>
        <div className="header-actions"><div className={`connection ${connected ? "live" : "demo"}`}><i />{connected ? "ShipStation connected" : "ShipStation setup needed"}</div><button className="view-toggle" onClick={() => setView(view === "admin" ? "marsh" : "admin")}><ShieldCheck size={16}/>{view === "admin" ? "Admin view" : "Marsh view"}</button></div>
      </header>

      <div className="page-shell">
        <section className="page-heading"><div><p className="kicker">FULFILLMENT OVERVIEW</p><h1>Marsh Supply Command Center</h1><p>Inventory and order movement across the Whatupdoe mat program.</p></div><button className="sync-button" onClick={sync} disabled={syncing}><RefreshCw size={17} className={syncing ? "spin" : ""}/>{syncing ? "Syncing…" : "Sync ShipStation"}</button></section>

        {!connected && <div className="setup-banner"><AlertTriangle size={18}/><div><strong>Live ShipStation data is not connected yet.</strong><span>{syncMessage ?? "Add the API key to activate order syncing."} Showing representative data until setup is completed.</span></div></div>}

        <section className="supply-grid">
          <SupplyCard icon={<PackageOpen size={21}/>} title="Blank coir mats" value={supplies.mats} unit="mats" detail={`${Math.round((supplies.mats / 250) * 100)}% of standard batch`} percent={Math.round((supplies.mats / 250) * 100)} onDecrease={() => updateSupply("mats", -1)} onIncrease={() => updateSupply("mats", 1)} />
          <SupplyCard icon={<Box size={21}/>} title="Shipping boxes" value={supplies.boxes} unit="boxes" detail={`${capacity} complete orders ready`} percent={Math.round((supplies.boxes / 250) * 100)} onDecrease={() => updateSupply("boxes", -1)} onIncrease={() => updateSupply("boxes", 1)} />
          <SupplyCard icon={<Droplets size={21}/>} title="Ink supply" value={inkPercent} unit="%" detail={inkPercent <= 25 ? "Reorder recommended" : "Supply level healthy"} percent={inkPercent} onDecrease={() => updateSupply("ink", -5)} onIncrease={() => updateSupply("ink", 5)} />
        </section>

        <section className="metrics-grid">
          <article className="metric"><span className="metric-icon amber"><PackageOpen size={19}/></span><div><p>Orders pending</p><strong>{counts.pending}</strong><small>Ready for production</small></div></article>
          <article className="metric"><span className="metric-icon blue"><Truck size={19}/></span><div><p>Orders shipped</p><strong>{counts.shipped}</strong><small>In carrier network</small></div></article>
          <article className="metric"><span className="metric-icon green"><PackageCheck size={19}/></span><div><p>Orders delivered</p><strong>{counts.delivered}</strong><small>Successfully completed</small></div></article>
          <article className="metric"><span className="metric-icon violet"><TrendingUp size={19}/></span><div><p>Total units</p><strong>{counts.units}</strong><small>Across visible orders</small></div></article>
        </section>

        <section className="insights-row">
          <article className="panel capacity-panel"><div className="panel-heading"><div><p className="eyebrow">PRODUCTION CAPACITY</p><h2>{capacity} orders</h2></div><span className="icon-box"><Settings2 size={19}/></span></div><p>Current mats and boxes support up to <strong>{capacity} single-mat shipments</strong> before restocking.</p><div className="capacity-bars"><div><span>Mats</span><b>{supplies.mats}</b><Meter value={Math.min(100, supplies.mats / 2.5)}/></div><div><span>Boxes</span><b>{supplies.boxes}</b><Meter value={Math.min(100, supplies.boxes / 2.5)}/></div><div><span>Ink</span><b>{inkPercent}%</b><Meter value={inkPercent}/></div></div></article>
          <article className="panel cadence-panel"><p className="eyebrow">FULFILLMENT CADENCE</p><h2>Monday · Wednesday · Friday</h2><p>Orders are prepared and processed through ShipStation three days each week.</p><div className="cadence-days"><span className="active">M</span><span>T</span><span className="active">W</span><span>T</span><span className="active">F</span><span>S</span><span>S</span></div><div className="next-run"><Truck size={17}/><span>Next processing run</span><strong>Monday</strong></div></article>
        </section>

        <section className="panel orders-panel"><div className="orders-head"><div><p className="eyebrow">ORDER ACTIVITY</p><h2>Fulfillment queue</h2></div><div className="table-actions"><label className="search"><Search size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search orders" /></label><select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option></select></div></div>
          <div className="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Product</th><th>Qty</th><th>Status</th><th>Tracking</th><th>Date</th></tr></thead><tbody>{filtered.map((order) => <tr key={order.id}><td><strong>{order.orderNumber}</strong></td><td>{order.customer}</td><td className="product-cell">{order.item}</td><td>{order.quantity}</td><td><StatusBadge status={order.status}/></td><td>{order.trackingNumber ? <span className="tracking">{order.carrier}<ExternalLink size={13}/></span> : <span className="muted">Not assigned</span>}</td><td>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(order.shipDate ?? order.orderDate))}</td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty">No orders match this search.</div>}</div>
          <footer className="panel-footer"><span>Showing {filtered.length} of {orders.length} orders</span><span>Last sync: just now</span></footer>
        </section>
      </div>
    </main>
  );
}
