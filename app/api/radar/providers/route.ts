import { errorResponse } from "@/lib/api-error";
import { SIGNAL_PROVIDERS } from "@/lib/radar/providers";

/** So the Radar UI can show which signal sources are actually live vs. still need an API key (section 2/13), instead of that only being visible in server logs. */
export async function GET() {
  try {
    const providers = SIGNAL_PROVIDERS.map((provider) => ({
      key: provider.key,
      label: provider.label,
      configured: provider.isConfigured(),
      missingConfigHint: provider.isConfigured() ? undefined : provider.missingConfigHint,
    }));
    return Response.json({ providers });
  } catch (error) {
    return errorResponse(error, "Provider status unavailable");
  }
}
