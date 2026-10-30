import Image from "next/image";
import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/auth";
import LoginForm from "./login-form";
import "./login.css";

export default async function LoginPage() {
  if (await getPortalSession()) redirect("/");
  return <main className="login-page compact-login"><section className="login-brand"><div className="login-brand-lockup"><Image src="/marsh-supply-logo-web.png" alt="Marsh Supply" width={165} height={110} priority unoptimized/><h1>Fulfillment Portal</h1></div></section><LoginForm/><footer className="login-footer">Detroit Decal &amp; Apparel LLC</footer></main>;
}
