"use client";

import { useEffect, useRef, useState } from "react";
import { countdownText, dryingSeconds, stageAt, stageLabels, type ProductionStage } from "@/lib/production-run";
import { useRunClock } from "./production-run-status";
import type { Plan } from "@/lib/production-run";
export type { Plan } from "@/lib/production-run";
import { CalendarDays, AlertTriangle, Save } from "lucide-react";

type MixKey = "whatupdoe" | "did_you_call_first" | "upside_down_welcome" | "marsh_supply";
type NextRun = Record<MixKey, number> & { is_tbd: boolean; scheduled_date: string | null; scheduled_time: string | null; updated_at: string };
const designs: { key: MixKey; label: string; tone: string }[] = [
  { key: "whatupdoe", label: "Whatupdoe", tone: "blue" },
  { key: "did_you_call_first", label: "Did You Call First?", tone: "mint" },
  { key: "upside_down_welcome", label: "Upside Down Welcome", tone: "orange" },
  { key: "marsh_supply", label: "Marsh Supply", tone: "purple" },
];

function detroitToday() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function nextRunDate() {
  const day = new Date(`${detroitToday()}T12:00:00Z`);
  while (![1, 3, 5].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

export function prettyDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

export function prettyTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

export default function ProductionPlan({ isAdmin, blankMats, pendingByDesign, finishedMats, onPlanChange }: {
  isAdmin: boolean;
  blankMats: number;
  pendingByDesign: Record<string, number>;
  finishedMats: Array<{ design_key: string; quantity: number }>;
  onPlanChange?: (plan: Plan | null) => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [nextRun, setNextRun] = useState<NextRun | null>(null);
  const [isTbd, setIsTbd] = useState(true);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editingCurrent, setEditingCurrent] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [mix, setMix] = useState<Record<MixKey, number>>({ whatupdoe: 10, did_you_call_first: 10, upside_down_welcome: 10, marsh_supply: 10 });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [editVersion, setEditVersion] = useState<string | null>(null);
  const mutation = useRef({ busy: false, version: 0 });
  const now = useRunClock(plan);
  const currentStage = plan ? stageAt(plan, now) : "scheduled";
  const canStartNext = !plan || currentStage === "completed";

  useEffect(() => {
    if (!editing) setDate(nextRunDate());
    let active = true;
    const load = async () => {
      if (mutation.current.busy) return;
      const version = mutation.current.version;
      try {
        const [response, nextResponse] = await Promise.all([
          fetch("/api/production-plan", { cache: "no-store" }),
          fetch("/api/next-production-run", { cache: "no-store" })
        ]);
        if (!response.ok || !nextResponse.ok) throw new Error("The production schedule could not be loaded.");
        const [data, nextData] = await Promise.all([response.json(), nextResponse.json()]);
        if (!active || mutation.current.busy || version !== mutation.current.version) return;
        setPlan(data.plan ?? null);
        onPlanChange?.(data.plan ?? null);
        setNextRun(nextData.next ?? null);
        if (!editing) {
          setIsTbd(nextData.next?.is_tbd ?? true);
          setDate(nextData.next?.scheduled_date ?? nextRunDate());
          setTime(nextData.next?.scheduled_time?.slice(0, 5) ?? "09:00");
          if (nextData.next) setMix(Object.fromEntries(designs.map(({ key }) => [key, nextData.next[key]])) as Record<MixKey, number>);
        }
        setLoadError("");
      } catch (error) {
        if (active && !mutation.current.busy && version === mutation.current.version) setLoadError(error instanceof Error ? error.message : "Could not load the plan.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const timer = window.setInterval(load, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [editing, onPlanChange]);

  const total = designs.reduce((sum, { key }) => sum + Number(mix[key] || 0), 0);
  const isPast = Boolean(plan && currentStage === "scheduled" && plan.scheduled_date < detroitToday());
  const shortages = plan ? designs.filter(({ key }) => {
    const finished = finishedMats.find((mat) => mat.design_key === key)?.quantity ?? 0;
    return Math.max(0, (pendingByDesign[key.replaceAll("_", "-")] ?? 0) - finished) > plan[key];
  }) : [];

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (total !== 40) { setMessage("The four designs must total exactly 40 mats."); return; }
    setSaving(true);
    mutation.current = { busy: true, version: mutation.current.version + 1 };
    setMessage("");
    try {
      const response = await fetch(editingCurrent ? "/api/production-plan" : "/api/next-production-run", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_tbd: isTbd, scheduled_date: !editingCurrent && isTbd ? null : date, scheduled_time: !editingCurrent && isTbd ? null : time, ...mix, expected_updated_at: editVersion }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the plan.");
      if (editingCurrent) { setPlan(data.plan); onPlanChange?.(data.plan); }
      else setNextRun(data.next);
      setEditing(false);
      setMessage(editingCurrent ? "Current schedule saved." : "Next production run saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the plan.");
    } finally { mutation.current.busy = false; setSaving(false); }
  };

  const updateStage = async (stage: ProductionStage) => {
    if (!plan || saving) return;
    setSaving(true);
    mutation.current = { busy: true, version: mutation.current.version + 1 };
    setMessage("");
    try {
      const response = await fetch("/api/production-plan", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: plan.run_id, stage }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update the stage.");
      setPlan(data.plan);
      onPlanChange?.(data.plan);
      setMessage(stageLabels[stage] + " saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the stage.");
    } finally { mutation.current.busy = false; setSaving(false); }
  };
  const toggleEditor = (target: "next" | "current") => {
    if (saving) return;
    if (editing) { setEditing(false); return; }
    const current = target === "current";
    setEditingCurrent(current);
    setEditVersion(current ? plan?.updated_at ?? null : nextRun?.updated_at ?? null);
    setIsTbd(current ? false : nextRun?.is_tbd ?? true);
    setDate((current ? plan?.scheduled_date : nextRun?.scheduled_date) ?? nextRunDate());
    setTime((current ? plan?.scheduled_time : nextRun?.scheduled_time)?.slice(0,5) ?? "09:00");
    const source = current ? plan : nextRun;
    if (source) setMix(Object.fromEntries(designs.map(({key}) => [key,source[key]])) as Record<MixKey,number>);
    setEditing(true); setMessage("");
  };

  const startNext = async () => {
    if (!nextRun || saving || !canStartNext) return;
    setSaving(true);
    mutation.current = { busy: true, version: mutation.current.version + 1 };
    setMessage("");
    try {
      const response = await fetch("/api/next-production-run", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_version: nextRun.updated_at, expected_active: plan?.run_id ?? null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start the next run.");
      setPlan(data.plan); onPlanChange?.(data.plan); setNextRun(null); setIsTbd(true);
      setMessage("PRINTING saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start the run."); }
    finally { mutation.current.busy = false; setSaving(false); }
  };

  return (
    <section className="production-plan panel compact-production-plan" id="production-plan" aria-labelledby="production-plan-title">
      <div className="production-plan-intro">
        <div className="compact-run-heading">
          <h2 id="production-plan-title">Current production run</h2>
          <span>{loading ? "Loading…" : plan ? `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(plan.scheduled_date + "T12:00:00Z"))} · ${prettyTime(plan.scheduled_time)} Detroit · 40 mats` : "No run scheduled"}</span>
        </div>
        {isAdmin && plan && currentStage === "scheduled" && <button type="button" className="plan-edit-button" disabled={saving} onClick={() => toggleEditor("current")}>Edit current schedule</button>}
      </div>

      {plan && <div className="run-progress">
        <ol className="run-stage-list" aria-label="Production stages">
          {(["printing", "drying", "packaging"] as const).map((stage, index) => {
            const rank = ["scheduled", "printing", "drying", "packaging", "completed"].indexOf(currentStage);
            const reached = rank > index;
            const available = isAdmin && !saving && !editing && (
              (stage === "printing" && currentStage === "scheduled") ||
              (stage === "drying" && currentStage === "printing"));
            return <li key={stage} className={currentStage === stage ? "active" : reached ? "done" : ""}>
              <button type="button" disabled={!available} aria-current={currentStage === stage ? "step" : undefined}
                onClick={() => void updateStage(stage)}>
                <span className="run-stage-number">{reached && currentStage !== stage ? "✓" : index + 1}</span>
                <span className="run-stage-copy">
                  <strong>{stageLabels[stage]}</strong>
                  {stage === "drying" && currentStage === "drying" &&
                    <span className="drying-pill-timer" role="timer" aria-live="off" aria-label="Drying time remaining">{countdownText(dryingSeconds(plan, now))}</span>}
                </span>
              </button>
            </li>;
          })}
        </ol>
        {isAdmin ? <label className="run-completed-check">
          <input type="checkbox" checked={currentStage === "completed"}
            disabled={saving || editing || currentStage !== "packaging"}
            onChange={event => { if (event.target.checked) void updateStage("completed"); }}/>
          <span><strong>Completed</strong></span>
        </label> : currentStage === "completed" ? <p className="run-complete-note">Packing finished · Run completed</p> : null}
      </div>}

      {plan && <details className="compact-run-breakdown">
        <summary>Batch breakdown</summary>
        <div className="run-mix-list">{designs.map(({ key, label, tone }) => <div key={key}><i className={tone}/><span>{label}</span><strong>{plan[key]}</strong></div>)}</div>
      </details>}

      <div className="next-production-slot" id="next-production-run">
        <div className="next-production-heading">
          <div><h3>Next production run</h3>
            <strong>{loading ? "Loading…" : nextRun && !nextRun.is_tbd && nextRun.scheduled_date && nextRun.scheduled_time
              ? prettyDate(nextRun.scheduled_date) + " · " + prettyTime(nextRun.scheduled_time) + " Detroit"
              : "TBD"}</strong>
          </div>
          {isAdmin && !loading && <div className="next-production-actions">
            <button type="button" disabled={saving} className="plan-edit-button" onClick={() => toggleEditor("next")}>{editing && !editingCurrent ? "Close editor" : nextRun ? "Edit next run" : "Plan next run"}</button>
            {nextRun && canStartNext && !editing && <button type="button" disabled={saving} className="plan-edit-button" onClick={() => void startNext()}>Start PRINTING</button>}
          </div>}
        </div>
        {nextRun && <details className="compact-run-breakdown"><summary>Next batch · 40 mats</summary>
          <div className="run-mix-list">{designs.map(({ key, label, tone }) => <div key={key}><i className={tone}/><span>{label}</span><strong>{nextRun[key]}</strong></div>)}</div>
        </details>}
      </div>

      {plan && currentStage === "scheduled" && blankMats < 40 && <p className="plan-warning"><AlertTriangle size={17} /> {40 - blankMats} more blank mats are needed for this run. The plan does not reserve inventory.</p>}
      {plan && currentStage === "scheduled" && shortages.length > 0 && <p className="plan-warning"><AlertTriangle size={17} /> Pending demand exceeds this batch mix for {shortages.map((item) => item.label).join(", ")}. Review the quantities before production.</p>}
      {isPast && <p className="plan-warning"><CalendarDays size={17} /> This scheduled date has passed. Update the schedule or mark PRINTING when this run begins.</p>}

      {isAdmin && editing && <form className="production-plan-form" onSubmit={save}>
        {!editingCurrent && <label className="next-run-timing">Next run timing<select value={isTbd ? "tbd" : "scheduled"} onChange={event => setIsTbd(event.target.value === "tbd")}><option value="tbd">TBD</option><option value="scheduled">Choose date and time</option></select></label>}
        <div className="plan-date-fields"><label>Run date <input type="date" disabled={!editingCurrent && isTbd} required={editingCurrent || !isTbd} min={detroitToday()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>Start time · Detroit <input type="time" disabled={isTbd} required={!isTbd} value={time} onChange={(event) => setTime(event.target.value)} /></label></div>
        <div className="plan-quantity-fields">{designs.map(({ key, label }) => <label key={key}>{label}<input type="number" min="0" max="40" step="1" required value={mix[key]} onChange={(event) => setMix({ ...mix, [key]: Number(event.target.value) })} /></label>)}</div>
        <div className="plan-form-footer"><span className={total === 40 ? "complete" : "incomplete"}>{total} / 40 mats planned</span><button type="submit" disabled={saving || total !== 40}><Save size={16} /> {saving ? "Saving…" : editingCurrent ? "Save current schedule" : "Save next production run"}</button></div>
      </form>}
      {loadError && <p className="plan-warning" role="alert">{loadError}</p>}
      {message && <p className="plan-feedback" role="status">{message}</p>}
    </section>
  );
}
