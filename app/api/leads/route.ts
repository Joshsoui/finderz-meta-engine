import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, leads } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db
      .select({
        id: leads.id,
        fullName: leads.fullName,
        email: leads.email,
        phone: leads.phone,
        quality: leads.quality,
        receivedAt: leads.receivedAt,
        campaignId: leads.campaignId,
        campaignTitle: campaigns.title,
        campaignLocation: campaigns.location,
      })
      .from(leads)
      .innerJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .orderBy(desc(leads.receivedAt))
      .limit(200);
    return Response.json({ leads: rows });
  } catch (error) {
    return errorResponse(error, "Leads unavailable");
  }
}
