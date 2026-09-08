import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, optimizationActions } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";
import { deriveDailyBudgetCents } from "@/lib/campaign-engine";
import { getMetaCredentials, updateMetaCampaignBudget } from "@/lib/meta-client";
import { getPortfolioDailyBudgetHeadroomCents } from "@/lib/portfolio-budget";

/**
 * Applies a pending suggestion that a human has approved. Only budget-scale
 * suggestions reach here today (pause/refresh actions apply immediately in
 * campaign-monitor-sync.ts -- see BUDGET_SCALE_COOLDOWN_HOURS and the
 * approval-gating note there for why).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actionId = Number(id);
    if (!Number.isInteger(actionId)) return Response.json({ error: "Invalid action id" }, { status: 400 });

    const db = await getDb();
    const [action] = await db.select().from(optimizationActions).where(eq(optimizationActions.id, actionId)).limit(1);
    if (!action) return Response.json({ error: "Action not found" }, { status: 404 });
    if (action.status !== "pending") return Response.json({ error: "Deze actie is al verwerkt" }, { status: 400 });
    if (!Number.isFinite(action.budgetChangePercent)) return Response.json({ error: "Deze actie heeft geen goedkeuring nodig" }, { status: 400 });

    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, action.campaignId)).limit(1);
    if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });

    const newMaxBudgetCents = Math.round(campaign.maxBudgetCents * (1 + action.budgetChangePercent! / 100));
    const desiredDailyBudgetCents = deriveDailyBudgetCents(newMaxBudgetCents, campaign.campaignDurationDays);
    const currentDailyBudgetCents = deriveDailyBudgetCents(campaign.maxBudgetCents, campaign.campaignDurationDays);

    const { headroomCents } = await getPortfolioDailyBudgetHeadroomCents(db, campaign.id);
    // Never send Meta a lower daily_budget than the campaign already has,
    // even if the portfolio is fully booked -- headroom excludes this
    // campaign's own current share, so it should already cover at least that.
    const actualDailyBudgetCents = Math.max(Math.min(desiredDailyBudgetCents, headroomCents), currentDailyBudgetCents);
    const cappedByPortfolioLimit = actualDailyBudgetCents < desiredDailyBudgetCents;

    const now = new Date().toISOString();
    const credentials = getMetaCredentials();
    if (credentials && campaign.metaCampaignId) {
      await updateMetaCampaignBudget(campaign.metaCampaignId, actualDailyBudgetCents);
    }

    await db.update(campaigns).set({ maxBudgetCents: newMaxBudgetCents, budgetScaledAt: now, updatedAt: now }).where(eq(campaigns.id, campaign.id));
    const [updatedAction] = await db
      .update(optimizationActions)
      .set({ status: "applied", appliedAt: now })
      .where(eq(optimizationActions.id, actionId))
      .returning();

    return Response.json({ action: updatedAction, cappedByPortfolioLimit, actualDailyBudgetCents });
  } catch (error) {
    return errorResponse(error, "Action could not be approved");
  }
}
