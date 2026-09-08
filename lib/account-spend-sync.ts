import { getDb } from "@/db";
import { accountSpendDailyLog, accountSpendSummary } from "@/db/schema";
import { amsterdamToday } from "@/lib/dates";
import { fetchAccountSpendSummary } from "@/lib/meta-client";

/**
 * Caches the whole Meta ad account's spend (today / last 7 days / lifetime)
 * so the dashboard can show the complete picture -- including campaigns made
 * directly in Ads Manager, outside this platform -- without hitting Meta on
 * every page load. Called once per 15-minute monitor cycle, same as
 * syncAutomaticDailySpend. Also writes today's figure into a permanent
 * per-day log (accountSpendDailyLog) so a spend export can look back further
 * than the 7-day window accountSpendSummary itself holds.
 */
export async function syncAccountSpendSummary(): Promise<void> {
  const db = await getDb();
  const summary = await fetchAccountSpendSummary();
  const now = new Date().toISOString();
  const todayCents = Math.round(summary.todaySpend * 100);

  await db
    .insert(accountSpendSummary)
    .values({
      id: "meta",
      todayCents,
      last7dCents: Math.round(summary.last7dSpend * 100),
      lifetimeCents: Math.round(summary.lifetimeSpend * 100),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: accountSpendSummary.id,
      set: {
        todayCents,
        last7dCents: Math.round(summary.last7dSpend * 100),
        lifetimeCents: Math.round(summary.lifetimeSpend * 100),
        updatedAt: now,
      },
    });

  await db
    .insert(accountSpendDailyLog)
    .values({ date: amsterdamToday(), amountCents: todayCents, updatedAt: now })
    .onConflictDoUpdate({ target: accountSpendDailyLog.date, set: { amountCents: todayCents, updatedAt: now } });
}
