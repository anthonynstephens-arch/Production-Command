"use client";
import { useCallback, useEffect, useRef, useState } from "react";
type Notice = { revision: string; title: string; message: string; enabled: boolean; updated_at: string };
export default function PortalNotice({ isAdmin, showEditor }: { isAdmin: boolean; showEditor: boolean }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [checked, setChecked] = useState(false);
  const [draft, setDraft] = useState({ title: "", message: "", enabled: false });
  const [expectedRevision, setExpectedRevision] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const dirty = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const apply = useCallback((data: { notice: Notice | null; acknowledged: boolean }, reset = false) => {
    setNotice(data.notice); setAcknowledged(data.acknowledged); setLoaded(true);
    if (!dirty.current || reset) {
      setDraft({ title: data.notice?.title || "", message: data.notice?.message || "", enabled: data.notice?.enabled || false });
      setExpectedRevision(data.notice?.revision || null); dirty.current = false;
    }
  }, []);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/portal-notice", { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      apply(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load portal notice."); }
  }, [apply]);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 60000); const focus = () => void load(); window.addEventListener("focus", focus); return () => { clearInterval(timer); window.removeEventListener("focus", focus); }; }, [load]);
  const pending = !!notice?.enabled && !acknowledged;
  useEffect(() => { setChecked(false); }, [notice?.revision]);
  useEffect(() => {
    const el = dialog.current; if (!el) return;
    if (pending && !el.open) el.showModal(); else if (!pending && el.open) el.close();
  }, [pending]);
  async function save() {
    if (busy) return; setBusy(true); setError(""); setFeedback("");
    try {
      const response = await fetch("/api/portal-notice", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, expectedRevision }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      apply(data, true); setFeedback(draft.enabled ? "Popup saved. Each user must acknowledge this version once." : "Popup disabled.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save notice."); } finally { setBusy(false); }
  }
  async function acknowledge() {
    if (!checked || !notice || busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/portal-notice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: notice.revision, acknowledged: true }) });
      const data = await response.json(); if (!response.ok) { if (response.status === 409) await load(); throw new Error(data.error); }
      setAcknowledged(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save acknowledgment."); } finally { setBusy(false); }
  }
  return <>
    {isAdmin && showEditor && <article className="panel portal-notice-editor"><h2>Required acknowledgment popup</h2><p>Set a message users must acknowledge before continuing. Saving an enabled message requests a new acknowledgment from every user.</p><form className="operations-form" onSubmit={e => { e.preventDefault(); void save(); }}>
      <label><span>Popup title</span><input value={draft.title} maxLength={160} required={draft.enabled} onChange={e => { dirty.current = true; setDraft({ ...draft, title: e.target.value }); }}/></label>
      <label><span>Message</span><textarea rows={5} value={draft.message} maxLength={5000} required={draft.enabled} onChange={e => { dirty.current = true; setDraft({ ...draft, message: e.target.value }); }}/></label>
      <label className="portal-notice-check"><input type="checkbox" checked={draft.enabled} onChange={e => { dirty.current = true; setDraft({ ...draft, enabled: e.target.checked }); }}/>Enable required popup</label>
      <div className="portal-notice-actions"><button className="sync-button" disabled={!loaded || busy} type="submit">{busy ? "Saving…" : "Save popup"}</button><button type="button" disabled={busy} onClick={() => { dirty.current = false; void load(); }}>Reload saved notice</button></div>
    </form>{feedback && <p role="status">{feedback}</p>}{error && <p role="alert">{error}</p>}</article>}
    <dialog ref={dialog} className="portal-required-notice" aria-labelledby="portal-notice-title" aria-describedby="portal-notice-message" onCancel={e => e.preventDefault()}>
      <p className="eyebrow">ACKNOWLEDGMENT REQUIRED</p><h2 id="portal-notice-title">{notice?.title}</h2><p id="portal-notice-message" className="portal-notice-message">{notice?.message}</p>
      <label className="portal-notice-check"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}/>I have read and acknowledge this message.</label>
      {error && <p role="alert">{error}</p>}<button className="sync-button" type="button" disabled={!checked || busy} onClick={() => void acknowledge()}>{busy ? "Saving…" : "Acknowledge and continue"}</button>
    </dialog>
  </>;
}
