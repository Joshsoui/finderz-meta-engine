import type { BusinessProfile } from "@/lib/business-profile";
import type { NormalizedSignal, SignalProvider } from "@/lib/radar/types";

/**
 * CBS StatLine's OData v4 open data API -- no key needed, verified against
 * the real endpoint before writing this. Table 85920NED ("Arbeidsvolume;
 * bedrijfstak, kwartalen, nationale rekeningen"), measure M000308_2
 * ("Banen", x1000), dimension T001081 = "A-U Alle economische activiteiten"
 * (whole-economy total) and T001413 = total type of worker -- both
 * confirmed via the table's own *Codes endpoints.
 */
const CBS_BASE = "https://datasets.cbs.nl/odata/v1/CBS/85920NED";
const CBS_TABLE_PAGE = "https://opendata.cbs.nl/#/CBS/nl/dataset/85920NED/table";

type CbsObservation = { Value: number; Perioden: string };

function formatPeriod(period: string): string {
  const match = period.match(/^(\d{4})KW0?(\d)$/);
  if (!match) return period;
  return `Q${match[2]} ${match[1]}`;
}

async function fetchLatestJobsTrend(): Promise<{ latest: CbsObservation; previous: CbsObservation } | null> {
  const url = new URL(`${CBS_BASE}/Observations`);
  url.searchParams.set("$filter", "BedrijfstakkenBranchesSBI2008 eq 'T001081' and TypeWerkenden eq 'T001413' and Measure eq 'M000308_2'");
  url.searchParams.set("$orderby", "Perioden desc");
  url.searchParams.set("$top", "2");

  const response = await fetch(url, { headers: { "User-Agent": "FinderzMetaEngine-RadarBot/1.0" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`CBS StatLine request failed (${response.status})`);

  const payload = (await response.json()) as { value?: CbsObservation[] };
  const [latest, previous] = payload.value ?? [];
  if (!latest || !previous) return null;
  return { latest, previous };
}

export const labourMarketProvider: SignalProvider = {
  key: "labour_market",
  label: "Arbeidsmarktdata (CBS)",
  isConfigured: () => true, // CBS StatLine OData is public, no key required.

  async fetchSignals(profile: BusinessProfile): Promise<NormalizedSignal[]> {
    const trend = await fetchLatestJobsTrend();
    if (!trend) return [];

    const changePercent = ((trend.latest.Value - trend.previous.Value) / trend.previous.Value) * 100;
    const direction = changePercent > 0.05 ? "gestegen" : changePercent < -0.05 ? "gedaald" : "vrijwel gelijk gebleven";
    const period = formatPeriod(trend.latest.Perioden);
    const previousPeriod = formatPeriod(trend.previous.Perioden);

    const signal: NormalizedSignal = {
      title: `CBS: aantal banen in Nederland ${direction} in ${period}`,
      summary: `Het aantal banen (alle economische activiteiten) kwam in ${period} uit op ${Math.round(trend.latest.Value).toLocaleString("nl-NL")} duizend, tegen ${Math.round(trend.previous.Value).toLocaleString("nl-NL")} duizend in ${previousPeriod} (${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(1)}%).`,
      source: "CBS StatLine",
      sourceUrl: CBS_TABLE_PAGE,
      publishedAt: new Date().toISOString(),
      category: "labour_market",
      regions: profile.regions,
      companies: [],
      industries: [],
      jobCategories: [],
      keywords: ["arbeidsmarkt", "banen", "cbs"],
      rawData: trend,
    };

    return [signal];
  },
};
