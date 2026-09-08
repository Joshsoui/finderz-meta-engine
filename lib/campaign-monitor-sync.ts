import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, leads, metaSyncHealth, metricSnapshots, optimizationActions } from "@/db/schema";
import { evaluateCampaign } from "@/lib/campaign-engine";
import { syncAutomaticDailySpend } from "@/lib/daily-spend-sync";
import { fetchAdStatus, fetchCampaignInsights, fetchNewLeads, getMetaCredentials, setMetaCampaignStatus } from "@/lib/meta-client";

async function recordMetaSyncResult(db: Awaited<ReturnType<typeof getDb>>, error?: unknown) {
  const now = new Date().toISOString();
  const [existing] = await db.select().from(metaSyncHealth).where(eq(metaSyncHealth.id, "meta")).limit(1);
  if (error) {
    await db
      .insert(metaSyncHealth)
      .values({ id: "meta", lastErrorAt: now, lastErrorMessage: error instanceof Error ? error.message : String(error), consecutiveFailures: 1 })
      .onConflictDoUpdate({
        target: metaSyncHealth.id,
        set: { lastErrorAt: now, lastErrorMessage: error instanceof Error ? error.message : String(error), consecutiveFailures: (existing?.consecutiveFailures ?? 0) + 1 },
      });
  } else {
    await db
      .insert(metaSyncHealth)
      .values({ id: "meta", lastSuccessAt: now, consecutiveFailures: 0 })
      .onConflictDoUpdate({ target: metaSyncHealth.id, set: { lastSuccessAt: now, consecutiveFailures: 0 } });
  }
}

export async function runCampaignMonitor(): Promise<{ evaluated: number; actionsApplied: number }> {
  const db = await getDb();
  const liveCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, "live"));
  const credentials = getMetaCredentials();

  let actionsApplied = 0;
  let anyMetaCallSucceeded = false;
  let lastMetaError: unknown;

  for (const campaign of liveCampaigns) {
    try {
      if (credentials && campaign.metaAdId) {
        // Check delivery status before spending another API call on insights
        // -- a disapproved ad shows zero spend/leads forever otherwise, with
        // nothing telling the marketer *why* nothing is happening.
        const adStatus = await fetchAdStatus(campaign.metaAdId);
        anyMetaCallSucceeded = true;
        if (adStatus.effectiveStatus === "DISAPPROVED") {
          if (campaign.status !== "attention") {
            await db.update(campaigns).set({ status: "attention", updatedAt: new Date().toISOString() }).where(eq(campaigns.id, campaign.id));
            await db.insert(optimizationActions).values({
              campaignId: campaign.id,
              rule: "ad_rejected",
              severity: "critical",
              recommendation: `Meta heeft deze advertentie geweigerd${adStatus.rejectionReason ? ` (reden: ${adStatus.rejectionReason})` : ""}. Pas het beeld of de tekst aan, dan dien ik 'm opnieuw in.`,
              status: "applied",
              createdAt: new Date().toISOString(),
              appliedAt: new Date().toISOString(),
            });
            actionsApplied += 1;
          }
          continue;
        }
      }

      let snapshot: { spendCents: number; impressions: number; clicks: number; leads: number; frequencyHundredths: number } | undefined;

      if (credentials && campaign.metaCampaignId) {
        // Meta is connected: pull the campaign's cumulative lifetime numbers
        // (not just "today") and record them as a fresh snapshot -- the
        // budget-ceiling rule and the dashboard's spend/profit totals both
        // assume campaigns.spentCents is the running total since launch, and
        // a "today"-scoped fetch would silently reset that total every day.
        const insights = await fetchCampaignInsights(campaign.metaCampaignId, "lifetime");
        anyMetaCallSucceeded = true;
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

      // A brand-new campaign's leads all default to "unrated", which is not
      // the same thing as "reviewed, and none were usable" -- treat quality
      // as unknown (skip the low-quality guard entirely) until at least one
      // lead has actually been reviewed, rather than reading 0 good leads as
      // "0% quality" from the very first evaluation.
      const campaignLeads = await db.select({ quality: leads.quality }).from(leads).where(eq(leads.campaignId, campaign.id));
      const reviewedLeads = campaignLeads.filter((lead) => lead.quality !== "unrated");
      const qualityLeads = reviewedLeads.length > 0 ? reviewedLeads.filter((lead) => lead.quality === "good").length : undefined;

      const hoursSinceLastCreativeCheck = campaign.liveSince
        ? (Date.now() - new Date(campaign.lastCreativeCheckAt ?? campaign.liveSince).getTime()) / 3_600_000
        : undefined;

      const decision = evaluateCampaign({
        spend: snapshot.spendCents / 100,
        impressions: snapshot.impressions,
        clicks: snapshot.clicks,
        leads: snapshot.leads,
        frequency: snapshot.frequencyHundredths / 100,
        targetCpl: campaign.targetCplCents / 100,
        maxBudget: campaign.maxBudgetCents / 100,
        qualityLeads,
        hoursSinceLastBudgetScale,
        hoursSinceLastCreativeCheck,
      });

      const now = new Date().toISOString();
      const campaignUpdate: Partial<typeof campaigns.$inferInsert> = {
        spentCents: snapshot.spendCents,
        updatedAt: now,
      };

      if (decision.action === "scale_budget") {
        // Spending more money is a discretionary call, not a safety action --
        // unlike pausing (which protects money and shouldn't wait on anyone),
        // a budget increase sits as a pending suggestion in "Uit te voeren
        // acties" until a human approves it. Avoid stacking a duplicate
        // suggestion every 15 minutes while one is already awaiting approval.
        const [existingPending] = await db
          .select({ id: optimizationActions.id })
          .from(optimizationActions)
          .where(and(eq(optimizationActions.campaignId, campaign.id), eq(optimizationActions.rule, "healthy_cpl"), eq(optimizationActions.status, "pending")))
          .limit(1);
        if (!existingPending) {
          await db.insert(optimizationActions).values({
            campaignId: campaign.id,
            rule: decision.rule,
            severity: decision.severity,
            recommendation: decision.recommendation,
            status: "pending",
            budgetChangePercent: decision.budgetChangePercent,
            createdAt: now,
          });
          actionsApplied += 1;
        }
        await db.update(campaigns).set(campaignUpdate).where(eq(campaigns.id, campaign.id));
        continue;
      }

      if (decision.action === "pause") {
        campaignUpdate.status = "paused";
        if (credentials && campaign.metaCampaignId) await setMetaCampaignStatus(campaign.metaCampaignId, "PAUSED");
      } else if (decision.action === "refresh_creative") {
        campaignUpdate.status = "attention";
      }

      if (decision.rule === "periodic_creative_check") {
        campaignUpdate.lastCreativeCheckAt = now;
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
      lastMetaError = error;
    }
  }

  // Surface a broken Meta connection (expired token, revoked access, ...)
  // somewhere other than server logs -- /api/meta/status reads this to warn
  // in the UI once failures start piling up, instead of the automation
  // silently doing nothing for days.
  if (credentials) {
    if (anyMetaCallSucceeded) await recordMetaSyncResult(db);
    else if (lastMetaError) await recordMetaSyncResult(db, lastMetaError);
    // Replaces the manual "type in what Ads Manager shows" daily habit --
    // reads from metricSnapshots already recorded above, so this stays
    // accurate even if a single campaign's insights call failed this cycle.
    await syncAutomaticDailySpend();
  }

  return { evaluated: liveCampaigns.length, actionsApplied };
}
