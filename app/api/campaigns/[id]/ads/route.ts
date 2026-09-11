import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";
import { fetchCampaignAds, getMetaCredentials } from "@/lib/meta-client";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const credentials = getMetaCredentials();
    if (!credentials) return Response.json({ ads: [], connected: false });

    const db = await getDb();
    const [campaign] = await db.select({ metaCampaignId: campaigns.metaCampaignId }).from(campaigns).where(eq(campaigns.id, id)).limit(1);
    if (!campaign?.metaCampaignId) return Response.json({ ads: [], connected: false });

    const ads = await fetchCampaignAds(campaign.metaCampaignId);
    return Response.json({ ads, connected: true });
  } catch (error) {
    return errorResponse(error, "Advertenties konden niet worden opgehaald");
  }
}
