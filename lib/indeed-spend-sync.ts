import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { indeedCampaigns, indeedSpendLog } from "@/db/schema";
import { amsterdamToday } from "@/lib/dates";

/**
 * Indeed spend is entered by hand (no API), so without this an active
 * campaign's spend silently drops to €0 on any day nobody re-types the same
 * number. Instead, once a day has a real entry, carry that amount forward
 * automatically every day the campaign stays active -- a paused campaign
 * simply stops getting new days, which is the "until I pause it" behaviour
 * the daily figure is supposed to have. A day with its own explicit entry
 * (the user typed a different amount for that day) is never overwritten.
 */
export async function syncIndeedDailyCarryForward(): Promise<void> {
  const db = await getDb();
  const today = amsterdamToday();
  const active = await db.select().from(indeedCampaigns).where(eq(indeedCampaigns.status, "active"));

  for (const campaign of active) {
    const [existingToday] = await db
      .select({ date: indeedSpendLog.date })
      .from(indeedSpendLog)
      .where(and(eq(indeedSpendLog.campaignId, campaign.id), eq(indeedSpendLog.date, today)))
      .limit(1);
    if (existingToday) continue;

    const [lastEntry] = await db
      .select({ amountCents: indeedSpendLog.amountCents })
      .from(indeedSpendLog)
      .where(eq(indeedSpendLog.campaignId, campaign.id))
      .orderBy(desc(indeedSpendLog.date))
      .limit(1);
    if (!lastEntry) continue;

    await db.insert(indeedSpendLog).values({
      campaignId: campaign.id,
      date: today,
      amountCents: lastEntry.amountCents,
      updatedAt: new Date().toISOString(),
    });
  }
}
