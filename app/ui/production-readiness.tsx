"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarDays, Check, ClipboardCheck, CreditCard, Package, Truck } from "lucide-react";

type TaskId = "mats" | "delivery" | "payment";
type Completion = Record<TaskId, boolean>;

const storageKey = "marsh-supply:production-checklist:2026-11-16";
const emptyChecklist: Completion = { mats: false, delivery: false, payment: false };

export default function ProductionReadiness() {
  const [completed, setCompleted] = useState<Completion>(emptyChecklist);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (parsed && typeof parsed === "object") {
          const values = parsed as Partial<Completion>;
          setCompleted({
            mats: values.mats === true,
            delivery: values.delivery === true,
            payment: values.payment === true,
          });
        }
      }
    } catch {
      // Storage is optional; the checklist remains usable without it.
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(completed));
    } catch {
      // Storage may be unavailable in private browsing.
    }
  }, [completed, restored]);

  const toggle = (task: TaskId) =>
    setCompleted(previous => ({ ...previous, [task]: !previous[task] }));
  const done = Object.values(completed).filter(Boolean).length;

  return (
    <section className="production-readiness" aria-labelledby="production-readiness-title">
      <header className="production-readiness-header">
        <div className="production-readiness-intro">
          <p className="production-readiness-overline"><ClipboardCheck size={17} aria-hidden="true" /> UPCOMING PRODUCTION RUN</p>
          <h2 id="production-readiness-title">Production preparation</h2>
          <p className="production-readiness-date"><CalendarDays size={17} aria-hidden="true" /> Monday, November 16, 2026 · 9:00 AM Detroit</p>
        </div>
        <div className="production-readiness-status" aria-live="polite">
          <div><strong>{done} of 3 complete</strong><span>{done === 3 ? "Ready for production" : `${3 - done} remaining`}</span></div>
          <progress max={3} value={done} aria-label="Production preparation progress" />
        </div>
      </header>

      <ol className="production-readiness-list">
        <li className={completed.mats ? "is-complete" : ""}>
          <label className="production-readiness-task">
            <input type="checkbox" checked={completed.mats} onChange={() => toggle("mats")} />
            <span className="production-readiness-check"><Check size={16} aria-hidden="true" /></span>
            <span className="production-readiness-task-icon"><Package size={20} aria-hidden="true" /></span>
            <span className="production-readiness-task-copy">
              <strong>Order 37 blank mats</strong>
              <small>Ship to 36 Sylvan, Pontiac, MI 48341</small>
            </span>
          </label>
        </li>
        <li className={completed.delivery ? "is-complete" : ""}>
          <label className="production-readiness-task">
            <input type="checkbox" checked={completed.delivery} onChange={() => toggle("delivery")} />
            <span className="production-readiness-check"><Check size={16} aria-hidden="true" /></span>
            <span className="production-readiness-task-icon"><Truck size={20} aria-hidden="true" /></span>
            <span className="production-readiness-task-copy">
              <strong>Notify staff of incoming delivery</strong>
              <small>Record the incoming shipment on the Deliveries page</small>
            </span>
          </label>
          <a className="production-readiness-link" href="#incoming-deliveries">Open deliveries <ArrowUpRight size={16} aria-hidden="true" /></a>
        </li>
        <li className={completed.payment ? "is-complete" : ""}>
          <label className="production-readiness-task">
            <input type="checkbox" checked={completed.payment} onChange={() => toggle("payment")} />
            <span className="production-readiness-check"><Check size={16} aria-hidden="true" /></span>
            <span className="production-readiness-task-icon"><CreditCard size={20} aria-hidden="true" /></span>
            <span className="production-readiness-task-copy">
              <strong>Remit payment to Detroit Decal</strong>
              <small><b>$504.00 balance due</b> · $560.00 less $56.00 credit</small>
            </span>
          </label>
          <a className="production-readiness-link" href="#operations">View account <ArrowUpRight size={16} aria-hidden="true" /></a>
        </li>
      </ol>
    </section>
  );
}
