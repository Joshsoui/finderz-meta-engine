import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { actionRecommendations, actionsTaken, campaigns, contentPieces, opportunities, signals } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";
import { computeEffectiveScore } from "@/lib/opportunity-decay";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDb();

    const [opportunity] = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
    if (!opportunity) return Response.json({ error: "Opportunity niet gevonden" }, { status: 404 });

    const [signalRow] = await db.select().from(signals).where(eq(signals.id, opportunity.signalId)).limit(1);
    const pieces = await db.select().from(contentPieces).where(eq(contentPieces.opportunityId, id));
    const recommendations = await db
      .select()
      .from(actionRecommendations)
      .where(eq(actionRecommendations.opportunityId, id))
      .orderBy(desc(actionRecommendations.score));
    const taken = await db.select().from(actionsTaken).where(eq(actionsTaken.opportunityId, id));

    const matchingCampaignIds = JSON.parse(opportunity.matchingCampaignIdsJson) as string[];
    const matchingVacancies = matchingCampaignIds.length > 0
      ? await db
          .select({
            id: campaigns.id, title: campaigns.title, location: campaigns.location, salary: campaigns.salary,
            feeCents: campaigns.feeCents, description: campaigns.description, otysVacancyId: campaigns.otysVacancyId,
          })
          .from(campaigns)
          .where(inArray(campaigns.id, matchingCampaignIds))
      : [];

    const effectiveScore = computeEffectiveScore(opportunity.score, opportunity.decayRatePerDay, opportunity.createdAt);

    return Response.json({
      opportunity: { ...opportunity, effectiveScore },
      signal: signalRow,
      contentPieces: pieces,
      actionRecommendations: recommendations,
      actionsTaken: taken,
      matchingVacancies,
    });
  } catch (error) {
    return errorResponse(error, "Opportunity unavailable");
  }
}
