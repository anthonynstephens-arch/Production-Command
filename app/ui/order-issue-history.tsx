"use client";

import { useEffect, useState } from "react";

type Event = { id: string; event_type: "flagged" | "resolved"; reason: string; note: string | null; actor_name: string | null; occurred_at: string };

export default function OrderIssueHistory({ orderId, version }: { orderId: string; version: number }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/order-issues?historyOrderId=${encodeURIComponent(orderId)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load issue history.");
        setEvents(data.history ?? []);
      })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [orderId, version, retry]);
  return <section className="order-issue-history" aria-label="Issue history">
    <h3>Issue history</h3>
    {loading ? <p role="status">Loading issue history…</p> : error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p> : events.length ? <ol>
      {events.map(event => <li key={event.id} className={event.event_type}>
        <div><strong>{event.event_type === "resolved" ? "Resolved" : "Flagged"}</strong> by {event.actor_name || "Unknown (older record)"}</div>
        <time dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString("en-US", { timeZone: "America/Detroit", dateStyle: "medium", timeStyle: "short" })} (Detroit time)</time>
        <p>{event.reason}</p>{event.note && <p className="issue-history-note">{event.note}</p>}
      </li>)}
    </ol> : <p>No issues have been recorded for this order.</p>}
  </section>;
}
