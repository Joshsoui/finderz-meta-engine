import type { BusinessProfile } from "@/lib/business-profile";

/** One external signal, already shaped into the app's standard structure -- see db/schema.ts `signals` for the persisted form this maps onto. */
export type NormalizedSignal = {
  title: string;
  summary: string;
  source: string;
  sourceUrl?: string;
  publishedAt?: string;
  category: string;
  regions: string[];
  companies: string[];
  industries: string[];
  jobCategories: string[];
  keywords: string[];
  rawData?: unknown;
};

/**
 * A pluggable source of external signals (section 2). Every provider gets
 * the current BusinessProfile so it can build targeted queries (keywords,
 * regions, industry) instead of pulling in everything and filtering later
 * -- cheaper and more relevant from the start.
 */
export interface SignalProvider {
  /** Stable key, stored on each signal row (e.g. "news", "regional", "labour_market"). */
  key: string;
  label: string;
  /**
   * Always-on scheduling cadence (section 1): a single source of truth per
   * provider, checked against signal_provider_state.lastRunAt by
   * radar-sync so a frequent cron tick only actually runs the providers
   * that are due, not every provider on every tick. Configurable in the
   * sense that this is the one place to change it -- not (yet) editable
   * per-deploy without a code change.
   */
  scanFrequencyMinutes: number;
  /** True once this provider's required env vars (if any) are actually set -- providers needing a paid key return false and fetchSignals() is never called, rather than silently returning fake data. */
  isConfigured(): boolean;
  /** What's still needed to turn this on, shown in the Radar UI when isConfigured() is false. */
  missingConfigHint?: string;
  fetchSignals(profile: BusinessProfile): Promise<NormalizedSignal[]>;
}
