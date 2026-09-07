import { refreshPipeline } from "@/lib/pipeline-sync";

export async function POST() {
  try {
    const result = await refreshPipeline();
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Pipeline verversen is niet gelukt" }, { status: 500 });
  }
}
