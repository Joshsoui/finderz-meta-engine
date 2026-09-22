/**
 * Section 5's timing intelligence: `score` on an opportunity row is the
 * AI's judgement at detection time and is NEVER mutated -- the "current"
 * score is always derived at read time from score, decayRatePerDay and how
 * long ago it was detected. This is what makes a breaking opportunity read
 * as much less urgent a day later without rewriting history.
 */
export function computeEffectiveScore(score: number, decayRatePerDay: number, detectedAt: string, now: Date = new Date()): number {
  const daysSinceDetected = Math.max(0, (now.getTime() - new Date(detectedAt).getTime()) / (24 * 60 * 60 * 1000));
  const decayed = score - decayRatePerDay * daysSinceDetected;
  return Math.max(0, Math.min(100, Math.round(decayed)));
}

export function isPastDeadline(optimalActionBeforeAt: string | null, now: Date = new Date()): boolean {
  if (!optimalActionBeforeAt) return false;
  return now.getTime() > new Date(optimalActionBeforeAt).getTime();
}
