import type { BusinessProfile } from "@/lib/business-profile";
import type { NormalizedSignal, SignalProvider } from "@/lib/radar/types";

/**
 * Google has no free, official Trends API -- every working integration goes
 * through a paid third-party wrapper (e.g. SerpApi's Google Trends engine).
 * Per section 2/13: built correctly, gated behind a real key, never fake
 * data. isConfigured() is false until SERPAPI_API_KEY is set, so radar-sync
 * skips this provider entirely rather than fabricating trend signals.
 */
export const trendsProvider: SignalProvider = {
  key: "trends",
  label: "Zoektrends",
  scanFrequencyMinutes: 6 * 60, // "government/regulatory... meerdere keren per dag" tier (section 1) -- search interest moves slower than breaking news.
  isConfigured: () => Boolean(process.env.SERPAPI_API_KEY),
  missingConfigHint: "Voeg SERPAPI_API_KEY toe (serpapi.com, Google Trends engine) om zoektrends mee te nemen.",

  async fetchSignals(profile: BusinessProfile): Promise<NormalizedSignal[]> {
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) return [];

    const results: NormalizedSignal[] = [];
    for (const keyword of profile.keywords.slice(0, 5)) {
      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google_trends");
      url.searchParams.set("q", keyword);
      url.searchParams.set("geo", "NL");
      url.searchParams.set("data_type", "TIMESERIES");
      url.searchParams.set("api_key", apiKey);

      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) continue;

      const payload = (await response.json()) as {
        interest_over_time?: { timeline_data?: Array<{ date: string; values: Array<{ value: string }>; partial_data?: boolean }> };
      };
      // The most recent week is often still in progress (partial_data: true,
      // confirmed against the real API -- its value reads as an artificial 0
      // while the week is incomplete) and would otherwise always look like a
      // drop, never a spike. Drop it and compare the last two *complete*
      // weeks instead.
      const timeline = (payload.interest_over_time?.timeline_data ?? []).filter((point) => !point.partial_data);
      if (timeline.length < 2) continue;

      const latest = timeline[timeline.length - 1];
      const previous = timeline[timeline.length - 2];
      const latestValue = Number(latest.values[0]?.value ?? 0);
      const previousValue = Number(previous.values[0]?.value ?? 0);
      // Confirmed live against the real API: a keyword with barely any
      // search volume (e.g. 2 -> 3) clears a 1.3x ratio check just as
      // easily as a real spike (29 -> 51) -- below MIN_SIGNAL_VALUE the
      // relative-scale numbers are just noise, not a trend.
      const MIN_SIGNAL_VALUE = 10;
      if (previousValue === 0 || latestValue < MIN_SIGNAL_VALUE || latestValue <= previousValue * 1.3) continue;

      results.push({
        title: `Zoekinteresse in "${keyword}" neemt toe`,
        summary: `Google-zoekinteresse in "${keyword}" (Nederland) steeg van ${previousValue} naar ${latestValue} (relatieve schaal 0-100) tussen ${previous.date} en ${latest.date}.`,
        source: "Google Trends (via SerpApi)",
        sourceUrl: `https://trends.google.com/trends/explore?geo=NL&q=${encodeURIComponent(keyword)}`,
        publishedAt: new Date().toISOString(),
        category: "trends",
        regions: profile.regions,
        companies: [],
        industries: [],
        jobCategories: [],
        keywords: [keyword],
        rawData: { latest, previous },
      });
    }

    return results;
  },
};
