"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock3, AlertTriangle, Factory, Save } from "lucide-react";

type MixKey = "whatupdoe" | "did_you_call_first" | "upside_down_welcome" | "marsh_supply";
type Plan = Record<MixKey, number> & { scheduled_date: string; scheduled_time: string; updated_at: string };
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

function prettyDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

function prettyTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

export default function ProductionPlan({ isAdmin, blankMats, pendingByDesign, finishedMats }: {
  isAdmin: boolean;
  blankMats: number;
  pendingByDesign: Record<string, number>;
  finishedMats: Array<{ design_key: string; quantity: number }>;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [mix, setMix] = useState<Record<MixKey, number>>({ whatupdoe: 10, did_you_call_first: 10, upside_down_welcome: 10, marsh_supply: 10 });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDate(nextRunDate());
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/production-plan", { cache: "no-store" });
        if (!response.ok) throw new Error("The production plan could not be loaded.");
        const data = await response.json();
        if (!active) return;
        setPlan(data.plan ?? null);
        if (data.plan && !editing) {
          setDate(data.plan.scheduled_date);
          setTime(data.plan.scheduled_time.slice(0, 5));
          setMix(Object.fromEntries(designs.map(({ key }) => [key, data.plan[key]])) as Record<MixKey, number>);
        }
        setMessage("");
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Could not load the plan.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const timer = window.setInterval(load, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [editing]);

  const total = designs.reduce((sum, { key }) => sum + Number(mix[key] || 0), 0);
  const isPast = Boolean(plan && plan.scheduled_date < detroitToday());
  const shortages = plan ? designs.filter(({ key }) => {
    const finished = finishedMats.find((mat) => mat.design_key === key)?.quantity ?? 0;
    return Math.max(0, (pendingByDesign[key.replaceAll("_", "-")] ?? 0) - finished) > plan[key];
  }) : [];

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (total !== 40) { setMessage("The four designs must total exactly 40 mats."); return; }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/production-plan", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_date: date, scheduled_time: time, ...mix }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the plan.");
      setPlan(data.plan);
      setEditing(false);
      setMessage("Production plan saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the plan.");
    } finally { setSaving(false); }
  };

  return (
    <section className="production-plan panel" id="production-plan" aria-labelledby="production-plan-title">
      <div className="production-plan-intro">
        <span className="production-plan-icon"><Factory size={25} /></span>
        <div>
          <p className="eyebrow">NEXT 40 MAT BATCH</p>
          <h2 id="production-plan-title">Production schedule</h2>
          <p>Four designs · one 40 mat run · Detroit time</p>
        </div>
        {isAdmin && <button type="button" className="plan-edit-button" onClick={() => setEditing((value) => !value)}>
          {editing ? "Close editor" : plan ? "Edit schedule" : "Schedule run"}
        </button>}
      </div>

      <div className="production-plan-content">
        <div className="run-date-card">
          <span className="run-date-label">{loading ? "LOADING SCHEDULE" : isPast ? "NEEDS RESCHEDULING" : plan ? "NEXT SCHEDULED RUN" : "NOT YET SCHEDULED"}</span>
          <strong>{plan ? prettyDate(plan.scheduled_date) : "No run scheduled"}</strong>
          <p><Clock3 size={17} /> {plan ? `${prettyTime(plan.scheduled_time)} Detroit time` : "Monday · Wednesday · Friday"}</p>
          {!plan && !loading && <small>Next eligible day: {prettyDate(nextRunDate())}. An admin must confirm the date and 40 mat mix.</small>}
          {plan && <small>Updated {new Date(plan.updated_at).toLocaleDateString("en-US", { timeZone: "America/Detroit" })}</small>}
        </div>
        <div className="run-mix-card">
          <div className="run-mix-heading"><span>Batch breakdown</span><strong>{plan ? "40 / 40" : "Awaiting schedule"}</strong></div>
          {plan ? <>
            <div className="run-mix-bar" role="img" aria-label={designs.map(({ key, label }) => `${label}: ${plan[key]} mats`).join(", ")}>
              {designs.map(({ key, tone }) => <span key={key} className={tone} style={{ width: `${plan[key] / 40 * 100}%` }} />)}
            </div>
            <div className="run-mix-list">{designs.map(({ key, label, tone }) => <div key={key}><i className={tone} /><span>{label}</span><strong>{plan[key]}</strong></div>)}</div>
          </> : <p className="run-empty">Once the admin saves a date and mix, the full 40 mat plan will appear here for everyone.</p>}
        </div>
      </div>

      {plan && blankMats < 40 && <p className="plan-warning"><AlertTriangle size={17} /> {40 - blankMats} more blank mats are needed for this run. The plan does not reserve inventory.</p>}
      {plan && shortages.length > 0 && <p className="plan-warning"><AlertTriangle size={17} /> Pending demand exceeds this batch mix for {shortages.map((item) => item.label).join(", ")}. Review the quantities before production.</p>}
      {isPast && <p className="plan-warning"><CalendarDays size={17} /> This scheduled date has passed. Set the next run before sharing it as the upcoming batch.</p>}

      {isAdmin && editing && <form className="production-plan-form" onSubmit={save}>
        <div className="plan-date-fields"><label>Run date <input type="date" required min={detroitToday()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>Start time · Detroit <input type="time" required value={time} onChange={(event) => setTime(event.target.value)} /></label></div>
        <div className="plan-quantity-fields">{designs.map(({ key, label }) => <label key={key}>{label}<input type="number" min="0" max="40" step="1" required value={mix[key]} onChange={(event) => setMix({ ...mix, [key]: Number(event.target.value) })} /></label>)}</div>
        <div className="plan-form-footer"><span className={total === 40 ? "complete" : "incomplete"}>{total} / 40 mats planned</span><button type="submit" disabled={saving || total !== 40}><Save size={16} /> {saving ? "Saving…" : "Save production run"}</button></div>
      </form>}
      {message && <p className="plan-feedback" role="status">{message}</p>}
    </section>
  );
}
