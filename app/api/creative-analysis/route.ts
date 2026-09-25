import { errorResponse } from "@/lib/api-error";
import { getLatestCreativeInsights } from "@/lib/creative-analyst";

export async function GET() {
  try {
    const { state, insights } = await getLatestCreativeInsights();
    return Response.json({ state, insights });
  } catch (error) {
    return errorResponse(error, "Analyse kon niet worden geladen");
  }
}
