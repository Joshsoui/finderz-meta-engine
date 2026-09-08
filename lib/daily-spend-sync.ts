import { desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, dailySpendLog, metricSnapshots } from "@/db/schema";

function amsterdamDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date(iso));
}

/**
 * Computes today's real portfolio-wide spend from Meta and writes it into
 * dailySpendLog automatically -- replaces the manual "type in what Meta Ads
 * Manager shows" habit once a real connection exists. metricSnapshots.spend
 * is a lifetime cumulative total per campaign (see campaign-monitor-sync.ts),
 * so "spent today" for one campaign is that cumulative total minus whatever
 * it already stood at before today started; summed across every campaign
 * that has ever gone live on Meta, not just the ones currently live (a
 * campaign paused earlier today still spent money today).
 */
export async function syncAutomaticDailySpend(): Promise<void> {
  const db = await getDb();
  const today = amsterdamDate(new Date().toISOString());
  const metaCampaigns = await db.select().from(campaigns).where(isNotNull(campaigns.metaCampaignId));
  if (metaCampaigns.length === 0) return;

  let totalTodayCents = 0;
  for (const campaign of metaCampaigns) {
    const recent = await db
      .select({ spendCents: metricSnapshots.spendCents, recordedAt: metricSnapshots.recordedAt })
      .from(metricSnapshots)
      .where(eq(metricSnapshots.campaignId, campaign.id))
      .orderBy(desc(metricSnapshots.recordedAt))
      .limit(200);
    if (recent.length === 0) continue;

    const latestSpendCents = recent[0].spendCents;
    const baselineRow = recent.find((row) => amsterdamDate(row.recordedAt) !== today);
    // No snapshot from before today yet (e.g. the campaign was just imported or
    // just went live) -- we can't tell how much of its lifetime total is
    // "today's" portion, so skip it rather than counting the whole lifetime
    // spend as today's. It starts contributing once a prior-day snapshot exists.
    if (!baselineRow) continue;
    totalTodayCents += Math.max(latestSpendCents - baselineRow.spendCents, 0);
  }

  const now = new Date().toISOString();
  await db
    .insert(dailySpendLog)
    .values({ date: today, amountCents: totalTodayCents, updatedAt: now })
    .onConflictDoUpdate({ target: dailySpendLog.date, set: { amountCents: totalTodayCents, updatedAt: now } });
}
