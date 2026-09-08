import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, portfolioSettings } from "@/db/schema";
import { deriveDailyBudgetCents } from "@/lib/campaign-engine";

/** Falls back to the schema default (35000 = €350) if no settings row exists yet. */
export async function getPortfolioMaxDailyBudgetCents(db: Awaited<ReturnType<typeof getDb>>): Promise<number> {
  const [settings] = await db.select().from(portfolioSettings).where(eq(portfolioSettings.id, "global")).limit(1);
  return settings?.maxDailyBudgetCents ?? 35000;
}

/**
 * How much daily budget is left under the portfolio-wide cap, before a given
 * campaign's own share. Only campaigns actually spending on Meta count
 * (live or flagged attention -- both still deliver; paused/draft/completed
 * don't), each valued at what deriveDailyBudgetCents would currently set
 * for it, so this stays consistent with what's actually sent to Meta.
 */
export async function getPortfolioDailyBudgetHeadroomCents(
  db: Awaited<ReturnType<typeof getDb>>,
  excludeCampaignId?: string,
): Promise<{ capCents: number; usedCents: number; headroomCents: number }> {
  const capCents = await getPortfolioMaxDailyBudgetCents(db);

  const active = await db
    .select({ id: campaigns.id, maxBudgetCents: campaigns.maxBudgetCents, campaignDurationDays: campaigns.campaignDurationDays })
    .from(campaigns)
    .where(and(isNotNull(campaigns.metaCampaignId), inArray(campaigns.status, ["live", "attention"]), excludeCampaignId ? ne(campaigns.id, excludeCampaignId) : undefined));

  const usedCents = active.reduce((sum, campaign) => sum + deriveDailyBudgetCents(campaign.maxBudgetCents, campaign.campaignDurationDays), 0);
  return { capCents, usedCents, headroomCents: Math.max(capCents - usedCents, 0) };
}
