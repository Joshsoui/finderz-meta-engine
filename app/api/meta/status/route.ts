import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { metaSyncHealth } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

// After this many consecutive failed monitor cycles (~45 min at the current
// 15-minute cron), treat the Meta connection as broken rather than a
// one-off blip (rate limit, transient network error).
const UNHEALTHY_FAILURE_THRESHOLD = 3;

export async function GET() {
  try {
    const configured = Boolean(
      process.env.META_ACCESS_TOKEN &&
      process.env.META_AD_ACCOUNT_ID &&
      process.env.META_PAGE_ID
    );

    let healthy = true;
    let lastErrorMessage: string | null = null;
    if (configured) {
      const db = await getDb();
      const [health] = await db.select().from(metaSyncHealth).where(eq(metaSyncHealth.id, "meta")).limit(1);
      if (health && health.consecutiveFailures >= UNHEALTHY_FAILURE_THRESHOLD) {
        healthy = false;
        lastErrorMessage = health.lastErrorMessage;
      }
    }

    return Response.json({
      configured,
      services: {
        adsManager: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID),
        leadForms: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PAGE_ID),
        imageGeneration: Boolean(process.env.OPENAI_API_KEY),
      },
      mode: process.env.META_ACCESS_TOKEN ? "connected" : "sandbox",
      healthy,
      lastErrorMessage,
    });
  } catch (error) {
    return errorResponse(error, "Meta status unavailable");
  }
}
