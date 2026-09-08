import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, leads, metricSnapshots, optimizationActions } from "@/db/schema";
import { deriveDailyBudgetCents, evaluateCampaign } from "@/lib/campaign-engine";
import { fetchCampaignInsights, fetchNewLeads, getMetaCredentials, setMetaCampaignStatus, updateMetaCampaignBudget } from "@/lib/meta-client";

export async function runCampaignMonitor(): Promise<{ evaluated: number; actionsApplied: number }> {
  const db = await getDb();
  const liveCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, "live"));
  const credentials = getMetaCredentials();

  let actionsApplied = 0;

  for (const campaign of liveCampaigns) {
    try {
      let snapshot: { spendCents: number; impressions: number; clicks: number; leads: number; frequencyHundredths: number } | undefined;

      if (credentials && campaign.metaCampaignId) {
        // Meta is connected: pull the campaign's cumulative lifetime numbers
        // (not just "today") and record them as a fresh snapshot -- the
        // budget-ceiling rule and the dashboard's spend/profit totals both
        // assume campaigns.spentCents is the running total since launch, and
        // a "today"-scoped fetch would silently reset that total every day.
        const insights = await fetchCampaignInsights(campaign.metaCampaignId, "lifetime");
        const [inserted] = await db
          .insert(metricSnapshots)
          .values({
            campaignId: campaign.id,
            impressions: insights.impressions,
            clicks: insights.clicks,
            leads: insights.leads,
            spendCents: Math.round(insights.spend * 100),
            frequencyHundredths: Math.round(insights.frequency * 100),
            recordedAt: new Date().toISOString(),
          })
          .returning();
        snapshot = inserted;

        if (campaign.metaLeadFormId) {
          // New leads only add rows (never overwrite a quality rating a
          // recruiter already set), so skip duplicates by metaLeadId rather
          // than upserting.
          const newLeads = await fetchNewLeads(campaign.metaLeadFormId);
          for (const lead of newLeads) {
            await db
              .insert(leads)
              .values({ campaignId: campaign.id, metaLeadId: lead.metaLeadId, fullName: lead.fullName, email: lead.email, phone: lead.phone, receivedAt: lead.receivedAt })
              .onConflictDoNothing();
          }
        }
      } else {
        // Sandbox / not yet connected to this specific campaign on Meta:
        // fall back to whatever snapshot was last recorded (seeded manually
        // for testing, since there's no live polling to produce one).
        const [latest] = await db
          .select()
          .from(metricSnapshots)
          .where(eq(metricSnapshots.campaignId, campaign.id))
          .orderBy(desc(metricSnapshots.recordedAt))
          .limit(1);
        snapshot = latest;
      }

      if (!snapshot) continue;

      const hoursSinceLastBudgetScale = campaign.budgetScaledAt
        ? (Date.now() - new Date(campaign.budgetScaledAt).getTime()) / 3_600_000
        : undefined;

      const decision = evaluateCampaign({
        spend: snapshot.spendCents / 100,
        impressions: snapshot.impressions,
        clicks: snapshot.clicks,
        leads: snapshot.leads,
        frequency: snapshot.frequencyHundredths / 100,
        targetCpl: campaign.targetCplCents / 100,
        maxBudget: campaign.maxBudgetCents / 100,
        qualityLeads: campaign.qualityLeads,
        hoursSinceLastBudgetScale,
      });

      const now = new Date().toISOString();
      const campaignUpdate: Partial<typeof campaigns.$inferInsert> = {
        spentCents: snapshot.spendCents,
        updatedAt: now,
      };

      if (decision.action === "pause") {
        campaignUpdate.status = "paused";
        if (credentials && campaign.metaCampaignId) await setMetaCampaignStatus(campaign.metaCampaignId, "PAUSED");
      } else if (decision.action === "refresh_creative") {
        campaignUpdate.status = "attention";
      } else if (decision.action === "scale_budget") {
        campaignUpdate.maxBudgetCents = Math.round(campaign.maxBudgetCents * (1 + decision.budgetChangePercent / 100));
        campaignUpdate.budgetScaledAt = now;
        if (credentials && campaign.metaCampaignId) {
          await updateMetaCampaignBudget(campaign.metaCampaignId, deriveDailyBudgetCents(campaignUpdate.maxBudgetCents));
        }
      }

      await db.update(campaigns).set(campaignUpdate).where(eq(campaigns.id, campaign.id));

      if (decision.rule !== "learning" && decision.rule !== "budget_scale_cooldown") {
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
    } catch (error) {
      // One campaign's Meta call failing (rate limit, expired token, ...)
      // shouldn't stop the rest of the portfolio from being evaluated.
      console.error(`Campaign monitor failed for campaign ${campaign.id}`, error);
    }
  }

  return { evaluated: liveCampaigns.length, actionsApplied };
}
