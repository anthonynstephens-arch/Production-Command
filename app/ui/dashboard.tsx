"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Boxes, Box, Droplets, PackageCheck, PackageOpen, RefreshCw, Search, Settings2, ShieldCheck, Truck, TrendingUp, AlertTriangle, ExternalLink, Package, Mail, ShoppingBag, RectangleHorizontal } from "lucide-react";
import type { PortalOrder } from "@/lib/shipstation";
import type { PortalSession } from "@/lib/auth";
import AccessManager from "./access-manager";
import FinancialLogistics from "./financial-logistics";

type Supply = { mats: number; boxes: number; ink: number; tape: number; tapeCoverage: number; tapeUsage: number; thankYouCards: number; polyBags: number };
type SupplyKey = "mats" | "boxes" | "ink" | "tape" | "thankYouCards" | "polyBags";
type Props = { initialOrders: PortalOrder[]; initialConnected: boolean; initialMessage?: string; session: PortalSession };

const defaults: Supply = { mats: 250, boxes: 250, ink: 82, tape: 24, tapeCoverage: 25, tapeUsage: 0, thankYouCards: 250, polyBags: 250 };

function Meter({ value, warningAt = 25 }: { value: number; warningAt?: number }) {
  const tone = value <= warningAt ? "danger" : value <= 50 ? "warning" : "healthy";
  return <div className="meter" aria-label={`${value} percent`}><span className={tone} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function SupplyCard({ icon, title, value, unit, detail, percent, committed = 0, available, incoming = 0, admin, onSet, extraControl, verticalMeter = false }: { icon: React.ReactNode; title: string; value: number; unit: string; detail: string; percent: number; committed?: number; available?: number; incoming?: number; admin: boolean; onSet: (value: number) => void; extraControl?: React.ReactNode; verticalMeter?: boolean }) {
  return (
    <article className={`supply-card${percent <= 25 ? " low-supply" : ""}${verticalMeter ? " ink-card" : ""}`}>
      <div className="card-top"><div className="card-title-line"><span className="icon-box">{icon}</span><h3>{title}</h3></div></div>
      <div className="supply-value">{value.toLocaleString()} <small>{unit} on hand</small></div>
      {verticalMeter ? <div className="ink-level-wrap"><div className="ink-level" aria-label={`${percent} percent ink`}><span style={{ height: `${percent}%` }} /></div><strong>{percent}%</strong></div> : <Meter value={percent} />}
      {incoming > 0 && <div className="incoming-supply"><span>Incoming</span><strong>+{incoming.toLocaleString()}</strong></div>}
      {available !== undefined && <div className="allocation"><div><span>Committed</span><strong>{committed}</strong></div><div><span>Available</span><strong>{available}</strong></div></div>}
      <div className="supply-footer"><span>{detail}</span><div className="control-stack">{admin && <label className="manual-adjust"><span>Set count</span><input type="number" min="0" value={value} onChange={(event) => onSet(Number(event.target.value))} /></label>}{admin && extraControl}</div></div>
    </article>
  );
}

function StatusBadge({ status }: { status: PortalOrder["status"] }) {
  const labels = { pending: "Pending", shipped: "Shipped", delivered: "Delivered" };
  return <span className={`status ${status}`}><i />{labels[status]}</span>;
}

export default function Dashboard({ initialOrders, initialConnected, initialMessage, session }: Props) {
  const router = useRouter();
  const [supplies, setSupplies] = useState<Supply>(defaults);
  const [orders, setOrders] = useState(initialOrders);
  const [connected, setConnected] = useState(initialConnected);
  const [syncMessage, setSyncMessage] = useState(initialMessage);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | PortalOrder["status"]>("all");
  const [view, setView] = useState<"admin" | "marsh">(session.role === "admin" ? "admin" : "marsh");
  const [incoming, setIncoming] = useState<Partial<Record<SupplyKey, number>>>({});

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
  const receiveSupply = (key: SupplyKey, quantity: number) => setSupplies((current) => {
    const next = { ...current, [key]: key === "ink" ? Math.min(100, current[key] + quantity) : current[key] + quantity };
    window.localStorage.setItem("marsh-supplies", JSON.stringify(next));
    return next;
  });

  const sync = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/shipstation", { cache: "no-store" });
      const data = await response.json();
      setOrders(data.orders ?? []); setConnected(Boolean(data.connected)); setSyncMessage(data.message);
    } finally { setSyncing(false); }
  };

  const logout = async () => { await fetch("/api/session/logout", { method: "POST" }); router.push("/login"); router.refresh(); };

  const counts = useMemo(() => ({
    pending: orders.filter((order) => order.status === "pending").length,
    shipped: orders.filter((order) => order.status === "shipped").length,
    delivered: orders.filter((order) => order.status === "delivered").length,
    units: orders.reduce((sum, order) => sum + order.quantity, 0),
  }), [orders]);

  const matTotals = useMemo(() => {
    const totals = { whatupdoe: 0, didYouCall: 0, upsideDown: 0, marshSupply: 0 };
    for (const order of orders) {
      const lines = order.items?.length ? order.items : [{ name: order.item, quantity: order.quantity }];
      for (const line of lines) {
        const name = line.name.toLowerCase();
        if (name.includes("did you call")) totals.didYouCall += line.quantity;
        else if (name.includes("upside down") || name.includes("upside-down")) totals.upsideDown += line.quantity;
        else if (name.includes("whatupdoe") || name.includes("what up doe")) totals.whatupdoe += line.quantity;
        else if (name.includes("marsh supply") || name.includes("marsh")) totals.marshSupply += line.quantity;
      }
    }
    return totals;
  }, [orders]);

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
        <div className="brand"><Image className="header-logo" src="/marsh-supply-logo-web.png" alt="Marsh Supply" width={116} height={72} priority unoptimized/><div><strong>PRODUCTION COMMAND</strong><span>Marsh Supply Portal</span></div></div>
        <div className="header-actions"><div className={`connection ${connected ? "live" : "demo"}`}><i />{connected ? "ShipStation connected" : "ShipStation setup needed"}</div>{session.role === "admin" && <button className="view-toggle" onClick={() => setView(view === "admin" ? "marsh" : "admin")}><ShieldCheck size={16}/>{view === "admin" ? "Admin view" : "Preview Marsh view"}</button>}<button className="view-toggle" onClick={logout}>{session.name} · Sign out</button></div>
      </header>

      <div className="page-shell">
        <section className="page-heading"><div><p className="kicker">FULFILLMENT OVERVIEW</p><h1>Marsh Supply Command Center</h1><p>Inventory and order movement across the Whatupdoe mat program.</p></div><button className="sync-button" onClick={sync} disabled={syncing}><RefreshCw size={17} className={syncing ? "spin" : ""}/>{syncing ? "Syncing…" : "Sync ShipStation"}</button></section>

        {!connected && <div className="setup-banner"><AlertTriangle size={18}/><div><strong>Live ShipStation data is not connected yet.</strong><span>{syncMessage ?? "Add the API key to activate order syncing."} Showing representative data until setup is completed.</span></div></div>}

        <div className="dashboard-section-heading"><div><span>01</span><h2>Inventory &amp; Supplies</h2></div><p>On-hand, committed, and available materials</p></div>
        <section className="supply-grid">
          <SupplyCard icon={<RectangleHorizontal size={23}/>} title="Blank coir mats" value={supplies.mats} unit="mats" detail="Newly shipped units deduct automatically" percent={supplies.mats > 25 ? 100 : supplies.mats * 4} committed={committedUnits} available={availableMats} incoming={incoming.mats} admin={view === "admin"} onSet={(value) => setSupply("mats", value)} />
          <SupplyCard icon={<Box size={21}/>} title="Shipping boxes" value={supplies.boxes} unit="boxes" detail="One box reserved per pending unit" percent={supplies.boxes > 25 ? 100 : supplies.boxes * 4} committed={committedUnits} available={availableBoxes} incoming={incoming.boxes} admin={view === "admin"} onSet={(value) => setSupply("boxes", value)} />
          <SupplyCard icon={<Package size={21}/>} title="Packing tape" value={supplies.tape} unit="rolls" detail={`${supplies.tapeUsage} of ${tapeCoverage} mat uses on current roll`} percent={supplies.tape > 10 ? 100 : supplies.tape * 10} committed={committedTapeRolls} available={availableTape} incoming={incoming.tape} admin={view === "admin"} onSet={(value) => setSupply("tape", value)} extraControl={<label className="manual-adjust"><span>Mats per roll</span><input type="number" min="1" value={tapeCoverage} onChange={(event) => setSupply("tapeCoverage", Math.max(1, Number(event.target.value)))} /></label>} />
          <SupplyCard icon={<Mail size={21}/>} title="Thank-you cards" value={supplies.thankYouCards} unit="cards" detail="One reserved per pending mat" percent={supplies.thankYouCards > 25 ? 100 : supplies.thankYouCards * 4} committed={committedUnits} available={availableThankYouCards} incoming={incoming.thankYouCards} admin={view === "admin"} onSet={(value) => setSupply("thankYouCards", value)} />
          <SupplyCard icon={<ShoppingBag size={21}/>} title="Poly bags" value={supplies.polyBags} unit="bags" detail="One reserved per pending mat" percent={supplies.polyBags > 25 ? 100 : supplies.polyBags * 4} committed={committedUnits} available={availablePolyBags} incoming={incoming.polyBags} admin={view === "admin"} onSet={(value) => setSupply("polyBags", value)} />
          <SupplyCard icon={<Droplets size={21}/>} title="Ink supply" value={inkPercent} unit="%" detail={inkPercent <= 25 ? "Reorder recommended" : "Supply level healthy"} percent={inkPercent} incoming={incoming.ink} verticalMeter admin={view === "admin"} onSet={(value) => setSupply("ink", Math.min(100, value))} />
        </section>

        <div className="dashboard-section-heading pipeline-heading"><div><span>02</span><h2>Order Pipeline</h2></div><p>Current fulfillment movement at a glance</p></div>
        <section className="metrics-grid">
          <article className="metric"><span className="metric-icon amber"><PackageOpen size={19}/></span><div><p>Orders pending</p><strong>{counts.pending}</strong><small>Ready for production</small></div></article>
          <article className="metric"><span className="metric-icon blue"><Truck size={19}/></span><div><p>Orders shipped</p><strong>{counts.shipped}</strong><small>In carrier network</small></div></article>
          <article className="metric"><span className="metric-icon green"><PackageCheck size={19}/></span><div><p>Orders delivered</p><strong>{counts.delivered}</strong><small>Successfully completed</small></div></article>
          <article className="metric"><span className="metric-icon violet"><TrendingUp size={19}/></span><div><p>Total units</p><strong>{counts.units}</strong><small>Across visible orders</small></div></article>
        </section>

        <div className="dashboard-section-heading product-heading"><div><span>03</span><h2>Mat Sales</h2></div><p>Total units sold by design</p></div>
        <section className="metrics-grid product-sales-grid">
          <article className="metric"><span className="metric-icon amber"><RectangleHorizontal size={19}/></span><div><p>Whatupdoe</p><strong>{matTotals.whatupdoe}</strong><small>mats sold</small></div></article>
          <article className="metric"><span className="metric-icon blue"><RectangleHorizontal size={19}/></span><div><p>Did You Call First?</p><strong>{matTotals.didYouCall}</strong><small>mats sold</small></div></article>
          <article className="metric"><span className="metric-icon green"><RectangleHorizontal size={19}/></span><div><p>Upside Down Welcome</p><strong>{matTotals.upsideDown}</strong><small>mats sold</small></div></article>
          <article className="metric"><span className="metric-icon violet"><RectangleHorizontal size={19}/></span><div><p>Marsh Supply</p><strong>{matTotals.marshSupply}</strong><small>mats sold</small></div></article>
        </section>

        <section className="insights-row">
          <article className="panel capacity-panel"><div className="panel-heading"><div><p className="eyebrow">AVAILABLE AFTER COMMITMENTS</p><h2>{availableCapacity} orders</h2></div><span className="icon-box"><Settings2 size={19}/></span></div><p>After reserving supplies for <strong>{committedUnits} pending units</strong>, you can accept up to <strong>{availableCapacity} additional single-mat orders</strong>.</p><div className="capacity-bars"><div><span>Available mats</span><b>{availableMats}</b><Meter value={availableMats > 25 ? 100 : availableMats * 4}/></div><div><span>Available boxes</span><b>{availableBoxes}</b><Meter value={availableBoxes > 25 ? 100 : availableBoxes * 4}/></div><div><span>Ink</span><b>{inkPercent}%</b><Meter value={inkPercent}/></div></div></article>
          <article className="panel cadence-panel"><p className="eyebrow">FULFILLMENT CADENCE</p><h2>Monday · Wednesday · Friday</h2><p>Orders are prepared and processed through ShipStation three days each week.</p><div className="cadence-days"><span className="active">M</span><span>T</span><span className="active">W</span><span>T</span><span className="active">F</span><span>S</span><span>S</span></div><div className="next-run"><Truck size={17}/><span>Next processing run</span><strong>Monday</strong></div></article>
        </section>

        <FinancialLogistics session={session} onIncomingChange={setIncoming} onInventoryReceived={receiveSupply}/>

        <section className="panel orders-panel"><div className="orders-head"><div><p className="eyebrow">ORDER ACTIVITY</p><h2>Fulfillment queue</h2></div><div className="table-actions"><label className="search"><Search size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search orders" /></label><select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option></select></div></div>
          <div className="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Product</th><th>Qty</th><th>Status</th><th>Tracking</th><th>Date</th></tr></thead><tbody>{filtered.map((order) => <tr key={order.id}><td><strong>{order.orderNumber}</strong></td><td>{order.customer}</td><td className="product-cell">{order.item}</td><td>{order.quantity}</td><td><StatusBadge status={order.status}/></td><td>{order.trackingNumber ? <span className="tracking">{order.carrier}<ExternalLink size={13}/></span> : <span className="muted">Not assigned</span>}</td><td>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(order.shipDate ?? order.orderDate))}</td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty">No orders match this search.</div>}</div>
          <footer className="panel-footer"><span>Showing {filtered.length} of {orders.length} orders</span><span>Last sync: just now</span></footer>
        </section>
        {session.role === "admin" && view === "admin" && <AccessManager/>}
      </div>
    </main>
  );
}
