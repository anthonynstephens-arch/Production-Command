"use client";
import { useEffect, useState } from "react";
import { Users } from "lucide-react";

type PortalUser = { id: string; display_name: string; last_login: string | null; timeZone: string; location: string };

function timeAgo(timestamp: string, now: number) {
  const elapsed = Math.max(0, now - new Date(timestamp).getTime());
  if (!Number.isFinite(elapsed)) return "Unknown";
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (elapsed <= 72 * 60 * 60 * 1000) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

export default function PortalAccess() {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      setNow(Date.now());
      try {
        const response = await fetch("/api/portal-access", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load portal access.");
        if (!stopped) { setUsers(data.users); setError(""); }
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : "Could not load portal access.");
      } finally {
        if (!stopped) { setLoading(false); timer = setTimeout(load, 60000); }
      }
    }
    void load();
    return () => { stopped = true; clearTimeout(timer); };
  }, []);
  return <section className="panel portal-access-panel" aria-labelledby="portal-access-title">
    <div className="access-heading"><div className="icon-box"><Users size={20}/></div><div><h2 id="portal-access-title">Portal access granted to</h2><p>Last login activity.</p></div></div>
    {error && <p role="alert">{error}</p>}
    {loading ? <p>Loading portal access…</p> : <div className="portal-access-grid">{users.map(user => <article className="portal-access-person" key={user.id}>
      <div className="portal-access-identity"><strong>{user.display_name}</strong><span className="portal-access-location">{user.location}</span></div>
      <div className="portal-access-login"><span className="portal-access-label">Last login</span>
      {user.last_login ? <time dateTime={user.last_login}>{timeAgo(user.last_login, now)}</time> : <span>Not signed in yet</span>}</div>
    </article>)}</div>}
  </section>;
}
