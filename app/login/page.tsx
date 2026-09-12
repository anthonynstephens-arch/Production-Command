import Image from "next/image";
import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/auth";
import LoginForm from "./login-form";

export default async function LoginPage() {
  if (await getPortalSession()) redirect("/");
  return <main className="login-page"><section className="login-brand"><div className="login-brand-lockup"><Image src="/marsh-supply-logo-web.png" alt="Marsh Supply" width={165} height={110} priority unoptimized/><p>FULFILLMENT PORTAL</p></div><h1>Inventory and order visibility in one place.</h1><span>Authorized users only</span></section><LoginForm/><footer className="login-footer">PRODUCTION COMMAND BUILT BY DETROIT DECAL AND APPAREL LLC</footer></main>;
}
