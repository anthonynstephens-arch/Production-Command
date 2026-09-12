"use client";
import { ArrowLeft, Delete, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const add = (digit: number) => { if (pin.length < 8) { setPin(`${pin}${digit}`); setError(""); } };
  async function enter() {
    if (pin.length < 4) return;
    setLoading(true); setError("");
    const response = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) });
    const body = await response.json(); setLoading(false);
    if (!response.ok) { setPin(""); setError(body.error ?? "PIN not accepted."); return; }
    router.push("/"); router.refresh();
  }
  return <section className="pin-card"><div className="pin-icon"><LockKeyhole size={25}/></div><h2>Enter your personal PIN</h2><p>Your PIN identifies your account and access level.</p><div className="pin-dots">{Array.from({length:Math.max(4,pin.length)}).map((_,index)=><i className={index<pin.length?"filled":""} key={index}/>)}</div><div className="keypad">{[1,2,3,4,5,6,7,8,9].map(n=><button type="button" key={n} onClick={()=>add(n)}>{n}</button>)}<button type="button" onClick={()=>setPin("")} aria-label="Clear PIN"><ArrowLeft size={21}/></button><button type="button" onClick={()=>add(0)}>0</button><button type="button" onClick={()=>setPin(pin.slice(0,-1))} aria-label="Delete digit"><Delete size={21}/></button></div><button className="enter-button" onClick={enter} disabled={loading||pin.length<4}>{loading?"Checking…":"Open portal"}</button>{error&&<div className="login-error">{error}</div>}<small>Five incorrect attempts temporarily block additional attempts.</small></section>;
}
