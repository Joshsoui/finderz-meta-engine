import { errorResponse } from "@/lib/api-error";
import { runCampaignMonitor } from "@/lib/campaign-monitor-sync";

export async function POST() {
  try {
    const result = await runCampaignMonitor();
    return Response.json(result);
  } catch (error) {
    return errorResponse(error, "Monitoring kon niet worden uitgevoerd");
  }
}
