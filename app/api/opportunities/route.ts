import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { opportunities, signals } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";
import { computeEffectiveScore } from "@/lib/opportunity-decay";

const STATUS_VALUES = ["opportunity", "content_generated", "review", "approved", "ready_to_publish", "dismissed"] as const;

export async function GET(request: Request) {
  try {
    const statusParam = new URL(request.url).searchParams.get("status");
    const status = STATUS_VALUES.includes(statusParam as typeof STATUS_VALUES[number]) ? (statusParam as typeof STATUS_VALUES[number]) : undefined;

    const db = await getDb();
    const rows = await db
      .select({
        id: opportunities.id,
        title: opportunities.title,
        score: opportunities.score,
        relevanceScore: opportunities.relevanceScore,
        timelinessScore: opportunities.timelinessScore,
        audienceFitScore: opportunities.audienceFitScore,
        regionalFitScore: opportunities.regionalFitScore,
        commercialPotentialScore: opportunities.commercialPotentialScore,
        contentPotentialScore: opportunities.contentPotentialScore,
        recruitmentPotentialScore: opportunities.recruitmentPotentialScore,
        whyNow: opportunities.whyNow,
        matchingCampaignIdsJson: opportunities.matchingCampaignIdsJson,
        isAppropriate: opportunities.isAppropriate,
        guardrailReason: opportunities.guardrailReason,
        urgency: opportunities.urgency,
        decayRatePerDay: opportunities.decayRatePerDay,
        optimalActionBeforeAt: opportunities.optimalActionBeforeAt,
        status: opportunities.status,
        createdAt: opportunities.createdAt,
        signalCategory: signals.category,
        signalRegionsJson: signals.regionsJson,
        signalSource: signals.source,
        signalSourceUrl: signals.sourceUrl,
      })
      .from(opportunities)
      .innerJoin(signals, eq(opportunities.signalId, signals.id))
      .where(status ? eq(opportunities.status, status) : undefined)
      .orderBy(desc(opportunities.score), desc(opportunities.createdAt))
      .limit(200);

    // effectiveScore is derived at read time (section 5) -- score itself is
    // never mutated, so a breaking opportunity's list ranking quietly drops
    // as it goes stale without rewriting the AI's original judgement.
    const withEffectiveScore = rows
      .map((row) => ({ ...row, effectiveScore: computeEffectiveScore(row.score, row.decayRatePerDay, row.createdAt) }))
      .sort((a, b) => b.effectiveScore - a.effectiveScore);

    return Response.json({ opportunities: withEffectiveScore });
  } catch (error) {
    return errorResponse(error, "Opportunities unavailable");
  }
}
