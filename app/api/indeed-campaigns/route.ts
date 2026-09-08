import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { indeedCampaigns, indeedSpendLog } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";
import { amsterdamDateDaysAgo, amsterdamToday } from "@/lib/dates";

export async function GET() {
  try {
    const db = await getDb();
    const today = amsterdamToday();
    const weekStart = amsterdamDateDaysAgo(6);

    const rows = await db.select().from(indeedCampaigns).orderBy(indeedCampaigns.createdAt);
    const campaignsWithSpend = await Promise.all(
      rows.map(async (campaign) => {
        const spendRows = await db
          .select({ date: indeedSpendLog.date, amountCents: indeedSpendLog.amountCents })
          .from(indeedSpendLog)
          .where(eq(indeedSpendLog.campaignId, campaign.id));
        const todaySpendCents = spendRows.find((row) => row.date === today)?.amountCents ?? 0;
        const weekSpendCents = spendRows.filter((row) => row.date >= weekStart).reduce((sum, row) => sum + row.amountCents, 0);
        const totalSpendCents = spendRows.reduce((sum, row) => sum + row.amountCents, 0);
        return { ...campaign, todaySpendCents, weekSpendCents, totalSpendCents };
      }),
    );

    return Response.json({ today, campaigns: campaignsWithSpend });
  } catch (error) {
    return errorResponse(error, "Indeed campagnes konden niet worden geladen");
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { title?: string };
    const title = body.title?.trim();
    if (!title) return Response.json({ error: "Vul een titel in" }, { status: 400 });

    const db = await getDb();
    const now = new Date().toISOString();
    const [campaign] = await db
      .insert(indeedCampaigns)
      .values({ id: crypto.randomUUID(), title, status: "active", createdAt: now, updatedAt: now })
      .returning();
    return Response.json({ campaign: { ...campaign, todaySpendCents: 0, weekSpendCents: 0, totalSpendCents: 0 } });
  } catch (error) {
    return errorResponse(error, "Indeed-campagne kon niet worden aangemaakt");
  }
}
