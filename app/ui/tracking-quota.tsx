"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Quota = { total: number; used: number; remaining: number; checkedAt: string };

export default function TrackingQuota({ refreshKey }: { refreshKey: string }) {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const load = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/tracking-quota", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load tracking quota.");
      setQuota(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tracking quota.");
    } finally { pending.current = false; setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);
  const low = quota && quota.remaining <= Math.max(10, quota.total * 0.1);
  return <article className="tracking-quota" aria-label="17TRACK account quota">
    <div><p className="eyebrow">17TRACK · ACCOUNT QUOTA</p>
      <strong>{quota ? quota.remaining.toLocaleString() : "—"} <span>trackings remaining</span></strong>
      {quota && <p>{quota.used.toLocaleString()} used · {quota.total.toLocaleString()} total</p>}
      <small>Shared account balance for registering new tracking numbers.</small>
      <p className="tracking-quota-note">Your initial 200 tracking credits are included. Once those credits are used, a payment of <b>$119</b> is required to add <b>5,000 tracking credits</b> and continue tracking new shipments. Each credit covers one new tracking number; shipments already registered continue to receive tracking updates.</p>
      {quota && <small>Checked {new Date(quota.checkedAt).toLocaleString("en-US", { timeZone: "America/Detroit" })} ET{error ? " · Last known balance" : ""}</small>}
      {low && <p className="sync-error">{quota.remaining === 0 ? "Quota exhausted. New tracking numbers cannot be registered." : "Tracking quota is running low."}</p>}
      {error && <p className="sync-error" role="status">{error}</p>}
    </div>
    <button className="view-toggle" type="button" onClick={() => void load()} disabled={busy}>{busy ? "Checking…" : "Refresh quota"}</button>
  </article>;
}
