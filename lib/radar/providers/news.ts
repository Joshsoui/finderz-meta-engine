import type { BusinessProfile } from "@/lib/business-profile";
import { fetchGoogleNewsRss } from "@/lib/radar/google-news";
import type { NormalizedSignal, SignalProvider } from "@/lib/radar/types";

/** Fixed intent phrases covering the MVP's labour-market/employer-news categories (section 2) -- combined with the business profile's own industry/keywords so queries stay targeted instead of generic. */
const INTENT_QUERIES = [
  "personeelstekort",
  "ontslagen reorganisatie",
  "bedrijfssluiting fabriek",
  "nieuwe vestiging uitbreiding werkgelegenheid",
  "cao loonsverhoging",
  "arbeidsmarkt wetswijziging",
];

export const newsProvider: SignalProvider = {
  key: "news",
  label: "Nieuws & arbeidsmarktnieuws",
  scanFrequencyMinutes: 30, // "breaking/high-priority" tier (section 1) -- free and cheap to poll often.
  isConfigured: () => true, // Google News RSS needs no key.

  async fetchSignals(profile: BusinessProfile): Promise<NormalizedSignal[]> {
    const industryTerm = profile.industry || "recruitment";
    const queries = [
      ...INTENT_QUERIES.map((intent) => `${intent} ${industryTerm}`.trim()),
      ...profile.keywords.map((keyword) => `${keyword} vacatures`),
    ];

    const results = await Promise.allSettled(queries.map((query) => fetchGoogleNewsRss(query, "news", profile.regions)));
    return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  },
};
