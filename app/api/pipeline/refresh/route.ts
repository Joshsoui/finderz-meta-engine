import { errorResponse } from "@/lib/api-error";
import { refreshPipeline } from "@/lib/pipeline-sync";

export async function POST() {
  try {
    const result = await refreshPipeline();
    return Response.json(result);
  } catch (error) {
    return errorResponse(error, "Pipeline verversen is niet gelukt");
  }
}
