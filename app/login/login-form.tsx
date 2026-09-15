"use client";
import { ArrowLeft, Delete, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"pin"|"email">("pin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const add = (digit: number) => { if (pin.length < 8) { setPin(`${pin}${digit}`); setError(""); } };
  async function enter() {
    if (mode === "pin" && pin.length < 4) return;
    setLoading(true); setError("");
    const response = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mode === "pin" ? { mode, pin } : { mode, email, password }) });
    const body = await response.json(); setLoading(false);
    if (!response.ok) { setPin(""); setError(body.error ?? "PIN not accepted."); return; }
    const next=new URLSearchParams(window.location.search).get("next") || "/";
    router.push(body.mustChangePin ? "/change-pin" : next.startsWith("/?") ? next : "/"); router.refresh();
  }
  return <section className="pin-card"><div className="pin-icon"><LockKeyhole size={25}/></div><h2>Sign in to your account</h2><p>Use your personal PIN or assigned email login.</p><div className="login-tabs"><button className={mode==="pin"?"active":""} onClick={()=>setMode("pin")}>Personal PIN</button><button className={mode==="email"?"active":""} onClick={()=>setMode("email")}>Email</button></div>{mode==="pin"?<><div className="pin-dots">{Array.from({length:Math.max(4,pin.length)}).map((_,index)=><i className={index<pin.length?"filled":""} key={index}/>)}</div><div className="keypad">{[1,2,3,4,5,6,7,8,9].map(n=><button type="button" key={n} onClick={()=>add(n)}>{n}</button>)}<button type="button" onClick={()=>setPin("")} aria-label="Clear PIN"><ArrowLeft size={21}/></button><button type="button" onClick={()=>add(0)}>0</button><button type="button" onClick={()=>setPin(pin.slice(0,-1))} aria-label="Delete digit"><Delete size={21}/></button></div></>:<form className="email-login" onSubmit={(event)=>{event.preventDefault();enter()}}><label>Email address<input type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email" required/></label><label>Password<input type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" minLength={8} required/></label></form>}<button className="enter-button" onClick={enter} disabled={loading||(mode==="pin"?pin.length<4:!email||password.length<8)}>{loading?"Checking…":"Open portal"}</button>{error&&<div className="login-error">{error}</div>}<small>Five incorrect attempts temporarily block additional attempts.</small></section>;
}
