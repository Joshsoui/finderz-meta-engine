import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, optimizationActions } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db
      .select({
        id: optimizationActions.id,
        rule: optimizationActions.rule,
        severity: optimizationActions.severity,
        recommendation: optimizationActions.recommendation,
        status: optimizationActions.status,
        createdAt: optimizationActions.createdAt,
        appliedAt: optimizationActions.appliedAt,
        campaignId: optimizationActions.campaignId,
        campaignTitle: campaigns.title,
        campaignLocation: campaigns.location,
      })
      .from(optimizationActions)
      .innerJoin(campaigns, eq(optimizationActions.campaignId, campaigns.id))
      .orderBy(desc(optimizationActions.createdAt))
      .limit(100);
    return Response.json({ actions: rows });
  } catch (error) {
    return errorResponse(error, "Optimization actions unavailable");
  }
}
