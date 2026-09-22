import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, contentPieces, opportunities, signals } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDb();

    const [opportunity] = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
    if (!opportunity) return Response.json({ error: "Opportunity niet gevonden" }, { status: 404 });

    const [signalRow] = await db.select().from(signals).where(eq(signals.id, opportunity.signalId)).limit(1);
    const pieces = await db.select().from(contentPieces).where(eq(contentPieces.opportunityId, id));

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

    return Response.json({ opportunity, signal: signalRow, contentPieces: pieces, matchingVacancies });
  } catch (error) {
    return errorResponse(error, "Opportunity unavailable");
  }
}
