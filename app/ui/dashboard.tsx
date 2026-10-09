"use client";
import type { RecentIssueEvent } from "@/lib/fulfillment-overview";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Box,
  ChevronDown,
  Droplets,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Truck,
  TrendingUp,
  AlertTriangle,
  ExternalLink,
  Package,
  Mail,
  ShoppingBag,
  RectangleHorizontal,
  Menu,
  X,
  Factory,
  Flag,
  CircleCheck,
  CalendarDays,
  CreditCard,
} from "lucide-react";
import { awaitingMatTotal } from "@/lib/fulfillment-overview";
import type { PortalOrder } from "@/lib/shipstation";
import { designKey, getMatAvailability } from "@/lib/mat-availability";
import type { PortalSession } from "@/lib/auth";
import AccessManager from "./access-manager";
import PortalAccess from "./portal-access";
import NotificationSettings, {
  disconnectPushDevice,
} from "./notification-settings";
import DefectiveMats from "./defective-mats";
import { workspaceSections, workspaceSectionForHash, type WorkspaceSection } from "@/lib/workspace-navigation";
import FinancialLogistics from "./financial-logistics";
import Messenger from "./messenger";
import OrderIssueHistory from "./order-issue-history";
import ProductionPlan from "./production-plan";
import OperationalCharts from "./operational-charts";
import ShipmentTrackingDetails from "./shipment-tracking";

type Supply = {
  mats: number;
  boxes: number;
  ink: number;
  tape: number;
  tapeCoverage: number;
  tapeUsage: number;
  thankYouCards: number;
  polyBags: number;
};
type SupplyKey =
  "mats" | "boxes" | "ink" | "tape" | "thankYouCards" | "polyBags";
type Props = {
  initialOrders: PortalOrder[];
  initialConnected: boolean;
  initialMessage?: string;
  session: PortalSession;
};
type OrderIssue = {
  order_id: string;
  order_number: string;
  reason: string;
  note: string | null;
  created_by_name: string;
  created_at: string;
};
type FinishedMat = {
  design_key: string;
  design_name: string;
  quantity: number;
  updated_at: string;
};

const defaults: Supply = {
  mats: 0,
  boxes: 0,
  ink: 0,
  tape: 0,
  tapeCoverage: 25,
  tapeUsage: 0,
  thankYouCards: 0,
  polyBags: 0,
};

function Meter({
  value,
  warningAt = 25,
}: {
  value: number;
  warningAt?: number;
}) {
  const tone =
    value <= warningAt ? "danger" : value <= 50 ? "warning" : "healthy";
  return (
    <div className="meter" aria-label={`${value} percent`}>
      <span
        className={tone}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function SupplyCard({
  icon,
  title,
  value,
  unit,
  detail,
  percent,
  committed = 0,
  available,
  incoming = 0,
  admin,
  onSet,
  extraControl,
  purchaseUrl,
  verticalMeter = false,
  low,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  unit: string;
  detail: string;
  percent: number;
  committed?: number;
  available?: number;
  incoming?: number;
  admin: boolean;
  onSet: (value: number) => Promise<void>;
  extraControl?: React.ReactNode;
  purchaseUrl?: string;
  verticalMeter?: boolean;
  low?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const lowSupply = low ?? percent <= 25;
  return (
    <article
      className={`supply-card${lowSupply ? " low-supply" : ""}${verticalMeter ? " ink-card" : ""}`}
    >
      {lowSupply && (
        <span
          className="card-warning"
          title="Purchase recommended"
          aria-label="Purchase recommended"
        >
          <AlertTriangle size={17} />
        </span>
      )}
      <div className="card-top">
        <div className="card-title-line">
          <span className="icon-box">{icon}</span>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="supply-value">
        {value.toLocaleString()} <small>{unit} on hand</small>
      </div>
      {verticalMeter ? (
        <div className="ink-level-wrap">
          <div className="ink-level" aria-label={`${percent} percent ink`} style={{ "--ink-fill": `${percent}%` } as React.CSSProperties}>
            <span style={{ height: `${percent}%` }} />
          </div>
          <strong>{percent}%</strong>
        </div>
      ) : (
        <Meter value={percent} />
      )}
      {incoming > 0 && (
        <div className="incoming-supply">
          <span>Incoming</span>
          <strong>+{incoming.toLocaleString()}</strong>
        </div>
      )}
      {available !== undefined && (
        <div className="allocation">
          <div>
            <span>Committed</span>
            <strong>{committed}</strong>
          </div>
          <div>
            <span>Available</span>
            <strong>{available}</strong>
          </div>
        </div>
      )}
      <div className="supply-footer">
        <span>{detail}</span>
        {purchaseUrl && (
          <a className="supply-buy-now" href={purchaseUrl} target="_blank" rel="noopener noreferrer" aria-label={`Buy ${title.toLowerCase()} now on Amazon (opens in a new tab)`}>
            <ShoppingBag size={17} aria-hidden="true" />
            BUY NOW
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}
        {admin && (
          <details className="stock-editor">
            <summary>Adjust stock</summary>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (
                  draft.trim() &&
                  Number.isFinite(Number(draft)) &&
                  Number(draft) >= 0
                ) {
                  setSaving(true);
                  setSaveError("");
                  try {
                    await onSet(Number(draft));
                    setSaved(true);
                  } catch (error) {
                    setSaveError(
                      error instanceof Error
                        ? error.message
                        : "Could not save inventory.",
                    );
                  } finally {
                    setSaving(false);
                  }
                }
              }}
            >
              <label className="manual-adjust">
                <span>
                  New {verticalMeter ? "ink level (%)" : "on-hand count"}
                </span>
                <input
                  aria-label={`New ${title} count`}
                  type="number"
                  min="0"
                  max={verticalMeter ? 100 : undefined}
                  step="any"
                  required
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setSaved(false);
                    setSaveError("");
                  }}
                />
              </label>
              <button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </form>
            {extraControl}
            <span className="save-feedback" role="status">
              {saveError || (saved ? "Saved for everyone." : "")}
            </span>
          </details>
        )}
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: PortalOrder["status"] }) {
  const labels = {
    pending: "Pending",
    shipped: "Shipped",
    delivered: "Delivered",
  };
  return (
    <span className={`status ${status}`}>
      <i />
      {labels[status]}
    </span>
  );
}

function displayOrderNumber(orderNumber: string) {
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(orderNumber)
    ? `#${orderNumber.slice(0, 8).toUpperCase()}`
    : orderNumber;
}

