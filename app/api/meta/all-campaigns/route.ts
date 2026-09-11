import { errorResponse } from "@/lib/api-error";
import { fetchAllAccountCampaigns, getMetaCredentials } from "@/lib/meta-client";

export async function GET(request: Request) {
  try {
    if (!getMetaCredentials()) return Response.json({ connected: false, campaigns: [] });

    const preset = new URL(request.url).searchParams.get("preset") === "today" ? "today" : "maximum";
    const campaigns = await fetchAllAccountCampaigns(preset);
    return Response.json({ connected: true, campaigns });
  } catch (error) {
    return errorResponse(error, "Campagnes uit Ads Manager konden niet worden opgehaald");
  }
}
