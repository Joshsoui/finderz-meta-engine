import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { signalProviderState, signals } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business-profile";
import { buildDedupeKey } from "@/lib/radar/dedupe";
import { passesCheapFilter } from "@/lib/radar/cheap-filter";
import { SIGNAL_PROVIDERS } from "@/lib/radar/providers";
import type { SignalProvider } from "@/lib/radar/types";

export type RadarScanResult = {
  scanned: number;
  inserted: number;
  passedFilter: number;
  errors: string[];
  skippedProviders: string[];
  /** Providers that are configured but not yet due per their own scanFrequencyMinutes (section 1) -- distinct from skippedProviders, which is "not configured at all". */
  notDueProviders: string[];
};

/** True once a provider's own scanFrequencyMinutes has elapsed since its last run (or it has never run) -- the always-on scheduling check (section 1). */
async function isProviderDue(provider: SignalProvider): Promise<boolean> {
  const db = await getDb();
  const [state] = await db.select().from(signalProviderState).where(eq(signalProviderState.provider, provider.key)).limit(1);
  if (!state?.lastRunAt) return true;
  const elapsedMinutes = (Date.now() - new Date(state.lastRunAt).getTime()) / (60 * 1000);
  return elapsedMinutes >= provider.scanFrequencyMinutes;
}

async function recordProviderRun(providerKey: string, scanned: number, inserted: number, error: string | null) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db
    .insert(signalProviderState)
    .values({ provider: providerKey, lastRunAt: now, lastRunScanned: scanned, lastRunInserted: inserted, lastError: error })
    .onConflictDoUpdate({
      target: signalProviderState.provider,
      set: { lastRunAt: now, lastRunScanned: scanned, lastRunInserted: inserted, lastError: error },
    });
}

/**
 * One Radar scan cycle (section 1/2/11): for each provider that is
 * configured AND due (per its own scanFrequencyMinutes, unless `force` is
 * set -- the manual "Scan nu" button), collect, normalize, dedupe against
 * what's already stored, then run the free cheap filter. Deep AI
 * opportunity scoring is a separate step (lib/opportunity-engine.ts),
 * triggered on whatever passed the filter here -- kept apart so a scan
 * never itself spends AI budget. Meant to be called by a frequent cron
 * tick (every 10 minutes) so this app behaves as always-on monitoring
 * without every provider re-running on every tick.
 */
export async function runRadarScan(options: { force?: boolean } = {}): Promise<RadarScanResult> {
  const db = await getDb();
  const profile = await getBusinessProfile();

  const result: RadarScanResult = { scanned: 0, inserted: 0, passedFilter: 0, errors: [], skippedProviders: [], notDueProviders: [] };

  for (const provider of SIGNAL_PROVIDERS) {
    if (!provider.isConfigured()) {
      result.skippedProviders.push(provider.key);
      continue;
    }
    if (!options.force && !(await isProviderDue(provider))) {
      result.notDueProviders.push(provider.key);
      continue;
    }

    let providerScanned = 0;
    let providerInserted = 0;
    try {
      const fetched = await provider.fetchSignals(profile);
      providerScanned = fetched.length;
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
          providerInserted += 1;
          if (passedFilter) result.passedFilter += 1;
        }
      }
      await recordProviderRun(provider.key, providerScanned, providerInserted, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "onbekende fout";
      result.errors.push(`${provider.key}: ${message}`);
      await recordProviderRun(provider.key, providerScanned, providerInserted, message);
    }
  }

  return result;
}
