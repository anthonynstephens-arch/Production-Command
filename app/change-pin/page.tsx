import Image from "next/image";
import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/auth";
import ChangePinForm from "./change-pin-form";

export default async function ChangePinPage() {
  const session = await getPortalSession();
  if (!session) redirect("/login");
  if (!session.mustChangePin) redirect("/");
  return <main className="login-page"><section className="login-brand"><Image src="/marsh-supply-logo.png" alt="Marsh Supply" width={330} height={220} priority/><p>ACCOUNT SECURITY</p><h1>Welcome, {session.name}.</h1><span>Create a private replacement PIN before opening the portal.</span></section><ChangePinForm/></main>;
}
