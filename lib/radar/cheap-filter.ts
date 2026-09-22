import type { BusinessProfile } from "@/lib/business-profile";
import type { NormalizedSignal } from "@/lib/radar/types";

/**
 * The free, rule-based gate from section 12's pipeline ("collect -> rule/filter
 * -> deduplicate -> cheap relevance filter -> only promising signals -> deeper
 * AI analysis"). Runs on every newly-inserted signal, costs nothing, and
 * decides whether a signal is even worth the AI's opportunity-scoring pass.
 * Not just a formality: even signals from an already-targeted search query
 * can be weak, generic matches, so this re-checks against the profile's own
 * terms rather than trusting the query that found it.
 */
export function passesCheapFilter(signal: NormalizedSignal, profile: BusinessProfile): boolean {
  const haystack = `${signal.title} ${signal.summary}`.toLowerCase();

  const terms = [
    ...profile.keywords,
    ...profile.regions,
    ...profile.customerSectors,
    profile.industry,
  ].map((term) => term.toLowerCase().trim()).filter(Boolean);

  // A signal built from real regional/economic data (CBS) or already scoped
  // to a named region by its own provider is inherently on-topic -- these
  // categories skip the keyword re-check rather than risk a false negative
  // on a genuinely relevant but keyword-sparse computed signal.
  if (signal.category === "labour_market") return true;
  if (signal.category === "regional" && signal.regions.length > 0) return true;

  if (terms.length === 0) return true; // No profile terms configured yet -- don't silently drop everything.

  return terms.some((term) => haystack.includes(term));
}
