"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Boxes, Box, Droplets, PackageCheck, PackageOpen, RefreshCw, Search, Settings2, ShieldCheck, Truck, TrendingUp, AlertTriangle, ExternalLink, Package, Mail, ShoppingBag, RectangleHorizontal, Menu, X, Factory } from "lucide-react";
import type { PortalOrder } from "@/lib/shipstation";
import type { PortalSession } from "@/lib/auth";
import AccessManager from "./access-manager";
import PortalAccess from "./portal-access";
import NotificationSettings, { disconnectPushDevice } from "./notification-settings";
import FinancialLogistics from "./financial-logistics";
import Messenger from "./messenger";

type Supply = { mats: number; boxes: number; ink: number; tape: number; tapeCoverage: number; tapeUsage: number; thankYouCards: number; polyBags: number };
type SupplyKey = "mats" | "boxes" | "ink" | "tape" | "thankYouCards" | "polyBags";
type Props = { initialOrders: PortalOrder[]; initialConnected: boolean; initialMessage?: string; session: PortalSession };

const defaults: Supply = { mats: 250, boxes: 250, ink: 82, tape: 24, tapeCoverage: 25, tapeUsage: 0, thankYouCards: 250, polyBags: 250 };

function Meter({ value, warningAt = 25 }: { value: number; warningAt?: number }) {
  const tone = value <= warningAt ? "danger" : value <= 50 ? "warning" : "healthy";
  return <div className="meter" aria-label={`${value} percent`}><span className={tone} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function SupplyCard({ icon, title, value, unit, detail, percent, committed = 0, available, incoming = 0, admin, onSet, extraControl, verticalMeter = false, low }: { icon: React.ReactNode; title: string; value: number; unit: string; detail: string; percent: number; committed?: number; available?: number; incoming?: number; admin: boolean; onSet: (value: number) => Promise<void>; extraControl?: React.ReactNode; verticalMeter?: boolean; low?: boolean }) {
  const [draft, setDraft] = useState(String(value));
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  useEffect(() => { setDraft(String(value)); }, [value]);
  const lowSupply = low ?? percent <= 25;
  return (
    <article className={`supply-card${lowSupply ? " low-supply" : ""}${verticalMeter ? " ink-card" : ""}`}>
      {lowSupply && <span className="card-warning" title="Purchase recommended" aria-label="Purchase recommended"><AlertTriangle size={17}/></span>}
      <div className="card-top"><div className="card-title-line"><span className="icon-box">{icon}</span><h3>{title}</h3></div></div>
      <div className="supply-value">{value.toLocaleString()} <small>{unit} on hand</small></div>
      {verticalMeter ? <div className="ink-level-wrap"><div className="ink-level" aria-label={`${percent} percent ink`}><span style={{ height: `${percent}%` }} /></div><strong>{percent}%</strong></div> : <Meter value={percent} />}
      {incoming > 0 && <div className="incoming-supply"><span>Incoming</span><strong>+{incoming.toLocaleString()}</strong></div>}
      {available !== undefined && <div className="allocation"><div><span>Committed</span><strong>{committed}</strong></div><div><span>Available</span><strong>{available}</strong></div></div>}
      <div className="supply-footer"><span>{detail}</span>{admin && <details className="stock-editor"><summary>Adjust stock</summary><form onSubmit={async (event) => { event.preventDefault(); if (draft.trim() && Number.isFinite(Number(draft)) && Number(draft) >= 0) { setSaving(true); setSaveError(""); try { await onSet(Number(draft)); setSaved(true); } catch (error) { setSaveError(error instanceof Error ? error.message : "Could not save inventory."); } finally { setSaving(false); } } }}><label className="manual-adjust"><span>New {verticalMeter ? "ink level (%)" : "on-hand count"}</span><input aria-label={`New ${title} count`} type="number" min="0" max={verticalMeter ? 100 : undefined} step="any" required value={draft} onChange={(event) => { setDraft(event.target.value); setSaved(false); setSaveError(""); }} /></label><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button></form>{extraControl}<span className="save-feedback" role="status">{saveError || (saved ? "Saved for everyone." : "")}</span></details>}</div>
    </article>
  );
}

function StatusBadge({ status }: { status: PortalOrder["status"] }) {
  const labels = { pending: "Pending", shipped: "Shipped", delivered: "Delivered" };
  return <span className={`status ${status}`}><i />{labels[status]}</span>;
}

function displayOrderNumber(orderNumber: string) {
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(orderNumber) ? `#${orderNumber.slice(0, 8).toUpperCase()}` : orderNumber;
}

export default function Dashboard({ initialOrders, initialConnected, initialMessage, session }: Props) {
  const router = useRouter();
  const [supplies, setSupplies] = useState<Supply>(defaults);
  const [orders, setOrders] = useState(initialOrders);
  const [connected, setConnected] = useState(initialConnected);
  const [syncMessage, setSyncMessage] = useState(initialMessage);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncError, setSyncError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | PortalOrder["status"]>("all");
  const [view, setView] = useState<"admin" | "marsh">(session.role === "admin" ? "admin" : "marsh");
  const [incoming, setIncoming] = useState<Partial<Record<SupplyKey, number>>>({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [ordersInProduction, setOrdersInProduction] = useState(0);
  const [productionDraft, setProductionDraft] = useState("0");
  const [productionSaving, setProductionSaving] = useState(false);
  const [balanceOwed, setBalanceOwed] = useState(0);

  const loadInventory = async () => {
    const response = await fetch("/api/inventory", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load inventory.");
    setSupplies((current) => ({ ...current, ...data.inventory }));
  };

  useEffect(() => {
    loadInventory().catch(() => {});
    const refresh = () => loadInventory().catch(() => {});
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  useEffect(() => {
    const loadProductionCount = async () => {
      const response = await fetch("/api/dashboard-state", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const value = Number(data.ordersInProduction) || 0;
      setOrdersInProduction(value);
      setProductionDraft(String(value));
    };
    loadProductionCount();
    const timer = window.setInterval(loadProductionCount, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const saveProductionCount = async () => {
    setProductionSaving(true);
    try {
      const response = await fetch("/api/dashboard-state", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordersInProduction: Number(productionDraft) }) });
      const data = await response.json();
      if (response.ok) setOrdersInProduction(data.ordersInProduction);
    } finally { setProductionSaving(false); }
  };

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

  const setSupply = async (key: keyof Supply, value: number) => {
    if (view !== "admin") throw new Error("Admin access required.");
    const response = await fetch("/api/inventory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not save inventory.");
    setSupplies((current) => ({ ...current, [key]: data.value }));
  };
  const receiveSupply = async (key: SupplyKey, quantity: number) => {
    const nextValue = key === "ink" ? Math.min(100, supplies[key] + quantity) : supplies[key] + quantity;
    await setSupply(key, nextValue);
  };

  const sync = async () => {
    setSyncing(true);
    setSyncError("");
    try {
      const response = await fetch("/api/shipstation", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.connected || !Array.isArray(data.orders)) {
        throw new Error(data.error || data.message || "Could not refresh orders. Please try again.");
      }
      setOrders(data.orders); setConnected(true); setSyncMessage(data.message);
      setLastSync(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not refresh orders. Please try again.");
    } finally { setSyncing(false); }
  };

  const logout = async () => { try { await disconnectPushDevice(); } catch {} await fetch("/api/session/logout", { method: "POST" }); router.push("/login"); router.refresh(); };

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
  const matSales = [
    { label: "Whatupdoe", value: matTotals.whatupdoe, tone: "green" },
    { label: "Did You Call First?", value: matTotals.didYouCall, tone: "blue" },
    { label: "Upside Down Welcome", value: matTotals.upsideDown, tone: "amber" },
    { label: "Marsh Supply", value: matTotals.marshSupply, tone: "violet" },
  ];
  const largestMatTotal = Math.max(1, ...matSales.map((design) => design.value));
  const matSalesTotal = matSales.reduce((sum, design) => sum + design.value, 0);
  const capacityBlockers = [
    { label: "blank coir mats", available: availableMats },
    { label: "shipping boxes", available: availableBoxes },
    { label: "mat uses of packing tape", available: availableTapeMatCapacity },
    { label: "thank-you cards", available: availableThankYouCards },
    { label: "poly bags", available: availablePolyBags },
  ].filter((supply) => supply.available <= 0);
  const lowSupplyNames = [availableMats <= 0 ? "blank coir mats" : null, availableBoxes <= 0 ? "shipping boxes" : null, availableTapeMatCapacity <= 0 ? "packing tape" : null, availableThankYouCards <= 0 ? "thank-you cards" : null, availablePolyBags <= 0 ? "poly bags" : null, inkPercent <= 25 ? "black ink" : null].filter(Boolean) as string[];
  const newOrdersThisWeek = orders.filter((order) => Date.now() - new Date(order.orderDate).getTime() <= 7 * 86400000).length;
  const shippedWithDates = orders.filter((order) => order.shipDate && Number.isFinite(new Date(order.orderDate).getTime()) && Number.isFinite(new Date(order.shipDate).getTime()));
  const averageOrderToShip = shippedWithDates.length ? shippedWithDates.reduce((total, order) => total + Math.max(0, (new Date(order.shipDate!).getTime() - new Date(order.orderDate).getTime()) / 86400000), 0) / shippedWithDates.length : null;
  const pipelineOrders = counts.pending + ordersInProduction;

  return (
    <main className="dashboard">
      <header className="topbar">
        <button className="mobile-menu-button" type="button" aria-label={mobileMenuOpen ? "Close menu" : "Open menu"} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? <X size={23}/> : <Menu size={23}/>}</button>
        <div className="brand"><Image className="header-logo" src="/marsh-supply-logo-web.png" alt="Marsh Supply" width={116} height={72} priority unoptimized/><div><strong>PRODUCTION COMMAND</strong><span>Marsh Supply Portal</span></div></div>
        <div className="header-actions"><div className={`connection ${connected ? "live" : "demo"}`}><i />{connected ? "ShipStation connected" : "ShipStation setup needed"}</div>{session.role === "admin" && <button className="view-toggle" onClick={() => setView(view === "admin" ? "marsh" : "admin")}><ShieldCheck size={16}/>{view === "admin" ? "Admin view" : "Preview Marsh view"}</button>}<button className="view-toggle" onClick={logout}>{session.name} · Sign out</button></div>
        {mobileMenuOpen && <div className="mobile-menu">
          <div className={`mobile-menu-connection ${connected ? "live" : "demo"}`}><i />{connected ? "ShipStation connected" : "ShipStation setup needed"}</div>
          <nav aria-label="Mobile dashboard sections">
            <a href="#inventory" onClick={() => setMobileMenuOpen(false)}>Inventory</a>
            <a href="#pipeline" onClick={() => setMobileMenuOpen(false)}>Orders &amp; capacity</a>
            <a href="#mat-sales" onClick={() => setMobileMenuOpen(false)}>Mat sales</a>
            <a href="#operations" onClick={() => setMobileMenuOpen(false)}>Payments &amp; deliveries</a>
            <a href="#order-queue" onClick={() => setMobileMenuOpen(false)}>Fulfillment queue</a>
          </nav>
          <div className="mobile-menu-actions">
            {session.role === "admin" && <button type="button" onClick={() => { setView(view === "admin" ? "marsh" : "admin"); setMobileMenuOpen(false); }}><ShieldCheck size={17}/>{view === "admin" ? "Switch to Marsh view" : "Return to Admin view"}</button>}
            {session.role === "admin" && <button type="button" onClick={() => { setMobileMenuOpen(false); sync(); }} disabled={syncing}><RefreshCw size={17} className={syncing ? "spin" : ""}/>{syncing ? "Syncing…" : "Sync ShipStation"}</button>}
            <button type="button" onClick={logout}>{session.name} · Sign out</button>
          </div>
        </div>}
      </header>

      <div className="page-shell"><div className="notification-toolbar"><NotificationSettings/></div>
        <nav className="dashboard-nav" aria-label="Dashboard sections"><a href="#inventory">Inventory</a><a href="#pipeline">Orders & capacity</a><a href="#mat-sales">Mat sales</a><a href="#operations">Payments & deliveries</a><a href="#order-queue">Fulfillment queue</a></nav>
        <section className="overview-summary"><div className="overview-topline"><p className="kicker">MARSH SUPPLY FULFILLMENT OVERVIEW</p>{session.role === "admin" && <button className="sync-button page-sync-button" onClick={sync} disabled={syncing}><RefreshCw size={17} className={syncing ? "spin" : ""}/>{syncing ? "Syncing…" : "Sync ShipStation"}</button>}</div>{balanceOwed>0&&<a className="summary-copy balance-alert" href="#operations"><AlertTriangle size={19}/><span><strong>Payment due: ${balanceOwed.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong> remains outstanding on the payment ledger. View charges and recorded payments.</span></a>}<p className={`summary-copy${lowSupplyNames.length ? " attention" : ""}`}>{lowSupplyNames.length ? <><AlertTriangle size={19}/><span><strong>Purchasing recommended:</strong> Replenish {lowSupplyNames.join(", ")} to keep fulfillment moving. Current supplies support approximately <strong>{availableCapacity} additional orders</strong> after commitments.</span></> : <><PackageCheck size={19}/><span><strong>Inventory is ready.</strong> Current supplies support approximately {availableCapacity} additional orders after commitments.</span></>}</p><div className="summary-stats"><div><span>Pipeline</span><strong>{pipelineOrders} orders</strong></div><div><span>New in 7 days</span><strong>{newOrdersThisWeek}</strong></div><div><span>Avg. order to ship</span><strong>{averageOrderToShip === null ? "Not enough data" : `${averageOrderToShip.toFixed(1)} days`}</strong></div><div><span>Available capacity</span><strong>{availableCapacity} orders</strong></div></div></section>

        <div className="sync-feedback" role="status" aria-live="polite">{syncing ? "Checking ShipStation for updates…" : syncError ? <span className="sync-error">{syncError} Displayed orders have not been replaced.</span> : lastSync ? `Orders refreshed at ${lastSync}.` : connected ? "ShipStation orders loaded with this page." : "Demo data · live orders unavailable"}</div>
        {!connected && <div className="setup-banner"><AlertTriangle size={18}/><div><strong>Live ShipStation data is not connected yet.</strong><span>{syncMessage ?? "Add the API key to activate order syncing."} Showing representative data until setup is completed.</span></div></div>}

        <div className="dashboard-section-heading" id="inventory"><div><span className="section-icon"><Boxes size={18}/></span><h2>Inventory &amp; Supplies</h2></div><p>On hand · committed · available</p></div>
        <section className="supply-grid" id="supplies">
          <SupplyCard icon={<RectangleHorizontal size={23}/>} title="Blank coir mats" value={supplies.mats} unit="mats" detail="Newly shipped units deduct automatically" percent={supplies.mats > 25 ? 100 : supplies.mats * 4} committed={committedUnits} available={availableMats} incoming={incoming.mats} low={availableMats <= 0} admin={view === "admin"} onSet={(value) => setSupply("mats", value)} />
          <SupplyCard icon={<Box size={21}/>} title="Shipping boxes" value={supplies.boxes} unit="boxes" detail="One box reserved per pending unit" percent={supplies.boxes > 25 ? 100 : supplies.boxes * 4} committed={committedUnits} available={availableBoxes} incoming={incoming.boxes} low={availableBoxes <= 0} admin={view === "admin"} onSet={(value) => setSupply("boxes", value)} />
          <SupplyCard icon={<Package size={21}/>} title="Packing tape" value={supplies.tape} unit="rolls" detail={`${supplies.tapeUsage} of ${tapeCoverage} mat uses on current roll`} percent={supplies.tape > 10 ? 100 : supplies.tape * 10} committed={committedTapeRolls} available={availableTape} incoming={incoming.tape} low={availableTapeMatCapacity <= 0} admin={view === "admin"} onSet={(value) => setSupply("tape", value)} extraControl={<label className="manual-adjust"><span>Mats per roll</span><input type="number" min="1" value={tapeCoverage} onChange={(event) => setSupply("tapeCoverage", Math.max(1, Number(event.target.value)))} /></label>} />
          <SupplyCard icon={<Mail size={21}/>} title="Thank-you cards" value={supplies.thankYouCards} unit="cards" detail="One reserved per pending mat" percent={supplies.thankYouCards > 25 ? 100 : supplies.thankYouCards * 4} committed={committedUnits} available={availableThankYouCards} incoming={incoming.thankYouCards} low={availableThankYouCards <= 0} admin={view === "admin"} onSet={(value) => setSupply("thankYouCards", value)} />
          <SupplyCard icon={<ShoppingBag size={21}/>} title="Poly bags" value={supplies.polyBags} unit="bags" detail="One reserved per pending mat" percent={supplies.polyBags > 25 ? 100 : supplies.polyBags * 4} committed={committedUnits} available={availablePolyBags} incoming={incoming.polyBags} low={availablePolyBags <= 0} admin={view === "admin"} onSet={(value) => setSupply("polyBags", value)} />
          <SupplyCard icon={<Droplets size={21}/>} title="Ink supply" value={inkPercent} unit="%" detail={inkPercent <= 25 ? "Reorder recommended" : "Supply level healthy"} percent={inkPercent} incoming={incoming.ink} verticalMeter admin={view === "admin"} onSet={(value) => setSupply("ink", Math.min(100, value))} />
        </section>

        <div className="dashboard-section-heading pipeline-heading" id="pipeline"><div><span className="section-icon"><PackageOpen size={18}/></span><h2>Order Pipeline</h2></div><p>Current fulfillment movement at a glance</p></div>
        <section className="metrics-grid">
          <article className="metric"><div className="metric-heading"><span className="metric-icon amber"><PackageOpen size={23}/></span><p>Orders pending</p></div><div className="metric-value"><strong>{counts.pending}</strong><small>Ready for production</small></div></article>
          <article className="metric production-metric"><div className="metric-heading"><span className="metric-icon violet"><Factory size={23}/></span><p>In production</p></div><div className="metric-value"><strong>{ordersInProduction}</strong><small>Currently being produced</small>{session.role === "admin" && view === "admin" && <div className="production-adjust"><input aria-label="Orders currently in production" type="number" min="0" step="1" value={productionDraft} onChange={(event) => setProductionDraft(event.target.value)}/><button type="button" onClick={saveProductionCount} disabled={productionSaving}>{productionSaving ? "Saving…" : "Set"}</button></div>}</div></article>
          <article className="metric"><div className="metric-heading"><span className="metric-icon blue"><Truck size={23}/></span><p>Orders shipped</p></div><div className="metric-value"><strong>{counts.shipped}</strong><small>In carrier network</small></div></article>
          <article className="metric"><div className="metric-heading"><span className="metric-icon green"><PackageCheck size={23}/></span><p>Orders delivered</p></div><div className="metric-value"><strong>{counts.delivered}</strong><small>Successfully completed</small></div></article>
          <article className="metric"><div className="metric-heading"><span className="metric-icon violet"><TrendingUp size={23}/></span><p>Total units</p></div><div className="metric-value"><strong>{counts.units}</strong><small>Across visible orders</small></div></article>
        </section>

        <article className={`panel capacity-panel capacity-summary${capacityBlockers.length ? " blocked" : ""}`}><div className="panel-heading"><div><p className="eyebrow">AVAILABLE AFTER COMMITMENTS</p><h2>{availableCapacity} orders</h2></div><span className="icon-box"><Settings2 size={19}/></span></div><p>After reserving supplies for <strong>{committedUnits} pending units</strong>, you can accept up to <strong>{availableCapacity} additional single-mat orders</strong>.</p>{capacityBlockers.length > 0 ? <div className="capacity-blockers"><strong>Fulfillment is blocked by:</strong><ul>{capacityBlockers.map((supply) => <li key={supply.label}><AlertTriangle size={20}/><span><b>{supply.available}</b> {supply.label} available</span></li>)}</ul></div> : <div className="capacity-clear"><PackageCheck size={21}/><strong>All required supplies are available.</strong></div>}</article>

        <div className="dashboard-section-heading product-heading" id="mat-sales"><div><span className="section-icon"><TrendingUp size={18}/></span><h2>Mat Sales</h2></div><p>Design totals from loaded orders</p></div>
        <section className="panel mat-sales-chart" aria-label="Mat sales by design">
          <div className="chart-heading"><div><p className="eyebrow">DESIGN COMPARISON</p><h2>Units sold</h2></div><strong>{matSalesTotal}<small> total mats</small></strong></div>
          <div className="bar-chart">{matSales.map((design) => <div className="bar-row" key={design.label}><div className="bar-label"><span>{design.label}</span><strong>{design.value.toLocaleString()}</strong></div><div className="bar-track" aria-hidden="true"><span className={design.tone} style={{ width: `${(design.value / largestMatTotal) * 100}%` }} /></div></div>)}</div>
          {matSalesTotal === 0 && <p className="chart-empty">No matching mat sales in the loaded orders yet.</p>}
        </section>

        <section className="insights-row cadence-only">
          <article className="panel cadence-panel"><p className="eyebrow">FULFILLMENT CADENCE</p><h2>Monday · Wednesday · Friday</h2><p>Orders are prepared and processed through ShipStation three days each week.</p><div className="cadence-days"><span className="active">M</span><span>T</span><span className="active">W</span><span>T</span><span className="active">F</span><span>S</span><span>S</span></div><div className="next-run"><Truck size={17}/><span>Next processing run</span><strong>Monday</strong></div></article>
        </section>

        <div id="operations"><FinancialLogistics session={{...session, canCreateCharges: session.canCreateCharges && view === "admin"}} onIncomingChange={setIncoming} onInventoryReceived={receiveSupply} onBalanceChange={setBalanceOwed}/></div>

        <section className="panel orders-panel" id="order-queue"><div className="orders-head"><div><p className="eyebrow">ORDER ACTIVITY</p><h2>Fulfillment queue</h2></div><div className="table-actions"><label className="search"><Search size={16}/><input aria-label="Search fulfillment orders" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search orders" /></label><select aria-label="Filter by order status" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option></select></div></div>
          <div className="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Product</th><th>Qty</th><th>Status</th><th>Tracking</th><th>Date</th></tr></thead><tbody>{filtered.map((order) => <tr key={order.id}><td data-label="Order"><strong title={order.orderNumber}>{displayOrderNumber(order.orderNumber)}</strong></td><td data-label="Customer">{order.customer}</td><td data-label="Product" className="product-cell">{order.item}</td><td data-label="Quantity">{order.quantity}</td><td data-label="Status"><StatusBadge status={order.status}/></td><td data-label="Tracking">{order.trackingNumber ? <span className="tracking">{order.carrier}<ExternalLink size={13}/></span> : <span className="muted">Not assigned</span>}</td><td data-label="Date">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(order.shipDate ?? order.orderDate))}</td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty">No orders match this search.</div>}</div>
          <footer className="panel-footer"><span>Showing {filtered.length} of {orders.length} orders</span><span>{lastSync ? `Last successful refresh: ${lastSync}` : "Loaded with page"}</span></footer>
        </section>
        <PortalAccess/>
        {session.role === "admin" && view === "admin" && <AccessManager/>}
        <Messenger session={session}/>
      </div>
    </main>
  );
}
