import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, optimizationActions } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

const STATUS_VALUES = ["pending", "applied", "dismissed"] as const;

export async function GET(request: Request) {
  try {
    const statusParam = new URL(request.url).searchParams.get("status");
    const status = STATUS_VALUES.includes(statusParam as typeof STATUS_VALUES[number]) ? (statusParam as typeof STATUS_VALUES[number]) : undefined;

    const db = await getDb();
    const rows = await db
      .select({
        id: optimizationActions.id,
        rule: optimizationActions.rule,
        severity: optimizationActions.severity,
        recommendation: optimizationActions.recommendation,
        status: optimizationActions.status,
        budgetChangePercent: optimizationActions.budgetChangePercent,
        createdAt: optimizationActions.createdAt,
        appliedAt: optimizationActions.appliedAt,
        campaignId: optimizationActions.campaignId,
        campaignTitle: campaigns.title,
        campaignLocation: campaigns.location,
      })
      .from(optimizationActions)
      .innerJoin(campaigns, eq(optimizationActions.campaignId, campaigns.id))
      .where(status ? eq(optimizationActions.status, status) : undefined)
      .orderBy(desc(optimizationActions.createdAt))
      .limit(100);
    return Response.json({ actions: rows });
  } catch (error) {
    return errorResponse(error, "Optimization actions unavailable");
  }
}
