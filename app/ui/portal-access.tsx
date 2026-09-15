"use client";
import { useEffect, useState } from "react";
import { Users } from "lucide-react";

type PortalUser = { id: string; display_name: string; last_login: string | null; timeZone: string; location: string };

export default function PortalAccess() {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
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
    <div className="access-heading"><div className="icon-box"><Users size={20}/></div><div><h2 id="portal-access-title">Portal access granted to</h2><p>Last login shown in each person’s local time.</p></div></div>
    {error && <p role="alert">{error}</p>}
    {loading ? <p>Loading portal access…</p> : <div className="portal-access-grid">{users.map(user => <article className="portal-access-person" key={user.id}>
      <strong>{user.display_name}</strong><span className="portal-access-location">{user.location}</span>
      <span className="portal-access-label">Last login</span>
      {user.last_login ? <time dateTime={user.last_login}>{new Intl.DateTimeFormat("en-US", { timeZone: user.timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(user.last_login))}</time> : <span>Not signed in yet</span>}
    </article>)}</div>}
  </section>;
}
