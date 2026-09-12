import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export type PortalRole = "admin" | "partner";
export type PortalSession = { userId: string; name: string; role: PortalRole; expiresAt: number };
const COOKIE_NAME = "production_command_session";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(session: PortalSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export async function getPortalSession(): Promise<PortalSession | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const [payload, supplied] = token.split(".");
  if (!payload || !supplied) return null;
  const expected = signature(payload);
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as PortalSession;
    return session.expiresAt > Date.now() ? session : null;
  } catch { return null; }
}

export async function setPortalSession(session: Omit<PortalSession, "expiresAt">) {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 12;
  (await cookies()).set(COOKIE_NAME, createSessionToken({ ...session, expiresAt }), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: new Date(expiresAt),
  });
}

export async function clearPortalSession() {
  (await cookies()).set(COOKIE_NAME, "", { httpOnly: true, path: "/", expires: new Date(0) });
}

export function hashPin(pin: string, suppliedSalt?: string) {
  const salt = suppliedSalt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyPin(pin: string, salt: string, storedHash: string) {
  const calculated = hashPin(pin, salt).hash;
  return calculated.length === storedHash.length && timingSafeEqual(Buffer.from(calculated), Buffer.from(storedHash));
}

export { COOKIE_NAME };
