import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";
import { fetchPlacementBreakdown, getMetaCredentials } from "@/lib/meta-client";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const credentials = getMetaCredentials();
    if (!credentials) return Response.json({ placements: [], connected: false });

    const db = await getDb();
    const [campaign] = await db.select({ metaCampaignId: campaigns.metaCampaignId }).from(campaigns).where(eq(campaigns.id, id)).limit(1);
    if (!campaign?.metaCampaignId) return Response.json({ placements: [], connected: false });

    const placements = await fetchPlacementBreakdown(campaign.metaCampaignId);
    return Response.json({ placements, connected: true });
  } catch (error) {
    return errorResponse(error, "Verdeling per plaatsing kon niet worden opgehaald");
  }
}
