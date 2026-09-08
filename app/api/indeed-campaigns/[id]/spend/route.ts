import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { indeedCampaigns, indeedSpendLog } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";
import { amsterdamToday } from "@/lib/dates";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { date?: string; amount?: number };
    const date = body.date && DATE_PATTERN.test(body.date) ? body.date : amsterdamToday();
    if (!Number.isFinite(body.amount) || Number(body.amount) < 0) {
      return Response.json({ error: "amount must be a non-negative number" }, { status: 400 });
    }

    const db = await getDb();
    const [campaign] = await db.select({ id: indeedCampaigns.id }).from(indeedCampaigns).where(eq(indeedCampaigns.id, id)).limit(1);
    if (!campaign) return Response.json({ error: "Indeed-campagne niet gevonden" }, { status: 404 });

    const amountCents = Math.round(Number(body.amount) * 100);
    const now = new Date().toISOString();
    const [entry] = await db
      .insert(indeedSpendLog)
      .values({ campaignId: id, date, amountCents, updatedAt: now })
      .onConflictDoUpdate({
        target: [indeedSpendLog.campaignId, indeedSpendLog.date],
        set: { amountCents, updatedAt: now },
      })
      .returning();
    return Response.json({ entry });
  } catch (error) {
    return errorResponse(error, "Indeed-spend kon niet worden opgeslagen");
  }
}
