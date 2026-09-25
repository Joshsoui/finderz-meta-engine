import { errorResponse } from "@/lib/api-error";
import { runCreativeAnalysis } from "@/lib/creative-analyst";

export async function POST() {
  try {
    const result = await runCreativeAnalysis();
    return Response.json({ result });
  } catch (error) {
    return errorResponse(error, "Analyse kon niet worden uitgevoerd");
  }
}
