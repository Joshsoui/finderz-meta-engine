import { getDb } from "@/db";
import { portfolioSettings } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";
import { getPortfolioDailyBudgetHeadroomCents } from "@/lib/portfolio-budget";

export async function GET() {
  try {
    const db = await getDb();
    const { capCents, usedCents, headroomCents } = await getPortfolioDailyBudgetHeadroomCents(db);
    return Response.json({ maxDailyBudget: capCents / 100, usedToday: usedCents / 100, headroom: headroomCents / 100 });
  } catch (error) {
    return errorResponse(error, "Portfolio settings unavailable");
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { maxDailyBudget?: number };
    if (!Number.isFinite(body.maxDailyBudget) || Number(body.maxDailyBudget) <= 0) {
      return Response.json({ error: "maxDailyBudget must be a positive number" }, { status: 400 });
    }

    const db = await getDb();
    const maxDailyBudgetCents = Math.round(Number(body.maxDailyBudget) * 100);
    const now = new Date().toISOString();
    await db
      .insert(portfolioSettings)
      .values({ id: "global", maxDailyBudgetCents, updatedAt: now })
      .onConflictDoUpdate({ target: portfolioSettings.id, set: { maxDailyBudgetCents, updatedAt: now } });

    const { capCents, usedCents, headroomCents } = await getPortfolioDailyBudgetHeadroomCents(db);
    return Response.json({ maxDailyBudget: capCents / 100, usedToday: usedCents / 100, headroom: headroomCents / 100 });
  } catch (error) {
    return errorResponse(error, "Portfolio settings could not be saved");
  }
}
