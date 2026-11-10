"use client";
import { ArrowLeft, Delete } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export default function LoginForm() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"pin"|"email">("pin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const busy = useRef(false);
  const attempted = useRef("");
  const ready = mode === "pin" ? pin.length >= 4 : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && password.length >= 8;
  const enter = useCallback(async () => {
    if (!ready || busy.current) return;
    busy.current = true; setLoading(true); setError("");
    try {
      const response = await fetch("/api/session", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(mode === "pin" ? {mode,pin} : {mode,email,password}) });
      const body = await response.json();
      if (!response.ok) { setPin(""); setError(body.error ?? "Sign-in not accepted."); return; }
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      router.replace(body.mustChangePin ? "/change-pin" : next.startsWith("/?") ? next : "/"); router.refresh();
    } catch { setError("Unable to connect. Please try again."); }
    finally { busy.current = false; setLoading(false); }
  }, [ready, mode, pin, email, password, router]);
  useEffect(() => {
    if (!ready || loading) return;
    const key = JSON.stringify([mode,pin,email,password]);
    if (attempted.current === key) return;
    const timer = window.setTimeout(()=>{attempted.current=key;void enter();},1000);
    return ()=>window.clearTimeout(timer);
  }, [ready,loading,mode,pin,email,password,enter]);
  return <section className="pin-card"><h2>Sign in</h2>
    <div className="login-tabs"><button className={mode==="pin"?"active":""} onClick={()=>{setMode("pin");setError("");}}>Personal PIN</button><button className={mode==="email"?"active":""} onClick={()=>{setMode("email");setError("");}}>Email</button></div>
    {mode==="pin"?<><div className="pin-dots" aria-label={`${pin.length} PIN digits entered`}>{Array.from({length:Math.max(4,pin.length)}).map((_,index)=><i className={index<pin.length?"filled":""} key={index}/>)}</div><div className="keypad">{[1,2,3,4,5,6,7,8,9].map(n=><button type="button" key={n} onClick={()=>{if(pin.length<8){setPin(pin+n);setError("");}}}>{n}</button>)}<button type="button" onClick={()=>setPin("")} aria-label="Clear PIN"><ArrowLeft size={21}/></button><button type="button" onClick={()=>{if(pin.length<8)setPin(pin+"0");}}>0</button><button type="button" onClick={()=>setPin(pin.slice(0,-1))} aria-label="Delete digit"><Delete size={21}/></button></div></>:<form className="email-login" onSubmit={event=>{event.preventDefault();void enter();}}><label>Email address<input type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="username" required/></label><label>Password<input type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" minLength={8} required/></label></form>}
    <button className="enter-button" onClick={()=>void enter()} disabled={loading||!ready}>{loading?"Checking…":"Open portal"}</button>
    {error&&<div className="login-error" role="alert">{error}</div>}
    <small>Continues automatically when you finish typing.</small>
  </section>;
}
