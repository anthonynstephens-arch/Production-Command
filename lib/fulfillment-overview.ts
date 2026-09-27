import type { PortalOrder } from './shipstation';

export function awaitingMatTotal(orders: PortalOrder[], inProduction: number) {
  const quantities = orders.filter(order => order.status === 'pending').map(order => order.quantity).sort((a, b) => a - b);
  const count = Math.max(0, quantities.length - Math.max(0, Math.trunc(inProduction)));
  const min = quantities.slice(0, count).reduce((sum, n) => sum + n, 0);
  const max = count ? quantities.slice(-count).reduce((sum, n) => sum + n, 0) : 0;
  return { count, min, max, label: min === max ? `${min} ${min === 1 ? 'mat' : 'mats'} total` : `${min}–${max} mats (range)` };
}

export type RecentIssueEvent = { order_id: string; order_number: string; event_type: "flagged" | "resolved"; reason: string; note: string | null; actor_name: string | null; occurred_at: string };

type OverviewInput = {
  recentIssueEvents?: RecentIssueEvent[] | null;
  orders: PortalOrder[];
  inProduction: number;
  issueCount: number;
  blockedCount: number;
  supplies: { mats: number; boxes: number; thankYouCards: number; polyBags: number; tape: number; ink: number };
  lowSupplies: string[];
  balance: number;
  now?: number;
};

export function fulfillmentOverview(input: OverviewInput) {
  const { orders, supplies, lowSupplies } = input;
  const since = (input.now ?? Date.now()) - 86400000;
  const shippedRecently = orders.filter(order => order.status !== 'pending' && Date.parse(order.shipDate ?? '') >= since).length;
  const shipped = orders.filter(order => order.status === 'shipped').length;
  const delivered = orders.filter(order => order.status === 'delivered').length;
  const pending = orders.filter(order => order.status === 'pending');
  const awaiting = awaitingMatTotal(orders, input.inProduction);
  const shipping = `${shippedRecently} orders shipped in the last 24 hours; the current order history shows ${shipped} shipped and awaiting delivery and ${delivered} confirmed delivered.`;
  const production = `${pending.length} orders (${pending.reduce((sum, order) => sum + order.quantity, 0)} mats) remain pending, with ${awaiting.count} awaiting production and ${Math.min(pending.length, Math.max(0, input.inProduction))} in production.`;
  const issues = input.blockedCount ? `${input.blockedCount} pending orders are on hold due to fulfillment issues or unavailable supplies, including ${input.issueCount} with flagged issues.` : 'No pending orders are currently blocked by flagged issues or unavailable supplies.';
  const inventory = `On hand: ${supplies.mats} blank mats, ${supplies.boxes} boxes, ${supplies.thankYouCards} thank-you cards, ${supplies.polyBags} poly bags, ${supplies.tape} rolls of tape, and ${supplies.ink}% ink${lowSupplies.length ? `; replenish ${lowSupplies.join(', ')}` : '; no supply shortages are currently identified'}.`;
  const payment = input.balance > 0 ? ` The outstanding balance is ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(input.balance)}.` : '';
  const latest = new Map<string, RecentIssueEvent>();
  for (const event of [...(input.recentIssueEvents ?? [])].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))) {
    if (Date.parse(event.occurred_at) >= (input.now ?? Date.now()) - 7 * 86400000 && !latest.has(event.order_id)) latest.set(event.order_id, event);
  }
  const recent = [...latest.values()].slice(0, 5).map(event => {
    const when = new Date(event.occurred_at).toLocaleString('en-US', { timeZone: 'America/Detroit', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const reason = `${event.reason}${event.note ? ` — ${event.note}` : ''}`;
    return event.event_type === 'resolved'
      ? `Order ${event.order_number}: ${reason}; resolved by ${event.actor_name || 'an unrecorded user'} on ${when} (Detroit time).`
      : `Order ${event.order_number}: flagged for ${reason} by ${event.actor_name || 'an unrecorded user'} on ${when} (Detroit time); unresolved.`;
  });
  const activity = input.recentIssueEvents === null ? 'Recent issue activity is temporarily unavailable.' : recent.length ? `Recent issue activity (last 7 days): ${recent.join(' ')}${latest.size > 5 ? ` Plus ${latest.size - 5} more orders with recent activity; see the fulfillment queue for history.` : ''}` : 'No order issues were flagged or resolved in the last 7 days.';
  return [shipping, production, issues, activity, inventory].join(' ') + payment;
}
