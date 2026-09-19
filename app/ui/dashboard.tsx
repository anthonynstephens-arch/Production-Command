"use client";

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
} from "lucide-react";
import type { PortalOrder } from "@/lib/shipstation";
import type { PortalSession } from "@/lib/auth";
import AccessManager from "./access-manager";
import PortalAccess from "./portal-access";
import NotificationSettings, {
  disconnectPushDevice,
} from "./notification-settings";
import FinancialLogistics from "./financial-logistics";
import Messenger from "./messenger";

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
  mats: 250,
  boxes: 250,
  ink: 82,
  tape: 24,
  tapeCoverage: 25,
  tapeUsage: 0,
  thankYouCards: 250,
  polyBags: 250,
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
          <div className="ink-level" aria-label={`${percent} percent ink`}>
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

function designKey(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("did you call")) return "did-you-call-first";
  if (normalized.includes("upside down") || normalized.includes("upside-down"))
    return "upside-down-welcome";
  if (normalized.includes("whatupdoe") || normalized.includes("what up doe"))
    return "whatupdoe";
  if (normalized.includes("marsh supply") || normalized.includes("marsh"))
    return "marsh-supply";
  return null;
}

export default function Dashboard({
  initialOrders,
  initialConnected,
  initialMessage,
  session,
}: Props) {
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
  const issueExpansionInitialized = useRef(false);
  const [orderIssues, setOrderIssues] = useState<OrderIssue[]>([]);
  const [issueReason, setIssueReason] = useState("Incomplete address");
  const [issueNote, setIssueNote] = useState("");
  const [issueSaving, setIssueSaving] = useState(false);
  const [finishedMats, setFinishedMats] = useState<FinishedMat[]>([]);
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
  };

  useEffect(() => {
    loadInventory().catch(() => {});
    const refresh = () => loadInventory().catch(() => {});
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const loadOperationalData = async () => {
    const [issuesResponse, matsResponse] = await Promise.all([
      fetch("/api/order-issues", { cache: "no-store" }),
      fetch("/api/finished-mats", { cache: "no-store" }),
    ]);
    if (issuesResponse.ok) {
      const issues: OrderIssue[] = (await issuesResponse.json()).issues ?? [];
      setOrderIssues(issues);
      if (!issueExpansionInitialized.current) {
        setExpandedOrderIds(new Set(issues.map((issue) => issue.order_id)));
        issueExpansionInitialized.current = true;
      }
    }
    if (matsResponse.ok)
      setFinishedMats((await matsResponse.json()).designs ?? []);
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

  useEffect(() => {
    const shippedOrders = orders.filter(
      (order) =>
        (order.status === "shipped" || order.status === "delivered") &&
        order.quantity > 0,
    );
    if (!shippedOrders.length) return;
    let cancelled = false;
    const applyShipmentUsage = async () => {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipments: shippedOrders.map((order) => ({
            id: order.id,
            units: order.quantity,
            designs: (order.items?.length
              ? order.items
              : [{ name: order.item, quantity: order.quantity }]
            ).flatMap((item) => {
              const key = designKey(item.name);
              return key ? [{ key, quantity: item.quantity }] : [];
            }),
          })),
        }),
      });
      if (response.ok && !cancelled) {
        await loadInventory();
        await loadOperationalData();
      }
    };
    applyShipmentUsage().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orders]);

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
  const receiveSupply = async (key: SupplyKey, quantity: number) => {
    const nextValue =
      key === "ink"
        ? Math.min(100, supplies[key] + quantity)
        : supplies[key] + quantity;
    await setSupply(key, nextValue);
  };

  const flagOrder = async (order: PortalOrder) => {
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
      await loadOperationalData();
    } finally {
      setIssueSaving(false);
    }
  };
  const resolveIssue = async (orderId: string) => {
    setIssueSaving(true);
    try {
      await fetch(`/api/order-issues?orderId=${encodeURIComponent(orderId)}`, {
        method: "DELETE",
      });
      await loadOperationalData();
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
      setPrintMessage("Printed mats added and blank inventory reduced.");
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
      setSyncing(false);
    }
  };

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
    const orderIds = new Set(orders.map((order) => order.id));
    const orderNumbers = new Set(orders.map((order) => order.orderNumber));
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

  const issueRank = new Map(
    currentOrderIssues.map((issue, index) => [issue.order_id, index]),
  );
  const filtered = orders
    .filter(
      (order) =>
        (filter === "all" || order.status === filter) &&
        `${order.orderNumber} ${order.customer} ${order.item} ${order.items?.map((item) => item.name).join(" ") ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => {
      const aRank = issueRank.get(a.id);
      const bRank = issueRank.get(b.id);
      if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
      if (aRank !== undefined) return -1;
      if (bRank !== undefined) return 1;
      return 0;
    });
  const committedUnits = orders
    .filter((order) => order.status === "pending")
    .reduce((sum, order) => sum + order.quantity, 0);
  const availableMats = Math.max(0, supplies.mats - committedUnits);
  const availableBoxes = Math.max(0, supplies.boxes - committedUnits);
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
    supplies.thankYouCards - committedUnits,
  );
  const availablePolyBags = Math.max(0, supplies.polyBags - committedUnits);
  const availableCapacity = Math.min(
    availableMats,
    availableBoxes,
    availableTapeMatCapacity,
    availableThankYouCards,
    availablePolyBags,
  );
  const inkPercent = Math.max(0, Math.min(100, supplies.ink));
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
    committed: Math.min(item.quantity, pendingByDesign[item.design_key] || 0),
    available: Math.max(
      0,
      item.quantity - (pendingByDesign[item.design_key] || 0),
    ),
  }));
  const capacityBlockers = [
    { label: "blank coir mats", available: availableMats },
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
    counts.pending - ordersInProduction,
  );
  const pipelineOrders = counts.pending;

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
              {session.role === "admin" && (
                <a
                  href="#portal-users"
                  onClick={() => {
                    setView("admin");
                    setMobileMenuOpen(false);
                  }}
                >
                  Manage users
                </a>
              )}
              <a href="#inventory" onClick={() => setMobileMenuOpen(false)}>
                Inventory
              </a>
              <a href="#pipeline" onClick={() => setMobileMenuOpen(false)}>
                Orders &amp; capacity
              </a>
              <a href="#mat-sales" onClick={() => setMobileMenuOpen(false)}>
                Mat sales
              </a>
              <a href="#operations" onClick={() => setMobileMenuOpen(false)}>
                Payments &amp; deliveries
              </a>
              <a href="#order-queue" onClick={() => setMobileMenuOpen(false)}>
                Fulfillment queue
              </a>
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
        <div className="notification-toolbar">
          <NotificationSettings isAdmin={session.role === "admin"} />
        </div>
        <nav className="dashboard-nav" aria-label="Dashboard sections">
          {session.role === "admin" && (
            <a
              href="#portal-users"
              onClick={() => {
                setView("admin");
                setMobileMenuOpen(false);
              }}
            >
              Manage users
            </a>
          )}
          <a href="#inventory">Inventory</a>
          <a href="#pipeline">Orders & capacity</a>
          <a href="#mat-sales">Mat sales</a>
          <a href="#operations">Payments & deliveries</a>
          <a href="#order-queue">Fulfillment queue</a>
          <a
            href="/marsh-service-agreement.pdf"
            target="_blank"
            rel="noreferrer"
            onClick={() => setMobileMenuOpen(false)}
          >
            Service Agreement
          </a>
        </nav>
        <section className="overview-summary">
          <div className="overview-topline">
            <p className="kicker">MARSH SUPPLY FULFILLMENT OVERVIEW</p>
            {session.role === "admin" && (
              <button
                className="sync-button page-sync-button"
                onClick={sync}
                disabled={syncing}
              >
                <RefreshCw size={17} className={syncing ? "spin" : ""} />
                {syncing ? "Syncing…" : "Sync ShipStation"}
              </button>
            )}
          </div>
          {currentOrderIssues.length > 0 && (
            <a className="summary-copy order-issue-alert" href="#order-queue">
              <Flag size={19} />
              <span>
                <strong>
                  {currentOrderIssues.length}{" "}
                  {currentOrderIssues.length === 1 ? "order is" : "orders are"} unable
                  to ship.
                </strong>{" "}
                Review and resolve the flagged fulfillment issues.
              </span>
            </a>
          )}
          {balanceOwed > 0 && (
            <a className="summary-copy balance-alert" href="#operations">
              <AlertTriangle size={19} />
              <span>
                <strong>
                  Payment due: $
                  {balanceOwed.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </strong>{" "}
                remains outstanding on the payment ledger. View charges and
                recorded payments.
              </span>
            </a>
          )}
          <p
            className={`summary-copy${lowSupplyNames.length ? " attention" : ""}`}
          >
            {lowSupplyNames.length ? (
              <>
                <AlertTriangle size={19} />
                <span>
                  <strong>Purchasing recommended:</strong> Replenish{" "}
                  {lowSupplyNames.join(", ")} to keep fulfillment moving.
                  Current supplies support approximately{" "}
                  <strong>{availableCapacity} additional orders</strong> after
                  commitments.
                </span>
              </>
            ) : (
              <>
                <PackageCheck size={19} />
                <span>
                  <strong>Inventory is ready.</strong> Current supplies support
                  approximately {availableCapacity} additional orders after
                  commitments.
                </span>
              </>
            )}
          </p>
          <div className="summary-stats">
            <div>
              <span>Pipeline</span>
              <strong>{pipelineOrders} orders</strong>
            </div>
            <div>
              <span>Shipping issues</span>
              <strong>{currentOrderIssues.length}</strong>
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
            "Demo data · live orders unavailable"
          )}
        </div>
        {!connected && (
          <div className="setup-banner">
            <AlertTriangle size={18} />
            <div>
              <strong>Live ShipStation data is not connected yet.</strong>
              <span>
                {syncMessage ?? "Add the API key to activate order syncing."}{" "}
                Showing representative data until setup is completed.
              </span>
            </div>
          </div>
        )}

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
            detail="Newly shipped units deduct automatically"
            percent={supplies.mats > 25 ? 100 : supplies.mats * 4}
            committed={committedUnits}
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
            detail="One box reserved per pending unit"
            percent={supplies.boxes > 25 ? 100 : supplies.boxes * 4}
            committed={committedUnits}
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
            committed={committedUnits}
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
              inkPercent <= 25 ? "Reorder recommended" : "Supply level healthy"
            }
            percent={inkPercent}
            incoming={incoming.ink}
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
                <span>RECORD PRODUCTION</span>
                <h3>Add printed mats</h3>
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
                Quantity printed
                <input
                  type="number"
                  min="1"
                  max={supplies.mats}
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
                disabled={printSaving || !printBatch.quantity}
                onClick={recordPrintBatch}
              >
                {printSaving ? "Saving…" : "Add finished batch"}
              </button>
              {printMessage && <small role="status">{printMessage}</small>}
              <p>
                This transfers the quantity from blank mats into finished stock.
                It does not increase total mat inventory.
              </p>
            </article>
          )}
        </section>

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
              <small>Ready for production</small>
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
              <strong>{ordersInProduction}</strong>
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
              <p>Total units</p>
            </div>
            <div className="metric-value">
              <strong>{counts.units}</strong>
              <small>Across visible orders</small>
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
          {capacityBlockers.length > 0 ? (
            <div className="capacity-blockers">
              <strong>Fulfillment is blocked by:</strong>
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
              <strong>Monday</strong>
            </div>
          </article>
        </section>

        <div id="operations">
          <FinancialLogistics
            session={{
              ...session,
              canCreateCharges: session.canCreateCharges && view === "admin",
            }}
            onIncomingChange={setIncoming}
            onInventoryReceived={receiveSupply}
            onBalanceChange={setBalanceOwed}
          />
        </div>

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
                  placeholder="Search orders"
                />
              </label>
              <select
                aria-label="Filter by order status"
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>
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
                {filtered.map((order) => {
                  const expanded = expandedOrderIds.has(order.id);
                  const lineItems = order.items?.length
                    ? order.items
                    : [{ name: order.item, quantity: order.quantity }];
                  const issue = currentOrderIssues.find(
                    (item) => item.order_id === order.id,
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
                          <StatusBadge status={order.status} />
                        </td>
                        <td data-label="Tracking">
                          {order.trackingNumber ? (
                            <span className="tracking">
                              {order.carrier}
                              <ExternalLink size={13} />
                            </span>
                          ) : (
                            <span className="muted">Not assigned</span>
                          )}
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
        <PortalAccess />
        {session.role === "admin" && view === "admin" && <AccessManager />}
        <Messenger session={session} />
      </div>
    </main>
  );
}
