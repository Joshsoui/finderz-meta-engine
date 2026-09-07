import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, metricSnapshots, optimizationActions } from "@/db/schema";
import { evaluateCampaign } from "@/lib/campaign-engine";

export async function runCampaignMonitor(): Promise<{ evaluated: number; actionsApplied: number }> {
  const db = await getDb();
  const liveCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, "live"));

  let actionsApplied = 0;

  for (const campaign of liveCampaigns) {
    const [snapshot] = await db
      .select()
      .from(metricSnapshots)
      .where(eq(metricSnapshots.campaignId, campaign.id))
      .orderBy(desc(metricSnapshots.recordedAt))
      .limit(1);

    // No metrics recorded yet for this campaign (no Meta polling wired up) — nothing to evaluate.
    if (!snapshot) continue;

    const decision = evaluateCampaign({
      spend: snapshot.spendCents / 100,
      impressions: snapshot.impressions,
      clicks: snapshot.clicks,
      leads: snapshot.leads,
      frequency: snapshot.frequencyHundredths / 100,
      targetCpl: campaign.targetCplCents / 100,
      maxBudget: campaign.maxBudgetCents / 100,
      qualityLeads: campaign.qualityLeads,
    });

    const now = new Date().toISOString();
    const campaignUpdate: Partial<typeof campaigns.$inferInsert> = {
      spentCents: snapshot.spendCents,
      updatedAt: now,
    };

    if (decision.action === "pause") {
      campaignUpdate.status = "paused";
    } else if (decision.action === "refresh_creative") {
      campaignUpdate.status = "attention";
    } else if (decision.action === "scale_budget") {
      campaignUpdate.maxBudgetCents = Math.round(campaign.maxBudgetCents * (1 + decision.budgetChangePercent / 100));
    }

    await db.update(campaigns).set(campaignUpdate).where(eq(campaigns.id, campaign.id));

    if (decision.rule !== "learning") {
      await db.insert(optimizationActions).values({
        campaignId: campaign.id,
        rule: decision.rule,
        severity: decision.severity,
        recommendation: decision.recommendation,
        status: "applied",
        createdAt: now,
        appliedAt: now,
      });
      actionsApplied += 1;
    }
  }

  return { evaluated: liveCampaigns.length, actionsApplied };
}
