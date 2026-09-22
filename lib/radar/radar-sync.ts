import { getDb } from "@/db";
import { signals } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business-profile";
import { buildDedupeKey } from "@/lib/radar/dedupe";
import { passesCheapFilter } from "@/lib/radar/cheap-filter";
import { SIGNAL_PROVIDERS } from "@/lib/radar/providers";

export type RadarScanResult = {
  scanned: number;
  inserted: number;
  passedFilter: number;
  errors: string[];
  skippedProviders: string[];
};

/**
 * One full Radar scan cycle (section 2/11): collect from every configured
 * provider, normalize, dedupe against what's already stored, then run the
 * free cheap filter. Deep AI opportunity scoring is a separate step
 * (lib/opportunity-engine.ts), triggered on whatever passed the filter here
 * -- kept apart so a scan never itself spends AI budget.
 */
export async function runRadarScan(): Promise<RadarScanResult> {
  const db = await getDb();
  const profile = await getBusinessProfile();

  const result: RadarScanResult = { scanned: 0, inserted: 0, passedFilter: 0, errors: [], skippedProviders: [] };

  for (const provider of SIGNAL_PROVIDERS) {
    if (!provider.isConfigured()) {
      result.skippedProviders.push(provider.key);
      continue;
    }

    try {
      const fetched = await provider.fetchSignals(profile);
      result.scanned += fetched.length;

      for (const signal of fetched) {
        const dedupeKey = await buildDedupeKey(provider.key, signal.title, signal.sourceUrl, signal.publishedAt);
        const passedFilter = passesCheapFilter(signal, profile);

        const inserted = await db
          .insert(signals)
          .values({
            id: crypto.randomUUID(),
            provider: provider.key,
            title: signal.title,
            summary: signal.summary,
            source: signal.source,
            sourceUrl: signal.sourceUrl,
            dedupeKey,
            publishedAt: signal.publishedAt,
            category: signal.category,
            regionsJson: JSON.stringify(signal.regions),
            companiesJson: JSON.stringify(signal.companies),
            industriesJson: JSON.stringify(signal.industries),
            jobCategoriesJson: JSON.stringify(signal.jobCategories),
            keywordsJson: JSON.stringify(signal.keywords),
            rawDataJson: signal.rawData ? JSON.stringify(signal.rawData) : null,
            passedCheapFilter: passedFilter,
            // A signal that fails the free cheap filter is stored (for visibility/tuning, section 2) but marked irrelevant immediately -- it never sits around as "new" waiting for an AI pass it will never get, which is the whole point of the cheap filter (section 12 cost control).
            status: passedFilter ? "new" : "irrelevant",
          })
          .onConflictDoNothing({ target: signals.dedupeKey })
          .returning({ id: signals.id });

        if (inserted.length > 0) {
          result.inserted += 1;
          if (passedFilter) result.passedFilter += 1;
        }
      }
    } catch (error) {
      result.errors.push(`${provider.key}: ${error instanceof Error ? error.message : "onbekende fout"}`);
    }
  }

  return result;
}
