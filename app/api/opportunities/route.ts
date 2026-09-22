import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { opportunities, signals } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

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
        recommendedChannelsJson: opportunities.recommendedChannelsJson,
        isAppropriate: opportunities.isAppropriate,
        guardrailReason: opportunities.guardrailReason,
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

    return Response.json({ opportunities: rows });
  } catch (error) {
    return errorResponse(error, "Opportunities unavailable");
  }
}
