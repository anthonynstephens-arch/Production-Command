"use client";

import { useEffect, useMemo, useState } from "react";
import { Boxes, Box, Droplets, PackageCheck, PackageOpen, RefreshCw, Search, Settings2, ShieldCheck, Truck, TrendingUp, AlertTriangle, ExternalLink, Package, Mail, ShoppingBag } from "lucide-react";
import type { PortalOrder } from "@/lib/shipstation";

type Supply = { mats: number; boxes: number; ink: number; tape: number; tapeCoverage: number; tapeUsage: number; thankYouCards: number; polyBags: number };
type Props = { initialOrders: PortalOrder[]; initialConnected: boolean; initialMessage?: string };

const defaults: Supply = { mats: 250, boxes: 250, ink: 82, tape: 24, tapeCoverage: 25, tapeUsage: 0, thankYouCards: 250, polyBags: 250 };

function Meter({ value, warningAt = 25 }: { value: number; warningAt?: number }) {
  const tone = value <= warningAt ? "danger" : value <= 50 ? "warning" : "healthy";
  return <div className="meter" aria-label={`${value} percent`}><span className={tone} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function SupplyCard({ icon, title, value, unit, detail, percent, committed = 0, available, admin, onSet, extraControl }: { icon: React.ReactNode; title: string; value: number; unit: string; detail: string; percent: number; committed?: number; available?: number; admin: boolean; onSet: (value: number) => void; extraControl?: React.ReactNode }) {
  return (
    <article className="supply-card">
      <div className="card-top"><div className="card-title-line"><span className="icon-box">{icon}</span><h3>{title}</h3></div><span className={percent <= 25 ? "stock low" : "stock"}>{percent <= 25 ? "Low stock" : "In stock"}</span></div>
      <div className="supply-value">{value.toLocaleString()} <small>{unit} on hand</small></div>
      <Meter value={percent} />
      {available !== undefined && <div className="allocation"><div><span>Committed</span><strong>{committed}</strong></div><div><span>Available</span><strong>{available}</strong></div></div>}
      <div className="supply-footer"><span>{detail}</span><div className="control-stack">{admin && <label className="manual-adjust"><span>Set count</span><input type="number" min="0" value={value} onChange={(event) => onSet(Number(event.target.value))} /></label>}{admin && extraControl}</div></div>
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
    if (saved) { try { setSupplies({ ...defaults, ...JSON.parse(saved) }); } catch {} }
  }, []);

  useEffect(() => {
    const currentShipped = orders.filter((order) => order.status === "shipped" || order.status === "delivered").map((order) => order.id);
    const stored = window.localStorage.getItem("marsh-processed-shipments");
    if (!stored) {
      window.localStorage.setItem("marsh-processed-shipments", JSON.stringify(currentShipped));
      return;
    }
    let processed: string[] = [];
    try { processed = JSON.parse(stored); } catch {}
    const newShipments = orders.filter((order) => (order.status === "shipped" || order.status === "delivered") && !processed.includes(order.id));
    const unitsToDeduct = newShipments.reduce((sum, order) => sum + order.quantity, 0);
    if (unitsToDeduct > 0) {
      setSupplies((current) => {
        const tapeCoverage = Math.max(1, current.tapeCoverage || defaults.tapeCoverage);
        const accumulatedTapeUse = (current.tapeUsage || 0) + unitsToDeduct;
        const rollsUsed = Math.floor(accumulatedTapeUse / tapeCoverage);
        const next = {
          ...current,
          mats: Math.max(0, current.mats - unitsToDeduct),
          boxes: Math.max(0, current.boxes - unitsToDeduct),
          tape: Math.max(0, current.tape - rollsUsed),
          tapeUsage: accumulatedTapeUse % tapeCoverage,
          thankYouCards: Math.max(0, current.thankYouCards - unitsToDeduct),
          polyBags: Math.max(0, current.polyBags - unitsToDeduct),
        };
        window.localStorage.setItem("marsh-supplies", JSON.stringify(next));
        return next;
      });
      window.localStorage.setItem("marsh-processed-shipments", JSON.stringify([...new Set([...processed, ...currentShipped])]));
    }
  }, [orders]);

  const setSupply = (key: keyof Supply, value: number) => {
    if (view !== "admin") return;
    setSupplies((current) => {
      const next = { ...current, [key]: Math.max(0, Number.isFinite(value) ? value : 0) };
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
  const committedUnits = orders.filter((order) => order.status === "pending").reduce((sum, order) => sum + order.quantity, 0);
  const availableMats = Math.max(0, supplies.mats - committedUnits);
  const availableBoxes = Math.max(0, supplies.boxes - committedUnits);
  const tapeCoverage = Math.max(1, supplies.tapeCoverage);
  const committedTapeRolls = Math.ceil((supplies.tapeUsage + committedUnits) / tapeCoverage);
  const availableTape = Math.max(0, supplies.tape - committedTapeRolls);
  const availableTapeMatCapacity = Math.max(0, (supplies.tape * tapeCoverage) - supplies.tapeUsage - committedUnits);
  const availableThankYouCards = Math.max(0, supplies.thankYouCards - committedUnits);
  const availablePolyBags = Math.max(0, supplies.polyBags - committedUnits);
  const availableCapacity = Math.min(availableMats, availableBoxes, availableTapeMatCapacity, availableThankYouCards, availablePolyBags);
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
          <SupplyCard icon={<PackageOpen size={21}/>} title="Blank coir mats" value={supplies.mats} unit="mats" detail="Newly shipped units deduct automatically" percent={supplies.mats > 25 ? 100 : supplies.mats * 4} committed={committedUnits} available={availableMats} admin={view === "admin"} onSet={(value) => setSupply("mats", value)} />
          <SupplyCard icon={<Box size={21}/>} title="Shipping boxes" value={supplies.boxes} unit="boxes" detail="One box reserved per pending unit" percent={supplies.boxes > 25 ? 100 : supplies.boxes * 4} committed={committedUnits} available={availableBoxes} admin={view === "admin"} onSet={(value) => setSupply("boxes", value)} />
          <SupplyCard icon={<Droplets size={21}/>} title="Ink supply" value={inkPercent} unit="%" detail={inkPercent <= 25 ? "Reorder recommended" : "Supply level healthy"} percent={inkPercent} admin={view === "admin"} onSet={(value) => setSupply("ink", Math.min(100, value))} />
          <SupplyCard icon={<Package size={21}/>} title="Packing tape" value={supplies.tape} unit="rolls" detail={`${supplies.tapeUsage} of ${tapeCoverage} mat uses on current roll`} percent={supplies.tape > 10 ? 100 : supplies.tape * 10} committed={committedTapeRolls} available={availableTape} admin={view === "admin"} onSet={(value) => setSupply("tape", value)} extraControl={<label className="manual-adjust"><span>Mats per roll</span><input type="number" min="1" value={tapeCoverage} onChange={(event) => setSupply("tapeCoverage", Math.max(1, Number(event.target.value)))} /></label>} />
          <SupplyCard icon={<Mail size={21}/>} title="Thank-you cards" value={supplies.thankYouCards} unit="cards" detail="One reserved per pending mat" percent={supplies.thankYouCards > 25 ? 100 : supplies.thankYouCards * 4} committed={committedUnits} available={availableThankYouCards} admin={view === "admin"} onSet={(value) => setSupply("thankYouCards", value)} />
          <SupplyCard icon={<ShoppingBag size={21}/>} title="Poly bags" value={supplies.polyBags} unit="bags" detail="One reserved per pending mat" percent={supplies.polyBags > 25 ? 100 : supplies.polyBags * 4} committed={committedUnits} available={availablePolyBags} admin={view === "admin"} onSet={(value) => setSupply("polyBags", value)} />
        </section>

        <section className="metrics-grid">
          <article className="metric"><span className="metric-icon amber"><PackageOpen size={19}/></span><div><p>Orders pending</p><strong>{counts.pending}</strong><small>Ready for production</small></div></article>
          <article className="metric"><span className="metric-icon blue"><Truck size={19}/></span><div><p>Orders shipped</p><strong>{counts.shipped}</strong><small>In carrier network</small></div></article>
          <article className="metric"><span className="metric-icon green"><PackageCheck size={19}/></span><div><p>Orders delivered</p><strong>{counts.delivered}</strong><small>Successfully completed</small></div></article>
          <article className="metric"><span className="metric-icon violet"><TrendingUp size={19}/></span><div><p>Total units</p><strong>{counts.units}</strong><small>Across visible orders</small></div></article>
        </section>

        <section className="insights-row">
          <article className="panel capacity-panel"><div className="panel-heading"><div><p className="eyebrow">AVAILABLE AFTER COMMITMENTS</p><h2>{availableCapacity} orders</h2></div><span className="icon-box"><Settings2 size={19}/></span></div><p>After reserving supplies for <strong>{committedUnits} pending units</strong>, you can accept up to <strong>{availableCapacity} additional single-mat orders</strong>.</p><div className="capacity-bars"><div><span>Available mats</span><b>{availableMats}</b><Meter value={availableMats > 25 ? 100 : availableMats * 4}/></div><div><span>Available boxes</span><b>{availableBoxes}</b><Meter value={availableBoxes > 25 ? 100 : availableBoxes * 4}/></div><div><span>Ink</span><b>{inkPercent}%</b><Meter value={inkPercent}/></div></div></article>
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