export default function Dashboard({
  initialOrders,
  initialConnected,
  initialMessage,
  session,
}: Props) {
  const router = useRouter();
  const [activeSection,setActiveSection]=useState<WorkspaceSection>("overview");
  const [stockError,setStockError]=useState("");
  const syncBusy=useRef(false);
  useEffect(()=>{const select=()=>{setActiveSection(workspaceSectionForHash(window.location.hash));setMobileMenuOpen(false)};select();window.addEventListener("hashchange",select);return()=>window.removeEventListener("hashchange",select)},[]);
  useEffect(()=>{const target=document.getElementById(window.location.hash.slice(1));if(target&&!workspaceSections.some(s=>s.href===window.location.hash)&&!target.closest("[hidden]"))target.scrollIntoView({block:"start"});else window.scrollTo({top:0});},[activeSection]);
  const [supplies, setSupplies] = useState<Supply>(defaults);
  const [orders, setOrders] = useState(initialOrders);
  const [connected, setConnected] = useState(initialConnected);
  const [syncMessage, setSyncMessage] = useState(initialMessage);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncError, setSyncError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "ready" | "held" | "to-print" | PortalOrder["status"]>("all");
  const [view, setView] = useState<"admin" | "marsh">(
    session.role === "admin" ? "admin" : "marsh",
  );
  const [incoming, setIncoming] = useState<Partial<Record<SupplyKey, number>>>(
    {},
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [ordersInProduction, setOrdersInProduction] = useState(0);
  const [productionDraft, setProductionDraft] = useState("0");
  const [productionSaving, setProductionSaving] = useState(false);
  const [balanceOwed, setBalanceOwed] = useState(0);
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [recentIssueEvents, setRecentIssueEvents] = useState<RecentIssueEvent[] | null>(null);
  const [orderIssues, setOrderIssues] = useState<OrderIssue[]>([]);
  const [issueReason, setIssueReason] = useState("Incomplete address");
  const [issueNote, setIssueNote] = useState("");
  const [issueSaving, setIssueSaving] = useState(false);
  const [issueHistoryVersion, setIssueHistoryVersion] = useState(0);
  const [issueError, setIssueError] = useState("");
  const [finishedMats, setFinishedMats] = useState<FinishedMat[]>([]);
  const [inventoryLoaded, setInventoryLoaded] = useState(false);
  const [finishedMatsLoaded, setFinishedMatsLoaded] = useState(false);
  const [printBatch, setPrintBatch] = useState({
    designKey: "whatupdoe",
    quantity: "",
  });
  const [printSaving, setPrintSaving] = useState(false);
  const [printMessage, setPrintMessage] = useState("");

  const loadInventory = async () => {
    const response = await fetch("/api/inventory", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Could not load inventory.");
    setSupplies((current) => ({ ...current, ...data.inventory }));
    setInventoryLoaded(Number.isFinite(data.inventory?.mats));
    setStockError("");
  };

  useEffect(() => {
    loadInventory().catch(error => setStockError(error.message));
    const refresh = () => loadInventory().catch(error => setStockError(error.message));
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("marsh-inventory-changed", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("marsh-inventory-changed", refresh);
    };
  }, []);

  const loadOperationalData = async () => {
    const [issuesResponse, matsResponse] = await Promise.all([
      fetch("/api/order-issues", { cache: "no-store" }),
      fetch("/api/finished-mats", { cache: "no-store" }),
    ]);
    if (issuesResponse.ok) {
      const data = await issuesResponse.json();
      setOrderIssues(data.issues ?? []);
      setRecentIssueEvents(data.recentIssueEvents ?? null);
    }
    if (matsResponse.ok) {
      setFinishedMats((await matsResponse.json()).designs ?? []);
      setFinishedMatsLoaded(true);
    }
  };

  useEffect(() => {
    loadOperationalData().catch(() => {});
    const timer = window.setInterval(
      () => loadOperationalData().catch(() => {}),
      15000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadProductionCount = async () => {
      const response = await fetch("/api/dashboard-state", {
        cache: "no-store",
      });
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
      const nextProductionCount = Math.min(
        counts.pending,
        Math.max(0, Math.trunc(Number(productionDraft) || 0)),
      );
      const response = await fetch("/api/dashboard-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordersInProduction: nextProductionCount }),
      });
      const data = await response.json();
      if (response.ok) {
        setOrdersInProduction(data.ordersInProduction);
        setProductionDraft(String(data.ordersInProduction));
      }
    } finally {
      setProductionSaving(false);
    }
  };

  const setSupply = async (key: keyof Supply, value: number) => {
    if (view !== "admin") throw new Error("Admin access required.");
    const response = await fetch("/api/inventory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Could not save inventory.");
    setSupplies((current) => ({ ...current, [key]: data.value }));
  };
  const receiveSupply = async () => { await loadInventory(); };

  const flagOrder = async (order: PortalOrder) => {
    setIssueError("");
    setIssueSaving(true);
    try {
      const response = await fetch("/api/order-issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          orderNumber: order.orderNumber,
          reason: issueReason,
          note: issueNote,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not flag order.");
      setIssueNote("");
      setIssueHistoryVersion(value => value + 1);
      await loadOperationalData();
    } catch (error) {
      setIssueError(error instanceof Error ? error.message : "Could not flag order.");
    } finally {
      setIssueSaving(false);
    }
  };
  const resolveIssue = async (orderId: string) => {
    setIssueError("");
    setIssueSaving(true);
    try {
      const response = await fetch(`/api/order-issues?orderId=${encodeURIComponent(orderId)}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not resolve issue.");
      setIssueHistoryVersion(value => value + 1);
      await loadOperationalData();
    } catch (error) {
      setIssueError(error instanceof Error ? error.message : "Could not resolve issue.");
    } finally {
      setIssueSaving(false);
    }
  };
  const recordPrintBatch = async () => {
    setPrintSaving(true);
    setPrintMessage("");
    try {
      const response = await fetch("/api/finished-mats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(printBatch),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not record print run.");
      setPrintBatch((current) => ({ ...current, quantity: "" }));
      setPrintMessage(Number(printBatch.quantity) < 0
        ? "Printed stock reduced. Blank mat inventory unchanged."
        : "Printed mats added and blank inventory reduced.");
      await Promise.all([loadInventory(), loadOperationalData()]);
    } catch (error) {
      setPrintMessage(
        error instanceof Error ? error.message : "Could not record print run.",
      );
    } finally {
      setPrintSaving(false);
    }
  };

  const sync = async () => {
    if(syncBusy.current)return;syncBusy.current=true;
    setSyncing(true);
    setSyncError("");
    try {
      const response = await fetch("/api/shipstation", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.connected || !Array.isArray(data.orders)) {
        throw new Error(
          data.error ||
            data.message ||
            "Could not refresh orders. Please try again.",
        );
      }
      setOrders(data.orders);
      setConnected(true);
      await Promise.all([loadInventory(),loadOperationalData()]);
      if(data.inventorySync?.ok===false)setStockError("Orders refreshed, but inventory reconciliation failed. Retry refresh before relying on availability.");
      setSyncMessage(data.message);
      setLastSync(
        new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
      );
    } catch (error) {
      setSyncError(
        error instanceof Error
          ? error.message
          : "Could not refresh orders. Please try again.",
      );
    } finally {
      syncBusy.current=false;
      setSyncing(false);
    }
  };

  useEffect(() => {
    const refreshOrders = () => {
      if (document.visibilityState === "visible") sync();
    };
    const timer = window.setInterval(refreshOrders, 5 * 60 * 1000);
    window.addEventListener("focus", refreshOrders);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshOrders);
    };
  }, []);

  const logout = async () => {
    try {
      await disconnectPushDevice();
    } catch {}
    await fetch("/api/session/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const counts = useMemo(
    () => ({
      pending: orders.filter((order) => order.status === "pending").length,
      shipped: orders.filter((order) => order.status === "shipped").length,
      delivered: orders.filter((order) => order.status === "delivered").length,
      units: orders.reduce((sum, order) => sum + order.quantity, 0),
    }),
    [orders],
  );

  // Issue records are stored separately from ShipStation orders. If a test or
  // cancelled order is deleted upstream, do not keep counting its orphaned
  // issue while the API refresh catches up.
  const currentOrderIssues = useMemo(() => {
    const pending = orders.filter((order) => order.status === "pending");
    const orderIds = new Set(pending.map((order) => order.id));
    const orderNumbers = new Set(pending.map((order) => order.orderNumber));
    return orderIssues.filter(
      (issue) =>
        orderIds.has(issue.order_id) || orderNumbers.has(issue.order_number),
    );
  }, [orderIssues, orders]);

  const matTotals = useMemo(() => {
    const totals = {
      whatupdoe: 0,
      didYouCall: 0,
      upsideDown: 0,
      marshSupply: 0,
    };
    for (const order of orders) {
      const lines = order.items?.length
        ? order.items
        : [{ name: order.item, quantity: order.quantity }];
      for (const line of lines) {
        const name = line.name.toLowerCase();
        if (name.includes("did you call")) totals.didYouCall += line.quantity;
        else if (name.includes("upside down") || name.includes("upside-down"))
          totals.upsideDown += line.quantity;
        else if (name.includes("whatupdoe") || name.includes("what up doe"))
          totals.whatupdoe += line.quantity;
        else if (name.includes("marsh supply") || name.includes("marsh"))
          totals.marshSupply += line.quantity;
      }
    }
    return totals;
  }, [orders]);

  const committedUnits = orders
    .filter((order) => order.status === "pending")
    .reduce((sum, order) => sum + order.quantity, 0);
  const matAvailability = getMatAvailability(orders, supplies.mats, finishedMats);
  const matStockChecked = connected && inventoryLoaded && finishedMatsLoaded;
  const blockedMatOrders = matStockChecked ? matAvailability.blockedOrderIds : new Set<string>();
  const availableMats = matAvailability.availableBlanks;
  const pendingOrders = orders.filter(order=>order.status==="pending");
  const committedBoxes = pendingOrders.reduce((sum,order)=>sum+Math.ceil(order.quantity/2),0);
  const availableStockMats = matAvailability.availablePrinted + availableMats;
  const availableBoxes = Math.max(0, supplies.boxes - committedBoxes);
  const tapeCoverage = Math.max(1, supplies.tapeCoverage);
  const committedTapeRolls = Math.ceil(
    (supplies.tapeUsage + committedUnits) / tapeCoverage,
  );
  const availableTape = Math.max(0, supplies.tape - committedTapeRolls);
  const availableTapeMatCapacity = Math.max(
    0,
    supplies.tape * tapeCoverage - supplies.tapeUsage - committedUnits,
  );
  const availableThankYouCards = Math.max(
    0,
    supplies.thankYouCards - pendingOrders.length,
  );
  const availablePolyBags = Math.max(0, supplies.polyBags - committedUnits);
  const availableCapacity = Math.min(
    availableStockMats,
    availableBoxes,
    availableTapeMatCapacity,
    availableThankYouCards,
    availablePolyBags,
  );
  const inkPercent = Math.max(0, Math.min(100, supplies.ink));
  const missingFulfillmentSupplies = [
    supplies.boxes <= 0 ? "boxes" : null,
    supplies.tape <= 0 || supplies.tape * tapeCoverage - supplies.tapeUsage <= 0 ? "packing tape" : null,
    supplies.thankYouCards <= 0 ? "thank-you cards" : null,
    supplies.polyBags <= 0 ? "poly bags" : null,

  ].filter((name): name is string => name !== null);
  const matSales = [
    { label: "Whatupdoe", value: matTotals.whatupdoe, tone: "green" },
    { label: "Did You Call First?", value: matTotals.didYouCall, tone: "blue" },
    {
      label: "Upside Down Welcome",
      value: matTotals.upsideDown,
      tone: "amber",
    },
    { label: "Marsh Supply", value: matTotals.marshSupply, tone: "violet" },
  ];
  const largestMatTotal = Math.max(
    1,
    ...matSales.map((design) => design.value),
  );
  const matSalesTotal = matSales.reduce((sum, design) => sum + design.value, 0);
  const pendingByDesign = orders
    .filter((order) => order.status === "pending")
    .reduce<Record<string, number>>((totals, order) => {
      for (const item of order.items?.length
        ? order.items
        : [{ name: order.item, quantity: order.quantity }]) {
        const key = designKey(item.name);
        if (key) totals[key] = (totals[key] || 0) + item.quantity;
      }
      return totals;
    }, {});
  const finishedMatCards = finishedMats.map((item) => ({
    ...item,
    committed: item.quantity - (matAvailability.availablePrintedByDesign[item.design_key] ?? item.quantity),
    available: Math.max(
      0,
      matAvailability.availablePrintedByDesign[item.design_key] ?? item.quantity,
    ),
  }));
  const capacityBlockers = [
    { label: "printed or blank mats", available: availableStockMats },
    { label: "shipping boxes", available: availableBoxes },
    { label: "mat uses of packing tape", available: availableTapeMatCapacity },
    { label: "thank-you cards", available: availableThankYouCards },
    { label: "poly bags", available: availablePolyBags },
  ].filter((supply) => supply.available <= 0);
  const lowSupplyNames = [
    availableMats <= 0 ? "blank coir mats" : null,
    availableBoxes <= 0 ? "shipping boxes" : null,
    availableTapeMatCapacity <= 0 ? "packing tape" : null,
    availableThankYouCards <= 0 ? "thank-you cards" : null,
    availablePolyBags <= 0 ? "poly bags" : null,
    inkPercent <= 25 ? "black ink" : null,
  ].filter(Boolean) as string[];
  const newOrdersThisWeek = orders.filter(
    (order) => Date.now() - new Date(order.orderDate).getTime() <= 7 * 86400000,
  ).length;
  const shippedWithDates = orders.filter(
    (order) =>
      order.shipDate &&
      Number.isFinite(new Date(order.orderDate).getTime()) &&
      Number.isFinite(new Date(order.shipDate).getTime()),
  );
  const averageOrderToShip = shippedWithDates.length
    ? shippedWithDates.reduce(
        (total, order) =>
          total +
          Math.max(
            0,
            (new Date(order.shipDate!).getTime() -
              new Date(order.orderDate).getTime()) /
              86400000,
          ),
        0,
      ) / shippedWithDates.length
    : null;
  const ordersAwaitingProduction = Math.max(
    0,
    counts.pending - matAvailability.readyOrderIds.size - ordersInProduction,
  );
  const pipelineOrders = counts.pending;
  const awaitingMats = awaitingMatTotal(orders.filter(order=>!matAvailability.readyOrderIds.has(order.id)).map(order=>order.status==="pending"?{...order,quantity:matAvailability.allocations.get(order.id)?.toPrint??order.quantity}:order), ordersInProduction);
  const heldOrderIds = new Set(orders.filter(order => order.status === "pending" && (
    currentOrderIssues.some(issue => issue.order_id === order.id || issue.order_number === order.orderNumber) ||
    blockedMatOrders.has(order.id) || (inventoryLoaded && (missingFulfillmentSupplies.length > 0 || (inkPercent<=0 && (matAvailability.allocations.get(order.id)?.toPrint??0)>0)))
  )).map(order => order.id));

  const issueRank = new Map(
    currentOrderIssues.map((issue, index) => [issue.order_id, index]),
  );
  const filtered = orders
    .filter(
      (order) =>
        ((filter === "all" && order.status !== "delivered") || order.status === filter || (filter === "ready" && matAvailability.readyOrderIds.has(order.id) && !heldOrderIds.has(order.id)) || (filter === "held" && heldOrderIds.has(order.id)) || (filter === "to-print" && (matAvailability.allocations.get(order.id)?.toPrint ?? 0)>0)) &&
        `${order.orderNumber} ${order.customer} ${order.item} ${order.items?.map((item) => item.name).join(" ") ?? ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => {
      const aRank = issueRank.get(a.id);
      const bRank = issueRank.get(b.id);
      if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
      if (aRank !== undefined) return -1;
      if (bRank !== undefined) return 1;
      return 0;
    });

  const detroitDay = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  const todayInDetroit = detroitDay(new Date().toISOString());
  const deliveredToday = orders.filter(order => order.status === "delivered" && order.tracking?.deliveredAt && Number.isFinite(Date.parse(order.tracking.deliveredAt)) && detroitDay(order.tracking.deliveredAt) === todayInDetroit).length;

  return (
    <main className="dashboard">
      <header className="topbar">
        <button
          className="mobile-menu-button"
          type="button"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X size={23} /> : <Menu size={23} />}
        </button>
        <div className="brand">
          <Image
            className="header-logo"
            src="/marsh-supply-logo-web.png"
            alt="Marsh Supply"
            width={116}
            height={72}
            priority
            unoptimized
          />
          <div>
            <strong>PRODUCTION COMMAND</strong>
            <span>Marsh Supply Portal</span>
          </div>
        </div>
        <div className="header-actions">
          <div className={`connection ${connected ? "live" : "demo"}`}>
            <i />
            {connected ? "ShipStation connected" : "ShipStation setup needed"}
          </div>
          {session.role === "admin" && (
            <button
              className="view-toggle"
              onClick={() => setView(view === "admin" ? "marsh" : "admin")}
            >
              <ShieldCheck size={16} />
              {view === "admin" ? "Admin view" : "Preview Marsh view"}
            </button>
          )}
          {session.role === "admin" && (
            <a
              className="view-toggle"
              href="#portal-users"
              onClick={() => setView("admin")}
            >
              Manage users
            </a>
          )}
          <button className="view-toggle" onClick={logout}>
            {session.name} · Sign out
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="mobile-menu">
            <div
              className={`mobile-menu-connection ${connected ? "live" : "demo"}`}
            >
              <i />
              {connected ? "ShipStation connected" : "ShipStation setup needed"}
            </div>
            <nav aria-label="Mobile dashboard sections">
              {workspaceSections.map(section=><a key={section.id} href={section.href} aria-current={activeSection===section.id?"page":undefined} onClick={()=>setMobileMenuOpen(false)}>{section.label}</a>)}
              <NotificationSettings isAdmin={session.role === "admin"} />
            </nav>
            <div className="mobile-menu-actions">
              {session.role === "admin" && (
                <button
                  type="button"
                  onClick={() => {
                    setView(view === "admin" ? "marsh" : "admin");
                    setMobileMenuOpen(false);
                  }}
                >
                  <ShieldCheck size={17} />
                  {view === "admin"
                    ? "Switch to Marsh view"
                    : "Return to Admin view"}
                </button>
              )}
              {session.role === "admin" && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    sync();
                  }}
                  disabled={syncing}
                >
                  <RefreshCw size={17} className={syncing ? "spin" : ""} />
                  {syncing ? "Syncing…" : "Sync ShipStation"}
                </button>
              )}
              <button type="button" onClick={logout}>
                {session.name} · Sign out
              </button>
            </div>
          </div>
        )}
      </header>

      <div className="page-shell">
        <nav className="dashboard-nav" aria-label="Dashboard sections">
          <div className="dashboard-nav-heading">WORKSPACE <span>Marsh Supply</span></div>
          {workspaceSections.map(section=><a key={section.id} href={section.href} aria-current={activeSection===section.id?"page":undefined}><span className="nav-marker" aria-hidden="true">{section.number}</span>{section.label}</a>)}
          <div className="nav-utilities"><NotificationSettings isAdmin={session.role === "admin"}/><a href="/marsh-service-agreement.pdf" target="_blank" rel="noreferrer"><ShieldCheck size={16}/> Service agreement</a></div>
        </nav>
        <div className="workspace-header"><div><p className="eyebrow">MARSH SUPPLY · FULFILLMENT</p><h1>{workspaceSections.find(section=>section.id===activeSection)?.label}</h1><p>{workspaceSections.find(section=>section.id===activeSection)?.description}</p></div><button className="sync-button" onClick={sync} disabled={syncing}><RefreshCw size={17} className={syncing?"spin":""}/>{syncing?"Refreshing…":"Refresh data"}</button></div>
        <label className="workspace-mobile-select">Go to section<select value={activeSection} onChange={e=>{window.location.hash=workspaceSections.find(section=>section.id===e.target.value)!.href.slice(1)}}>{workspaceSections.map(section=><option key={section.id} value={section.id}>{section.label}</option>)}</select></label>
        <div className="sync-feedback" role="status" aria-live="polite">
          {syncing ? (
            "Checking ShipStation for updates…"
          ) : syncError ? (
            <span className="sync-error">
              {syncError} Displayed orders have not been replaced.
            </span>
          ) : lastSync ? (
            `Orders refreshed at ${lastSync}.`
          ) : connected ? (
            "ShipStation orders loaded with this page."
          ) : (
            "Live order data is unavailable"
          )}
        </div>
        {!connected && (
          <div className="setup-banner">
            <AlertTriangle size={18} />
            <div>
              <strong>Order data is unavailable.</strong>
              <span>
                {syncMessage ?? "Add the API key to activate order syncing."}{" "}
                Refresh to try again. No sample orders are included in your totals.
              </span>
            </div>
          </div>
        )}

        {stockError&&<p className="sync-error" role="alert">{stockError} <button onClick={()=>{void sync()}}>Retry</button></p>}
        <div className="workspace-pane" data-workspace="overview" hidden={activeSection!=="overview"}>
        <section className="overview-summary" id="overview">
          <div className="overview-topline">
            <p className="kicker">AT A GLANCE</p>

          </div>
          <div className="overview-alerts" aria-label="Fulfillment alerts">
            {heldOrderIds.size > 0 && <a className="summary-copy order-issue-alert" href="#order-queue">
              <Flag size={19}/><span><strong>{heldOrderIds.size} orders unable to ship</strong>
              <small>{currentOrderIssues.length} flagged issues · Review holds</small></span>
            </a>}
            {blockedMatOrders.size > 0 && <a className="summary-copy mat-shortage-alert" href="#inventory">
              <AlertTriangle size={19}/><span><strong>{matAvailability.missingMats} additional mats needed</strong>
              <small>{blockedMatOrders.size} orders blocked · 40 mat run minimum</small></span>
            </a>}
            {balanceOwed > 0 && <a className="summary-copy balance-alert" href="#operations">
              <AlertTriangle size={19}/><span><strong>Payment due: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(balanceOwed)}</strong>
              <small>View charges and payments</small></span>
            </a>}
            <a className={`summary-copy${lowSupplyNames.length ? " attention" : ""}`} href="#supplies">
              {lowSupplyNames.length ? <AlertTriangle size={19}/> : <PackageCheck size={19}/>}
              <span><strong>{!matStockChecked ? "Checking supplies…" : lowSupplyNames.length ? "Replenish " + lowSupplyNames.join(", ") : "Inventory is ready"}</strong>
              <small>{matStockChecked ? availableCapacity + " additional orders supported" : "Refreshing available stock"}</small></span>
            </a>
            <a className="summary-copy shipping-update" href="#order-queue">
              <Truck size={19}/><span><strong>{orders.filter(order => order.status !== "pending" && Date.parse(order.shipDate ?? "") >= Date.now() - 86400000).length} orders shipped in 24 hours</strong>
              <small>{orders.filter(order => order.status === "shipped").length} in transit · {orders.filter(order => order.status === "delivered").length} delivered</small></span>
            </a>
          </div>
          <div className="summary-stats">
            <div>
              <span>Pending orders</span>
              <strong>{pipelineOrders} orders</strong>
            </div>
            <div>
              <span>Shipping issues</span>
              <strong>{currentOrderIssues.length}</strong>
            </div>
            <div>
              <span>Unable to fulfill · mats</span>
              <strong>{matStockChecked ? `${blockedMatOrders.size} orders` : "Checking stock…"}</strong>
            </div>
            <div>
              <span>New in 7 days</span>
              <strong>{newOrdersThisWeek}</strong>
            </div>
            <div>
              <span>Available capacity</span>
              <strong>{availableCapacity} orders</strong>
            </div>
          </div>
        </section>

        <div className="overview-shortcuts"><a href="#order-queue"><PackageCheck size={22}/><strong>Work the order queue</strong><span>{pipelineOrders} pending · {matAvailability.readyOrderIds.size} covered by printed stock</span></a><a href="#production-runs"><Factory size={22}/><strong>Manage production runs</strong><span>Schedule, track, and reconcile each batch</span></a><a href="#operations"><CreditCard size={22}/><strong>Review the account</strong><span>Payments, credits, and incoming deliveries</span></a></div>
        <section className="insights-row cadence-only">
          <article className="panel cadence-panel">
            <p className="eyebrow">FULFILLMENT CADENCE</p>
            <h2>Monday · Wednesday · Friday</h2>
            <p>
              Orders are prepared and processed through ShipStation three days
              each week.
            </p>
            <div className="cadence-days">
              <span className="active">M</span>
              <span>T</span>
              <span className="active">W</span>
              <span>T</span>
              <span className="active">F</span>
              <span>S</span>
              <span>S</span>
            </div>
            <div className="next-run">
              <Truck size={17} />
              <span>Next processing run</span>
              <strong>{(() => { const today = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(new Intl.DateTimeFormat("en-US",{weekday:"short",timeZone:"America/Detroit"}).format(new Date())); const offset = [1,3,5].map(day => (day-today+7)%7).sort((a,b)=>a-b)[0]; return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][(today+offset)%7]; })()}</strong>
            </div>
          </article>
        </section>

        </div>
        <div className="workspace-pane" data-workspace="orders" hidden={activeSection!=="orders"}>
        <div
          className="dashboard-section-heading pipeline-heading"
          id="pipeline"
        >
          <div>
            <span className="section-icon">
              <PackageOpen size={18} />
            </span>
            <h2>Order Pipeline</h2>
          </div>
          <p>Current fulfillment movement at a glance</p>
        </div>
        <section className="metrics-grid">
          <article className="metric">
            <div className="metric-heading">
              <span className="metric-icon amber">
                <PackageOpen size={23} />
              </span>
              <p>Orders awaiting production</p>
            </div>
            <div className="metric-value">
              <strong>{ordersAwaitingProduction}</strong>
              <small title={awaitingMats.min !== awaitingMats.max ? "Production is tracked as an order count, not specific orders. The range reflects the possible mat quantity across the orders awaiting production." : undefined}>{awaitingMats.label}</small>
            </div>
          </article>
          <article className="metric production-metric">
            <div className="metric-heading">
              <span className="metric-icon violet">
                <Factory size={23} />
              </span>
              <p>Orders in production</p>
            </div>
            <div className="metric-value">
              <strong>{Math.min(ordersInProduction,Math.max(0,counts.pending-matAvailability.readyOrderIds.size))}</strong>
              <small>Currently being produced</small>
              {session.role === "admin" && view === "admin" && (
                <div className="production-adjust">
                  <input
                    aria-label="Orders currently in production"
                    type="number"
                    min="0"
                    max={counts.pending}
                    step="1"
                    value={productionDraft}
                    onChange={(event) => setProductionDraft(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={saveProductionCount}
                    disabled={productionSaving}
                  >
                    {productionSaving ? "Saving…" : "Set"}
                  </button>
                </div>
              )}
            </div>
          </article>
          <article className="metric">
            <div className="metric-heading">
              <span className="metric-icon blue">
                <Truck size={23} />
              </span>
              <p>Orders shipped</p>
            </div>
            <div className="metric-value">
              <strong>{counts.shipped}</strong>
              <small>In carrier network</small>
            </div>
          </article>
          <article className="metric">
            <div className="metric-heading">
              <span className="metric-icon green">
                <PackageCheck size={23} />
              </span>
              <p>Orders delivered</p>
            </div>
            <div className="metric-value">
              <strong>{counts.delivered}</strong>
              <small>Successfully completed</small>
            </div>
          </article>
          <article className="metric">
            <div className="metric-heading">
              <span className="metric-icon violet">
                <TrendingUp size={23} />
              </span>
              <p>Covered by printed stock</p>
            </div>
            <div className="metric-value">
              <strong>{matAvailability.readyOrderIds.size}</strong>
              <small>Check holds before packing</small>
            </div>
          </article>
          <article className="metric issues-metric">
            <div className="metric-heading">
              <span className="metric-icon red">
                <Flag size={23} />
              </span>
              <p>Orders with issues</p>
            </div>
            <div className="metric-value">
              <strong>{currentOrderIssues.length}</strong>
              <small>Resolve issues to ship</small>
            </div>
          </article>
        </section>

        <section className="panel orders-panel" id="order-queue">
          <div className="orders-head">
            <div>
              <p className="eyebrow">ORDER ACTIVITY</p>
              <h2>Fulfillment queue</h2>
            </div>
            <div className="table-actions">
              <label className="search">
                <Search size={16} />
                <input
                  aria-label="Search fulfillment orders"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Order number, customer, or design"
                />
              </label>
              <select
                aria-label="Filter by order status"
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
              >
                <option value="all">All undelivered orders</option>
                <option value="pending">Pending orders</option><option value="ready">Ready from printed stock</option><option value="to-print">Needs printing</option><option value="held">On hold</option>
                <option value="shipped">Orders in Transit</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>
          </div>
          <div className="order-summary-tiles" aria-label="Order summary">
            <article className="order-summary-tile pending"><PackageOpen size={20} aria-hidden="true"/><div><span>Pending Orders</span><strong>{orders.filter(order => order.status === "pending").length}</strong></div></article>
            <article className="order-summary-tile transit"><Truck size={20} aria-hidden="true"/><div><span>Orders in Transit</span><strong>{orders.filter(order => order.status === "shipped").length}</strong></div></article>
            <article className="order-summary-tile delivered"><PackageCheck size={20} aria-hidden="true"/><div><span>Orders Delivered Today</span><strong>{deliveredToday}</strong><small>Confirmed delivery · Detroit time</small></div></article>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th>Tracking</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {(["pending", "shipped", "delivered"] as const).map(group => {
                const groupOrders = filtered.filter(order => order.status === group);
                if (group === "delivered" && filter !== "delivered") return null;
                return <Fragment key={group}><tr className="shipment-section-heading"><td colSpan={7}><strong>{group === "pending" ? "Pending orders" : group === "shipped" ? "Orders in Transit" : "Delivered"}</strong><span>{groupOrders.length} orders</span></td></tr>
                {groupOrders.length === 0 && <tr><td colSpan={7} className="muted">No {group === "shipped" ? "in-transit" : group} orders match this view.</td></tr>}
                {groupOrders.map((order) => {
                  const expanded = expandedOrderIds.has(order.id);
                  const lineItems = order.items?.length
                    ? order.items
                    : [{ name: order.item, quantity: order.quantity }];
                  const issue = currentOrderIssues.find(
                    (item) => item.order_id === order.id || item.order_number === order.orderNumber,
                  );
                  const address = order.shippingAddress;
                  return (
                    <Fragment key={order.id}>
                      <tr
                        className={`order-row${expanded ? " expanded" : ""}${issue ? " has-issue" : ""}`}
                        onClick={() =>
                          setExpandedOrderIds((current) => {
                            const next = new Set(current);
                            if (expanded) next.delete(order.id);
                            else next.add(order.id);
                            return next;
                          })
                        }
                      >
                        <td data-label="Order">
                          <button
                            className="order-expand"
                            type="button"
                            aria-expanded={expanded}
                            aria-controls={`order-items-${order.id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedOrderIds((current) => {
                                const next = new Set(current);
                                if (expanded) next.delete(order.id);
                                else next.add(order.id);
                                return next;
                              });
                            }}
                          >
                            <ChevronDown size={16} />
                            <strong title={order.orderNumber}>
                              {displayOrderNumber(order.orderNumber)}
                            </strong>
                            {issue && (
                              <span className="issue-pill order-warning">
                                <AlertTriangle size={13} />
                                Issue
                              </span>
                            )}
                          </button>
                        </td>
                        <td data-label="Customer">{order.customer}</td>
                        <td data-label="Product" className="product-cell">
                          {lineItems.length > 1
                            ? `${lineItems.length} line items`
                            : order.item}
                        </td>
                        <td data-label="Quantity">{order.quantity}</td>
                        <td data-label="Status">
                          {order.status==="pending"&&matStockChecked&&<small className="stock-allocation">{matAvailability.allocations.get(order.id)?.printed||0} reserved from printed stock · {matAvailability.allocations.get(order.id)?.toPrint||0} to print</small>}
                          {heldOrderIds.has(order.id) ? <span className="status on-hold"><i />ON HOLD</span> : <StatusBadge status={order.status} />}
                          {order.status === "pending" && (blockedMatOrders.has(order.id) || missingFulfillmentSupplies.length > 0 || (inkPercent<=0 && (matAvailability.allocations.get(order.id)?.toPrint??0)>0)) && (
                            <span className="issue-pill mat-shortage-pill" title={[blockedMatOrders.has(order.id) ? "mats" : null, ...missingFulfillmentSupplies, inkPercent<=0 && (matAvailability.allocations.get(order.id)?.toPrint??0)>0?"ink":null].filter(Boolean).join(", ")}>
                              <AlertTriangle size={13} aria-hidden="true" /> Unable to ship · {[blockedMatOrders.has(order.id) ? "mats" : null, ...missingFulfillmentSupplies, inkPercent<=0 && (matAvailability.allocations.get(order.id)?.toPrint??0)>0?"ink":null].filter(Boolean).join(", ")}
                            </span>
                          )}
                        </td>
                        <td data-label="Tracking">
                          {order.trackingNumber ? <ShipmentTrackingDetails order={order} /> : <span className="muted">Not assigned · awaiting shipment</span>}
                        </td>
                        <td data-label="Date">
                          {new Intl.DateTimeFormat("en-US", {
                            month: "short",
                            day: "numeric",
                          }).format(
                            new Date(order.shipDate ?? order.orderDate),
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr
                          className="order-detail-row"
                          id={`order-items-${order.id}`}
                        >
                          <td colSpan={7}>
                            <div className="order-detail">
                              <div className="order-detail-heading">
                                <strong>
                                  Items in{" "}
                                  {displayOrderNumber(order.orderNumber)}
                                </strong>
                                <span>
                                  {lineItems.length}{" "}
                                  {lineItems.length === 1
                                    ? "line item"
                                    : "line items"}{" "}
                                  · {order.quantity} total{" "}
                                  {order.quantity === 1 ? "unit" : "units"}
                                </span>
                              </div>
                              <ul>
                                {lineItems.map((item, index) => (
                                  <li key={`${item.name}-${index}`}>
                                    <span>{item.name}</span>
                                    <strong>Qty {item.quantity}</strong>
                                    {order.status==="pending"&&matStockChecked&&<small>{matAvailability.allocations.get(order.id)?.lines.find(line=>line.name===item.name)?.printed||0} from printed stock</small>}
                                  </li>
                                ))}
                              </ul>
                              <div className="shipping-details">
                                <section>
                                  <span>SHIP TO</span>
                                  <strong>
                                    {address?.name || order.customer}
                                  </strong>
                                  {address?.company && <p>{address.company}</p>}
                                  {address?.street1 && <p>{address.street1}</p>}
                                  {address?.street2 && <p>{address.street2}</p>}
                                  {address?.street3 && <p>{address.street3}</p>}
                                  {(address?.city ||
                                    address?.state ||
                                    address?.postalCode) && (
                                    <p>
                                      {[
                                        address.city,
                                        address.state,
                                        address.postalCode,
                                      ]
                                        .filter(Boolean)
                                        .join(", ")}
                                    </p>
                                  )}
                                  {address?.country && <p>{address.country}</p>}
                                </section>
                                <section>
                                  <span>CONTACT</span>
                                  <strong>
                                    {order.customerEmail || "Email unavailable"}
                                  </strong>
                                  <p>
                                    {order.customerPhone || "Phone unavailable"}
                                  </p>
                                </section>
                                <section>
                                  <span>SHIPMENT</span>
                                  <strong>
                                    {order.carrier || "Carrier not assigned"}
                                    {order.service ? ` · ${order.service}` : ""}
                                  </strong>
                                  <p>
                                    {order.trackingNumber ||
                                      "Tracking not assigned"}
                                  </p>
                                  <p>
                                    Ordered{" "}
                                    {new Date(order.orderDate).toLocaleString()}
                                  </p>
                                  {order.shipDate && (
                                    <p>
                                      Shipped{" "}
                                      {new Date(
                                        order.shipDate,
                                      ).toLocaleString()}
                                    </p>
                                  )}
                                </section>
                              </div>
                              <OrderIssueHistory orderId={order.id} version={issueHistoryVersion} />
                              {issueError && <p role="alert">{issueError}</p>}
                              {issue ? (
                                <div className="order-issue-box">
                                  <div>
                                    <Flag size={18} />
                                    <span>
                                      <strong>{issue.reason}</strong>
                                      {issue.note && (
                                        <small>{issue.note}</small>
                                      )}
                                      <small>
                                        Flagged by {issue.created_by_name}
                                      </small>
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => resolveIssue(order.id)}
                                    disabled={issueSaving}
                                  >
                                    <CircleCheck size={16} />
                                    Mark resolved
                                  </button>
                                </div>
                              ) : (
                                order.status === "pending" && (
                                  <div className="flag-order-form">
                                    <strong>Unable to ship?</strong>
                                    <div>
                                      <select
                                        value={issueReason}
                                        onChange={(event) =>
                                          setIssueReason(event.target.value)
                                        }
                                      >
                                        <option>Incomplete address</option>
                                        <option>Cannot ship to PO box</option>
                                        <option>
                                          Address verification failed
                                        </option>
                                        <option>
                                          Missing customer information
                                        </option>
                                        <option>Inventory unavailable</option>
                                        <option>Other</option>
                                      </select>
                                      <input
                                        value={issueNote}
                                        onChange={(event) =>
                                          setIssueNote(event.target.value)
                                        }
                                        placeholder="Optional details"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => flagOrder(order)}
                                        disabled={issueSaving}
                                      >
                                        <Flag size={15} />
                                        {issueSaving ? "Saving…" : "Flag order"}
                                      </button>
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}</Fragment>;
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="empty">No orders match this search.</div>
            )}
          </div>
          <footer className="panel-footer">
            <span>
              Showing {filtered.length} of {orders.length} orders
            </span>
            <span>
              {lastSync
                ? `Last successful refresh: ${lastSync}`
                : "Loaded with page"}
            </span>
          </footer>
        </section>
        </div>
        <div className="workspace-pane" data-workspace="inventory" hidden={activeSection!=="inventory"}>
        {!inventoryLoaded||!finishedMatsLoaded?<p role="status">Loading inventory…</p>:null}
        <div hidden={!inventoryLoaded||!finishedMatsLoaded}>
        <div className="dashboard-section-heading" id="inventory">
          <div>
            <span className="section-icon">
              <Boxes size={18} />
            </span>
            <h2>Inventory &amp; Supplies</h2>
          </div>
          <p>On hand · committed · available</p>
        </div>
        <section className="supply-grid" id="supplies">
          <SupplyCard
            icon={<RectangleHorizontal size={23} />}
            title="Blank coir mats"
            value={supplies.mats}
            unit="mats"
            detail="Reserved only for mats that still need printing"
            percent={supplies.mats > 25 ? 100 : supplies.mats * 4}
            committed={matAvailability.blankDemand}
            available={availableMats}
            incoming={incoming.mats}
            low={availableMats <= 0}
            admin={view === "admin"}
            onSet={(value) => setSupply("mats", value)}
          />
          <SupplyCard
            icon={<Box size={21} />}
            title="Shipping boxes"
            value={supplies.boxes}
            unit="boxes"
            detail="One box per two mats in each order"
            percent={supplies.boxes > 25 ? 100 : supplies.boxes * 4}
            committed={committedBoxes}
            available={availableBoxes}
            incoming={incoming.boxes}
            low={availableBoxes <= 0}
            admin={view === "admin"}
            onSet={(value) => setSupply("boxes", value)}
          />
          <SupplyCard
            icon={<Package size={21} />}
            title="Packing tape"
            value={supplies.tape}
            unit="rolls"
            detail={`${supplies.tapeUsage} of ${tapeCoverage} mat uses on current roll`}
            percent={supplies.tape > 10 ? 100 : supplies.tape * 10}
            committed={committedTapeRolls}
            available={availableTape}
            incoming={incoming.tape}
            low={availableTapeMatCapacity <= 0}
            admin={view === "admin"}
            onSet={(value) => setSupply("tape", value)}
            extraControl={
              <label className="manual-adjust">
                <span>Mats per roll</span>
                <input
                  type="number"
                  min="1"
                  value={tapeCoverage}
                  onChange={(event) =>
                    setSupply(
                      "tapeCoverage",
                      Math.max(1, Number(event.target.value)),
                    )
                  }
                />
              </label>
            }
          />
          <SupplyCard
            icon={<Mail size={21} />}
            title="Thank-you cards"
            value={supplies.thankYouCards}
            unit="cards"
            detail="One reserved per pending mat"
            percent={
              supplies.thankYouCards > 25 ? 100 : supplies.thankYouCards * 4
            }
            committed={pendingOrders.length}
            available={availableThankYouCards}
            incoming={incoming.thankYouCards}
            low={availableThankYouCards <= 0}
            admin={view === "admin"}
            onSet={(value) => setSupply("thankYouCards", value)}
          />
          <SupplyCard
            icon={<ShoppingBag size={21} />}
            title="Poly bags"
            value={supplies.polyBags}
            unit="bags"
            detail="One reserved per pending mat"
            percent={supplies.polyBags > 25 ? 100 : supplies.polyBags * 4}
            committed={committedUnits}
            available={availablePolyBags}
            incoming={incoming.polyBags}
            low={availablePolyBags <= 0}
            admin={view === "admin"}
            onSet={(value) => setSupply("polyBags", value)}
          />
          <SupplyCard
            icon={<Droplets size={21} />}
            title="Ink supply"
            value={inkPercent}
            unit="%"
            detail={
              inkPercent < 50 ? "Reorder recommended" : "Supply level healthy"
            }
            percent={inkPercent}
            incoming={incoming.ink}
            purchaseUrl={inkPercent < 50 ? "https://www.amazon.com/dp/B000C1952Q?ref=ppx_yo2ov_dt_b_fed_asin_title&th=1" : undefined}
            verticalMeter
            admin={view === "admin"}
            onSet={(value) => setSupply("ink", Math.min(100, value))}
          />
        </section>

        <div className="dashboard-section-heading" id="printed-mats">
          <div>
            <span className="section-icon">
              <Factory size={18} />
            </span>
            <h2>Printed Mats Ready for Orders</h2>
          </div>
          <p>Finished on hand · committed · available</p>
        </div>
        <section className="finished-mats-grid">
          {finishedMatCards.map((mat) => (
            <article className="finished-mat-card" key={mat.design_key}>
              <div>
                <span>READY STOCK</span>
                <h3>{mat.design_name}</h3>
              </div>
              <strong>{mat.quantity}</strong>
              <div className="allocation">
                <div>
                  <span>Committed</span>
                  <b>{mat.committed}</b>
                </div>
                <div>
                  <span>Available</span>
                  <b>{mat.available}</b>
                </div>
              </div>
            </article>
          ))}
          {view === "admin" && (
            <article className="finished-mat-card print-batch-card">
              <div>
                <span>ADJUST PRINTED STOCK</span>
                <h3>Add or remove printed mats</h3>
              </div>
              <label>
                Design
                <select
                  value={printBatch.designKey}
                  onChange={(event) =>
                    setPrintBatch({
                      ...printBatch,
                      designKey: event.target.value,
                    })
                  }
                >
                  {finishedMats.map((mat) => (
                    <option key={mat.design_key} value={mat.design_key}>
                      {mat.design_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantity change (+ / −)
                <input
                  type="number"
                  min={-(finishedMats.find((mat) => mat.design_key === printBatch.designKey)?.quantity ?? 0)}
                  max={Math.min(10000, supplies.mats)}
                  step="1"
                  placeholder="e.g. 10 or -5"
                  value={printBatch.quantity}
                  onChange={(event) =>
                    setPrintBatch({
                      ...printBatch,
                      quantity: event.target.value,
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="sync-button"
                disabled={printSaving || !printBatch.quantity || !Number.isInteger(Number(printBatch.quantity)) || Number(printBatch.quantity) === 0 || Number(printBatch.quantity) < -Math.min(10000, finishedMats.find((mat) => mat.design_key === printBatch.designKey)?.quantity ?? 0) || Number(printBatch.quantity) > Math.min(10000, supplies.mats)}
                onClick={recordPrintBatch}
              >
                {printSaving ? "Saving…" : Number(printBatch.quantity) < 0 ? "Remove printed mats" : "Add finished batch"}
              </button>
              {printMessage && <small role="status">{printMessage}</small>}
              <p>
                Positive quantities transfer blank mats into printed stock.
                Negative quantities remove printed stock without adding blanks back.
              </p>
            </article>
          )}
        </section>

        <article
          className={`panel capacity-panel capacity-summary${capacityBlockers.length ? " blocked" : ""}`}
        >
          <div className="panel-heading">
            <div>
              <p className="eyebrow">AVAILABLE AFTER COMMITMENTS</p>
              <h2>{availableCapacity} orders</h2>
            </div>
            <span className="icon-box">
              <Settings2 size={19} />
            </span>
          </div>
          <p>
            After reserving supplies for{" "}
            <strong>{committedUnits} pending units</strong>, you can accept up
            to <strong>{availableCapacity} additional single-mat orders</strong>
            .
          </p>
          <p>{matAvailability.availablePrinted} unreserved printed mats + {availableMats} unreserved blanks. Printed stock must match the ordered design. {matAvailability.readyOrderIds.size} pending orders are covered by printed stock.</p>
          {capacityBlockers.length > 0 ? (
            <div className="capacity-blockers">
              <strong>Additional capacity is limited by:</strong>
              <ul>
                {capacityBlockers.map((supply) => (
                  <li key={supply.label}>
                    <AlertTriangle size={20} />
                    <span>
                      <b>{supply.available}</b> {supply.label} available
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="capacity-clear">
              <PackageCheck size={21} />
              <strong>All required supplies are available.</strong>
            </div>
          )}
        </article>

        </div>
        </div>
        <div className="workspace-pane" data-workspace="production" hidden={activeSection!=="production"}>
        <section id="production-runs" aria-labelledby="production-runs-title">
          <div className="dashboard-section-heading">
            <div><span className="section-icon"><CalendarDays size={18} /></span><h2 id="production-runs-title">Production Runs</h2></div>
            <p>Current run, upcoming batches, and post-run breakdowns</p>
          </div>
          <ProductionPlan
          isAdmin={session.role === "admin" && view === "admin"}
          blankMats={supplies.mats}
          pendingByDesign={pendingByDesign}
          finishedMats={finishedMats}
        />
        </section>

        </div>
        <div className="workspace-pane" data-workspace="financial" hidden={activeSection!=="financial"}>
        <div id="operations">
          <FinancialLogistics
            session={{
              ...session,
              role: view === "marsh" ? "partner" : session.role,
              canCreateCharges: session.canCreateCharges && view === "admin",
            }}
            onIncomingChange={setIncoming}
            onInventoryReceived={receiveSupply}
            onBalanceChange={setBalanceOwed}
          />
        </div>

        </div>
        <div className="workspace-pane" data-workspace="defects" hidden={activeSection!=="defects"}>
        <DefectiveMats session={{...session,role:view==="marsh"?"partner":session.role}} onChange={loadInventory}/>
        </div>
        <div className="workspace-pane" data-workspace="sales" hidden={activeSection!=="sales"}>
        <div
          className="dashboard-section-heading product-heading"
          id="mat-sales"
        >
          <div>
            <span className="section-icon">
              <TrendingUp size={18} />
            </span>
            <h2>Mat Sales</h2>
          </div>
          <p>Design totals from loaded orders</p>
        </div>
        <section
          className="panel mat-sales-chart"
          aria-label="Mat sales by design"
        >
          <div className="chart-heading">
            <div>
              <p className="eyebrow">DESIGN COMPARISON</p>
              <h2>Units sold</h2>
            </div>
            <strong>
              {matSalesTotal}
              <small> total mats</small>
            </strong>
          </div>
          <div className="bar-chart">
            {matSales.map((design) => (
              <div className="bar-row" key={design.label}>
                <div className="bar-label">
                  <span>{design.label}</span>
                  <strong>{design.value.toLocaleString()}</strong>
                </div>
                <div className="bar-track" aria-hidden="true">
                  <span
                    className={design.tone}
                    style={{
                      width: `${(design.value / largestMatTotal) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          {matSalesTotal === 0 && (
            <p className="chart-empty">
              No matching mat sales in the loaded orders yet.
            </p>
          )}
        </section>

        <OperationalCharts
          orders={orders}
          availability={[
            { label: "Printed mats", value: matAvailability.availablePrinted, tone: "mint" },
            { label: "Blank mats", value: availableMats, tone: "blue" },
            { label: "Shipping boxes", value: availableBoxes, tone: "mint" },
            { label: "Poly bags", value: availablePolyBags, tone: "orange" },
            { label: "Thank-you cards", value: availableThankYouCards, tone: "purple" },
          ]}
        />

        <section className="analytics-row" aria-label="Order analytics">
          <article className="panel analytics-panel">
            <div className="analytics-heading">
              <div>
                <p className="eyebrow">CURRENT QUEUE</p>
                <h2>Order movement</h2>
              </div>
              <strong>{orders.length} <span>loaded orders</span></strong>
            </div>
            <div className="movement-chart">
              {[
                { label: "Awaiting production", value: ordersAwaitingProduction, tone: "amber" },
                { label: "In production", value: Math.min(ordersInProduction,Math.max(0,counts.pending-matAvailability.readyOrderIds.size)), tone: "violet" },
                { label: "Printed stock allocated", value: matAvailability.readyOrderIds.size, tone: "green" },
                { label: "Shipped", value: counts.shipped, tone: "blue" },
                { label: "Delivered", value: counts.delivered, tone: "green" },
              ].map((item) => (
                <div className="movement-row" key={item.label}>
                  <span>{item.label}</span>
                  <div className="movement-track" role="img" aria-label={`${item.label}: ${item.value} orders`}>
                    <i className={item.tone} style={{ width: `${orders.length ? Math.max(item.value > 0 ? 2 : 0, item.value / orders.length * 100) : 0}%` }} />
                  </div>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </article>
          <article className="panel analytics-panel completion-panel">
            <div className="analytics-heading">
              <div>
                <p className="eyebrow">FULFILLMENT</p>
                <h2>Delivered orders</h2>
              </div>
            </div>
            <div className="completion-body">
              <div className="completion-donut" role="img" aria-label={`${counts.delivered} of ${orders.length} loaded orders delivered`} style={{ "--completion": `${orders.length ? counts.delivered / orders.length * 100 : 0}%` } as React.CSSProperties}>
                <div><strong>{orders.length ? Math.round(counts.delivered / orders.length * 100) : 0}%</strong><span>delivered</span></div>
              </div>
              <div className="completion-legend">
                <div><i className="delivered-dot" /><span>Delivered</span><strong>{counts.delivered}</strong></div>
                <div><i className="open-dot" /><span>Other statuses</span><strong>{Math.max(0, orders.length - counts.delivered)}</strong></div>
              </div>
            </div>
          </article>
        </section>


        </div>
        <div className="workspace-pane" data-workspace="team" hidden={activeSection!=="team"}>
        <PortalAccess />
        {session.role === "admin" && view === "admin" && <AccessManager />}
        </div>
        <Messenger session={session} />
      </div>
    </main>
  );
}
