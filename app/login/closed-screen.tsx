"use client";
import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import LoginForm from "./login-form";

export default function ClosedScreen() {
  const [open, setOpen] = useState(false);
  return <>
    <section className="pin-card portal-closed">
      <span className="portal-closed-label">Marsh Supply</span>
      <h2>Portal closed</h2>
      <p>The Marsh Supply fulfillment portal is closed. Please contact Detroit Decal &amp; Apparel with any questions.</p>
    </section>
    {open && <LoginForm />}
    <button type="button" className="portal-lock" aria-label="Administrator access" title="Administrator access" onClick={() => setOpen(!open)}><LockKeyhole size={15}/></button>
  </>;
}
