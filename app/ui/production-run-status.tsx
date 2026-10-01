"use client";
import { useEffect, useState } from "react";
import { CalendarDays, Factory, CircleCheck, Clock3 } from "lucide-react";
import { countdownText, dryingSeconds, stageAt, stageLabels, type Plan } from "@/lib/production-run";

export function useRunClock(plan: Plan | null) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const offset = plan?.server_now ? Date.parse(plan.server_now) - Date.now() : 0;
    const tick = () => setNow(Date.now() + offset);
    tick();
    if (plan?.stage !== "drying") return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [plan?.server_now, plan?.stage]);
  return now;
}
export default function ProductionRunStatus({ plan }: { plan: Plan | null | undefined }) {
  const now = useRunClock(plan ?? null);
  if (plan === undefined) return <span className="summary-copy"><Clock3 size={19}/><strong>Loading production run…</strong></span>;
  if (!plan) return <a className="summary-copy next-run-overview" href="#production-plan"><CalendarDays size={19}/><strong>No production run scheduled</strong></a>;
  const stage = stageAt(plan, now);
  const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(plan.scheduled_date+"T12:00:00Z"));
  const [hour, minute] = plan.scheduled_time.split(":").map(Number);
  const time = `${hour % 12 || 12}:${String(minute).padStart(2,"0")} ${hour >= 12 ? "PM" : "AM"}`;
  const Icon = stage === "completed" ? CircleCheck : stage === "scheduled" ? CalendarDays : Factory;
  return <a className={`summary-copy next-run-overview run-status-${stage}`} href="#production-plan">
    <Icon size={19}/>
    <span><strong>{stage === "scheduled" ? "Next production run" : stageLabels[stage]}</strong>
      <small>{stage === "scheduled" ? `${date} · ${time} Detroit · 40 mats` : stage === "drying" ? `${countdownText(dryingSeconds(plan,now))} remaining · 40 mats` : `${date} · 40 mats`}</small>
    </span>
  </a>;
}
