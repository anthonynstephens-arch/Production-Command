import Image from "next/image";
import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/auth";
import LoginForm from "./login-form";

export default async function LoginPage() {
  if (await getPortalSession()) redirect("/");
  return <main className="login-page"><section className="login-brand"><Image src="/marsh-supply-logo.png" alt="Marsh Supply" width={330} height={220} priority/><p>FULFILLMENT PORTAL</p><h1>Inventory and order visibility in one place.</h1><span>Authorized users only</span></section><LoginForm/></main>;
}
