import { errorResponse } from "@/lib/api-error";
import { analyzePendingSignals } from "@/lib/opportunity-engine";
import { runRadarScan } from "@/lib/radar/radar-sync";

/** Manual "scan now" trigger for the Radar UI -- same two-step pipeline the cron runs (collect+filter, then AI-analyze whatever passed), but forced so a human clicking the button always gets a real scan regardless of each provider's own due schedule. */
export async function POST() {
  try {
    const scan = await runRadarScan({ force: true });
    const analysis = await analyzePendingSignals();
    return Response.json({ scan, analysis });
  } catch (error) {
    return errorResponse(error, "Radar-scan is mislukt");
  }
}
