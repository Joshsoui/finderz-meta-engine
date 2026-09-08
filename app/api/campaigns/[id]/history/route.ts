import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { metricSnapshots } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDb();
    const recent = await db
      .select({ recordedAt: metricSnapshots.recordedAt, spendCents: metricSnapshots.spendCents, leads: metricSnapshots.leads })
      .from(metricSnapshots)
      .where(eq(metricSnapshots.campaignId, id))
      .orderBy(desc(metricSnapshots.recordedAt))
      .limit(60);

    const points = recent
      .slice()
      .sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : 1))
      .map((row) => ({ recordedAt: row.recordedAt, cpl: row.leads > 0 ? row.spendCents / 100 / row.leads : null }));

    return Response.json({ points });
  } catch (error) {
    return errorResponse(error, "Campaign history unavailable");
  }
}
