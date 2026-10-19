import type { PortalOrder } from "./shipstation";

const DAY = 86400000;
type TimingSample = { days: number | null; count: number };

/** Elapsed calendar days per order, excluding missing, future or reversed milestones. */
export function fulfillmentTiming(orders: PortalOrder[], now: number) {
  const fulfillment: number[] = [];
  const delivery: number[] = [];
  const transit: number[] = [];
  const pending: number[] = [];
  const elapsed = (start: number, end: number) =>
    Number.isFinite(start) && Number.isFinite(end) && start <= end && end <= now
      ? (end - start) / DAY : null;
  for (const order of orders) {
    const ordered = Date.parse(order.orderDate);
    if (!Number.isFinite(ordered) || ordered > now) continue;
    if (order.status === "pending") {
      pending.push((now - ordered) / DAY);
      continue;
    }
    const shipped = Date.parse(order.shipDate ?? "");
    const shipDays = elapsed(ordered, shipped);
    if (shipDays !== null) fulfillment.push(shipDays);
    if (order.status !== "delivered") continue;
    // Never substitute an ETA, last scan or sync timestamp for actual delivery.
    const delivered = Date.parse(order.tracking?.deliveredAt ?? "");
    const deliveryDays = elapsed(ordered, delivered);
    if (deliveryDays !== null && (!Number.isFinite(shipped) || shipped <= delivered)) {
      delivery.push(deliveryDays);
      const transitDays = elapsed(shipped, delivered);
      if (shipDays !== null && transitDays !== null) transit.push(transitDays);
    }
  }
  const average = (samples: number[]): TimingSample => ({
    days: samples.length ? samples.reduce((total, days) => total + days, 0) / samples.length : null,
    count: samples.length,
  });
  return {
    fulfillment: average(fulfillment), delivery: average(delivery),
    transit: average(transit), pending: average(pending),
    oldestPending: pending.length ? Math.max(...pending) : null,
  };
}
