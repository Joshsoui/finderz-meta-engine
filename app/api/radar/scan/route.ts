import { errorResponse } from "@/lib/api-error";
import { analyzePendingSignals } from "@/lib/opportunity-engine";
import { runRadarScan } from "@/lib/radar/radar-sync";

/** Manual "scan now" trigger for the Radar UI -- same two-step pipeline the cron runs (collect+filter, then AI-analyze whatever passed). */
export async function POST() {
  try {
    const scan = await runRadarScan();
    const analysis = await analyzePendingSignals();
    return Response.json({ scan, analysis });
  } catch (error) {
    return errorResponse(error, "Radar-scan is mislukt");
  }
}
