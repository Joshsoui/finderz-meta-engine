import { getDb } from "@/db";
import { accountSpendSummary } from "@/db/schema";
import { fetchAccountSpendSummary } from "@/lib/meta-client";

/**
 * Caches the whole Meta ad account's spend (today / last 7 days / lifetime)
 * so the dashboard can show the complete picture -- including campaigns made
 * directly in Ads Manager, outside this platform -- without hitting Meta on
 * every page load. Called once per 15-minute monitor cycle, same as
 * syncAutomaticDailySpend.
 */
export async function syncAccountSpendSummary(): Promise<void> {
  const db = await getDb();
  const summary = await fetchAccountSpendSummary();
  const now = new Date().toISOString();

  await db
    .insert(accountSpendSummary)
    .values({
      id: "meta",
      todayCents: Math.round(summary.todaySpend * 100),
      last7dCents: Math.round(summary.last7dSpend * 100),
      lifetimeCents: Math.round(summary.lifetimeSpend * 100),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: accountSpendSummary.id,
      set: {
        todayCents: Math.round(summary.todaySpend * 100),
        last7dCents: Math.round(summary.last7dSpend * 100),
        lifetimeCents: Math.round(summary.lifetimeSpend * 100),
        updatedAt: now,
      },
    });
}
