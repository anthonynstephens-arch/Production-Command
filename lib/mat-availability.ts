import type { PortalOrder } from "./shipstation";

export function designKey(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("did you call")) return "did-you-call-first";
  if (normalized.includes("upside down") || normalized.includes("upside-down")) return "upside-down-welcome";
  if (normalized.includes("whatupdoe") || normalized.includes("what up doe")) return "whatupdoe";
  if (normalized.includes("marsh supply") || normalized.includes("marsh")) return "marsh-supply";
  return null;
}

const designNames: Record<string, string> = {
  whatupdoe: "Whatupdoe",
  "did-you-call-first": "Did You Call First?",
  "upside-down-welcome": "Upside Down Welcome",
  "marsh-supply": "Marsh Supply",
};

// Reserve stock oldest order first. Each mat can cover only one pending unit.
// Printed stock must match the design; blanks cover the remaining print demand.
export function getMatAvailability(
  orders: PortalOrder[],
  blankMats: number,
  finishedMats: Array<{ design_key: string; quantity: number }>,
) {
  const printed = new Map(finishedMats.map((mat) => [mat.design_key, Math.max(0, mat.quantity)]));
  let blanks = Math.max(0, blankMats);
  let blankDemand = 0;
  const blockedOrderIds = new Set<string>();
  const shortages = new Map<string, number>();
  const pending = orders.filter((order) => order.status === "pending").sort((a, b) =>
    (Date.parse(a.orderDate) || 0) - (Date.parse(b.orderDate) || 0) || a.id.localeCompare(b.id),
  );
  for (const order of pending) {
    const lines = order.items?.length ? order.items : [{ name: order.item, quantity: order.quantity }];
    for (const item of lines) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0 || /discount|coupon|shipping|tax|gift card/i.test(item.name)) continue;
      const key = designKey(item.name);
      const ready = key ? printed.get(key) ?? 0 : 0;
      const fromPrinted = Math.min(ready, item.quantity);
      if (key) printed.set(key, ready - fromPrinted);
      const toPrint = item.quantity - fromPrinted;
      blankDemand += toPrint;
      const fromBlanks = Math.min(blanks, toPrint);
      blanks -= fromBlanks;
      const missing = toPrint - fromBlanks;
      if (missing > 0) {
        blockedOrderIds.add(order.id);
        const label = key ? designNames[key] : item.name;
        shortages.set(label, (shortages.get(label) ?? 0) + missing);
      }
    }
  }
  return {
    blockedOrderIds,
    blankDemand,
    availableBlanks: blanks,
    missingMats: [...shortages.values()].reduce((sum, count) => sum + count, 0),
    shortages: [...shortages].map(([name, quantity]) => ({ name, quantity })),
  };
}
