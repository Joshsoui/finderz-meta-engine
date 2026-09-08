import { errorResponse } from "@/lib/api-error";
import { fetchAllAccountCampaigns, getMetaCredentials } from "@/lib/meta-client";

export async function GET() {
  try {
    if (!getMetaCredentials()) return Response.json({ connected: false, campaigns: [] });

    const campaigns = await fetchAllAccountCampaigns();
    return Response.json({ connected: true, campaigns });
  } catch (error) {
    return errorResponse(error, "Campagnes uit Ads Manager konden niet worden opgehaald");
  }
}
