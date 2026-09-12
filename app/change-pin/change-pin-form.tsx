"use client";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ChangePinForm() {
  const router = useRouter();
  const [pin, setPin] = useState(""); const [confirm, setConfirm] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{4,8}$/.test(pin)) return setError("Choose a 4–8 digit PIN.");
    if (pin !== confirm) return setError("The PINs do not match.");
    setLoading(true); setError("");
    const response = await fetch("/api/pins", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({pin}) });
    const body = await response.json(); setLoading(false);
    if (!response.ok) return setError(body.error ?? "Could not change PIN.");
    router.push("/"); router.refresh();
  }
  return <form className="pin-card change-pin-card" onSubmit={save}><div className="pin-icon"><KeyRound size={25}/></div><h2>Replace your temporary PIN</h2><p>Choose 4–8 digits that only you know.</p><div className="email-login"><label>New PIN<input type="password" inputMode="numeric" pattern="[0-9]{4,8}" minLength={4} maxLength={8} value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,""))} required/></label><label>Confirm new PIN<input type="password" inputMode="numeric" pattern="[0-9]{4,8}" minLength={4} maxLength={8} value={confirm} onChange={event=>setConfirm(event.target.value.replace(/\D/g,""))} required/></label></div><button className="enter-button" disabled={loading}>{loading?"Saving…":"Save PIN and continue"}</button>{error&&<div className="login-error">{error}</div>}<small>Your temporary PIN will stop working immediately.</small></form>;
}
