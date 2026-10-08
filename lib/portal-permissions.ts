import type { PortalSession } from "./auth";

// Anthony's verified portal account ID. Display names and admin roles alone
// must not grant these owner-only actions.
const ANTHONY_USER_ID = "faee73b9-e4ff-458d-97cf-114a8a11ea45";

export function isAnthony(session: Pick<PortalSession, "userId" | "role" | "mustChangePin"> | null) {
  return session?.userId === ANTHONY_USER_ID && session.role === "admin" && !session.mustChangePin;
}
