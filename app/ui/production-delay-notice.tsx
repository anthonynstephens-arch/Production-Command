"use client";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
type Notice = {run_id:string;scheduled_date:string;reason:string;replacement_date:string};
const formatDate = (date:string, offset=0) => { const value=new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate()+offset); return new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric",timeZone:"UTC"}).format(value); };
export default function ProductionDelayNotice({isAdmin}:{isAdmin:boolean}) {
 const [notice,setNotice]=useState<Notice|null>(null); const [error,setError]=useState("");
 useEffect(()=>{ let live=true; const load=async()=>{ try {const response=await fetch("/api/production-cancellation",{cache:"no-store"}); if(!response.ok) throw new Error(); const data=await response.json(); if(live) {setNotice(data.notice);setError("");}} catch {if(live)setError("Production delay information is unavailable.");}}; void load(); const timer=window.setInterval(load,10000); window.addEventListener("marsh-production-changed",load); return ()=>{live=false;clearInterval(timer);window.removeEventListener("marsh-production-changed",load)};},[]);
 const clear=async()=>{const response=await fetch("/api/production-cancellation",{method:"DELETE"}); if(response.ok){setNotice(null);window.dispatchEvent(new Event("marsh-production-changed"));} else setError("Could not clear the notice.");};
 if (!notice) return error?<p role="alert">{error}</p>:null;
 return <section role="alert" className="production-delay-notice"><AlertTriangle size={24} aria-hidden="true"/><div><h2>Production run cancelled — order delays</h2><p>The {formatDate(notice.scheduled_date)} production run was cancelled. <strong>Reason:</strong> {notice.reason}</p><p>The next run is scheduled for <strong>{formatDate(notice.replacement_date)}</strong>. Orders that cannot be filled from available stock will be delayed until <strong>{formatDate(notice.replacement_date,2)}</strong>.</p>{isAdmin&&<button type="button" onClick={()=>void clear()}>Clear notice</button>}{error&&<p>{error}</p>}</div></section>;
}
