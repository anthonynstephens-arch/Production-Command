import { getSupabaseAdmin } from './supabase-admin';
import type { RecentIssueEvent } from './fulfillment-overview';

export async function getRecentOrderIssues(): Promise<RecentIssueEvent[] | null> {
  const events: RecentIssueEvent[] = [];
  const db = getSupabaseAdmin();
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('marsh_order_issue_history')
      .select('order_id,order_number,event_type,reason,note,actor_name,occurred_at')
      .eq('account_slug', 'marsh-supply').gte('occurred_at', since)
      .order('occurred_at', { ascending: false }).order('id').range(offset, offset + 999);
    if (error) return null;
    events.push(...(data ?? []) as RecentIssueEvent[]);
    if ((data?.length ?? 0) < 1000) return events;
  }
}
