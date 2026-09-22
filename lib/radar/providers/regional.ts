import type { BusinessProfile } from "@/lib/business-profile";
import { fetchGoogleNewsRss } from "@/lib/radar/google-news";
import type { NormalizedSignal, SignalProvider } from "@/lib/radar/types";

/** Fixed intent phrases for regional economic developments (section 2's "nieuwe bedrijfsvestigingen/uitbreidingen", "economische ontwikkelingen"). */
const REGIONAL_INTENTS = ["nieuwe bedrijven vestiging", "bedrijventerrein uitbreiding", "werkgelegenheid economie"];

export const regionalProvider: SignalProvider = {
  key: "regional",
  label: "Regionale ontwikkelingen",
  isConfigured: () => true,

  async fetchSignals(profile: BusinessProfile): Promise<NormalizedSignal[]> {
    if (profile.regions.length === 0) return [];

    const queries = profile.regions.flatMap((region) => REGIONAL_INTENTS.map((intent) => `${intent} ${region}`));
    const results = await Promise.allSettled(queries.map((query) => fetchGoogleNewsRss(query, "regional", profile.regions)));
    return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  },
};
