import type { BusinessProfile } from "@/lib/business-profile";
import { fetchGoogleNewsRss } from "@/lib/radar/google-news";
import type { NormalizedSignal, SignalProvider } from "@/lib/radar/types";

/**
 * Vakpers naast de algemene nieuwsbron (in plaats van bv. Reuters, dat voor
 * een Nederlandse regionale wervingsdoelgroep te generiek/internationaal is):
 * sectorspecifieke vakbladen zien personeels- en bedrijfsnieuws (faillissementen,
 * wervingsacties, stakingen, uitbreidingen) vaak eerder en gedetailleerder dan
 * algemene media. Domeinen zijn met een echte site:-query tegen Google News RSS
 * geverifieerd (geen fake data) -- logistiek.nl en nieuwsbladtransport.nl
 * leveren daadwerkelijk relevante, sectorspecifieke personeelsberichten op.
 */
const TRADE_PRESS_SITES = ["logistiek.nl", "nieuwsbladtransport.nl"];
const SITE_SCOPE = `(${TRADE_PRESS_SITES.map((site) => `site:${site}`).join(" OR ")})`;

/** Dezelfde personeels-/arbeidsmarktintenties als de algemene newsProvider, maar hier scoped tot vakpers in plaats van generiek nieuws. */
const TRADE_PRESS_INTENTS = ["personeel", "personeelstekort", "reorganisatie ontslag", "nieuwe vestiging uitbreiding", "cao"];

export const tradePressProvider: SignalProvider = {
  key: "trade_press",
  label: "Vakpers",
  scanFrequencyMinutes: 60, // "general news" tier (section 1) -- zelfde cadans als regionaal.
  isConfigured: () => true, // Google News RSS needs no key.

  async fetchSignals(profile: BusinessProfile): Promise<NormalizedSignal[]> {
    const queries = TRADE_PRESS_INTENTS.map((intent) => `${SITE_SCOPE} ${intent}`);
    const results = await Promise.allSettled(queries.map((query) => fetchGoogleNewsRss(query, "trade_press", profile.regions)));
    return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  },
};
