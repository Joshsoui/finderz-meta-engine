import { getDb } from "@/db";
import { signalProviderState } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";
import { SIGNAL_PROVIDERS } from "@/lib/radar/providers";

/** So the Radar UI can show which signal sources are live, on what cadence, and when they last actually ran (section 1: always-on, not "click to check") -- instead of that only being visible in server logs. */
export async function GET() {
  try {
    const db = await getDb();
    const states = await db.select().from(signalProviderState);
    const stateByProvider = new Map(states.map((state) => [state.provider, state]));

    const providers = SIGNAL_PROVIDERS.map((provider) => {
      const state = stateByProvider.get(provider.key);
      return {
        key: provider.key,
        label: provider.label,
        scanFrequencyMinutes: provider.scanFrequencyMinutes,
        configured: provider.isConfigured(),
        missingConfigHint: provider.isConfigured() ? undefined : provider.missingConfigHint,
        lastRunAt: state?.lastRunAt ?? null,
        lastRunScanned: state?.lastRunScanned ?? 0,
        lastRunInserted: state?.lastRunInserted ?? 0,
        lastError: state?.lastError ?? null,
      };
    });
    return Response.json({ providers });
  } catch (error) {
    return errorResponse(error, "Provider status unavailable");
  }
}
