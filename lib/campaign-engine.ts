export const MAX_BUDGET_SHARE = 0.2;

/** Minimum hours between two automatic budget increases on the same campaign -- without this, a campaign that stays healthy for hours would get scaled every 15-minute monitor cycle and compound far past the intended "15% at a time". */
export const BUDGET_SCALE_COOLDOWN_HOURS = 24;

/**
 * Default expected campaign duration (days), used to seed a new campaign's
 * own campaignDurationDays -- most vacancy campaigns here run 1-2 weeks, so
 * 10 splits that range; a long-running exception is expected to have its
 * own, much larger value set explicitly on the campaign.
 */
export const DEFAULT_CAMPAIGN_DURATION_DAYS = 10;

/** Meta rejects a daily_budget below its own per-currency/objective minimum; this is a conservative floor so the app fails predictably rather than silently proposing an unviable budget. Meta's actual minimum may be lower or higher -- the first real API call will confirm. */
export const MIN_DAILY_BUDGET_CENTS = 500;

/**
 * Derives the daily_budget (cents) Meta needs from the campaign's lifetime
 * cap (maxBudget, 20% of the fee) and its expected duration. Meta has no
 * concept of a plain lifetime cap for this campaign type, so without this a
 * naive integration would hand Meta the *entire* lifetime cap as its daily
 * spend target -- exhausting the whole budget in a single day instead of
 * pacing it across the campaign's real run.
 */
export function deriveDailyBudgetCents(maxBudgetCents: number, durationDays: number): number {
  return Math.max(Math.ceil(maxBudgetCents / Math.max(durationDays, 1)), MIN_DAILY_BUDGET_CENTS);
}

/** How often (hours) a long-running campaign gets a periodic "check the creative is still fresh" nudge, independent of whether reactive fatigue (frequency/CTR) has fired yet -- a huge audience can take a long time to hit those thresholds even though the copy has gone stale. */
export const PERIODIC_CREATIVE_CHECK_HOURS = 24 * 7;

export type VacancyInput = {
  title: string;
  location: string;
  salary?: string;
  description: string;
  fee: number;
  targetLeads?: number;
  durationDays?: number;
};

export type CampaignMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  frequency: number;
  targetCpl: number;
  maxBudget: number;
  /** Cumulative leads a recruiter has manually marked as usable/qualified, out of `leads`. Optional: unknown until someone has reviewed the leads. */
  qualityLeads?: number;
  /** Hours since the last automatic budget increase on this campaign. Undefined/omitted means it has never been scaled. */
  hoursSinceLastBudgetScale?: number;
  /** Hours since the periodic creative-freshness nudge last fired (or since the campaign went live, if it never has). Undefined means the campaign isn't live yet. */
  hoursSinceLastCreativeCheck?: number;
};

export const MIN_LEAD_QUALITY_RATIO = 0.5;

export type OptimizationDecision = {
  rule: string;
  severity: "info" | "attention" | "critical";
  action: "keep_running" | "scale_budget" | "refresh_creative" | "pause";
  recommendation: string;
  budgetChangePercent: number;
};

function sentence(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.endsWith(".") ? trimmed : trimmed + ".";
}

export function generateCampaign(input: VacancyInput) {
  const maxBudget = Math.round(input.fee * MAX_BUDGET_SHARE * 100) / 100;
  const targetLeads = Math.max(input.targetLeads ?? 28, 1);
  const targetCpl = Math.round((maxBudget / targetLeads) * 100) / 100;
  const durationDays = Math.max(input.durationDays ?? DEFAULT_CAMPAIGN_DURATION_DAYS, 1);
  const salary = input.salary?.trim() || "Goed salaris";
  const usps = [salary, "Uitzicht op vast contract", "Persoonlijke begeleiding"] as const;

  return {
    maxBudget,
    targetCpl,
    durationDays,
    audience: {
      region: input.location.trim(),
      ageRange: "23–55",
      strategy: "Breed targeten binnen de regio; Meta optimaliseert op leadkwaliteit.",
      excluded: ["Bestaande medewerkers", "Recent geplaatste kandidaten"],
    },
    copy: {
      primaryText:
        "Toe aan een nieuwe stap als " +
        input.title.trim() +
        " in " +
        input.location.trim() +
        "? " +
        sentence(input.description).slice(0, 220) +
        " Laat eenvoudig je gegevens achter; we nemen vrijblijvend contact met je op.",
      headline: "Toe aan een nieuwe stap als " + input.title.trim() + " in " + input.location.trim() + "?",
      description: salary + " · Bekijk de vacature",
    },
    usps,
    creative: {
      formats: ["1:1", "1.91:1", "9:16"],
      backgroundPrompt:
        "Realistische recruitmentfoto van een " +
        input.title.trim().toLowerCase() +
        " tijdens het werk in " +
        input.location.trim() +
        ". Natuurlijk licht, geloofwaardige Nederlandse werkomgeving, volwassen professionele uitstraling, medewerker centraal en volledig in beeld. Geen logo, letters, watermerk of AI-achtige vervorming.",
      overlay: {
        logo: "Finderz Keeperz linksboven",
        title: input.title.trim(),
        location: input.location.trim(),
        usps,
        cta: "Solliciteer nu",
        color: "#006192",
      },
    },
  };
}

export function evaluateCampaign(metrics: CampaignMetrics): OptimizationDecision {
  const cpl = metrics.leads > 0 ? metrics.spend / metrics.leads : metrics.spend;
  const ctr = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0;

  if (metrics.spend >= metrics.maxBudget) {
    return {
      rule: "budget_ceiling",
      severity: "critical",
      action: "pause",
      recommendation: "Ik heb deze campagne stopgezet: het volledige budget is op. Zo blijven we netjes binnen de afgesproken 20% van de fee.",
      budgetChangePercent: 0,
    };
  }
  if (metrics.impressions >= 2000 && metrics.leads === 0 && metrics.spend >= Math.max(metrics.targetCpl * 1.5, 100)) {
    return {
      rule: "no_leads_after_spend",
      severity: "critical",
      action: "pause",
      recommendation: "Ik heb deze campagne stopgezet: genoeg mensen hebben 'm gezien, maar er kwamen geen leads binnen. De tekst of het beeld sluit waarschijnlijk niet goed genoeg aan — tijd voor een andere insteek.",
      budgetChangePercent: 0,
    };
  }
  if (metrics.leads >= 3 && cpl > metrics.targetCpl * 1.5) {
    return {
      rule: "cpl_above_limit",
      severity: "critical",
      action: "pause",
      recommendation: "Ik heb deze campagne stopgezet: een lead kost nu een stuk meer dan we willen. Laten we een ander beeld of een andere doelgroep proberen.",
      budgetChangePercent: 0,
    };
  }
  if (metrics.frequency >= 2.8 || (metrics.impressions >= 2000 && ctr < 0.8)) {
    return {
      rule: "creative_fatigue",
      severity: "attention",
      action: "refresh_creative",
      recommendation: "De doelgroep heeft deze campagne al vaak gezien en reageert minder. Tijd voor een fris beeld en nieuwe tekst — dat kun je hieronder met één klik laten maken.",
      budgetChangePercent: 0,
    };
  }
  if (metrics.leads >= 3 && cpl <= metrics.targetCpl) {
    if (Number.isFinite(metrics.qualityLeads) && metrics.qualityLeads! / metrics.leads < MIN_LEAD_QUALITY_RATIO) {
      return {
        rule: "low_lead_quality",
        severity: "attention",
        action: "keep_running",
        recommendation: "De kosten per lead zijn prima, maar te veel leads blijken niet bruikbaar. Ik verhoog het budget nog niet — check eerst de doelgroep of het leadformulier.",
        budgetChangePercent: 0,
      };
    }
    if (metrics.hoursSinceLastBudgetScale !== undefined && metrics.hoursSinceLastBudgetScale < BUDGET_SCALE_COOLDOWN_HOURS) {
      return {
        rule: "budget_scale_cooldown",
        severity: "info",
        action: "keep_running",
        recommendation: `Gaat nog steeds goed, maar ik heb het budget minder dan ${BUDGET_SCALE_COOLDOWN_HOURS} uur geleden al verhoogd. Ik wacht even voordat ik dat nog een keer voorstel.`,
        budgetChangePercent: 0,
      };
    }
    return {
      rule: "healthy_cpl",
      severity: "info",
      action: "scale_budget",
      recommendation: "Dit gaat goed! Leads komen binnen tegen een prima prijs. Mag ik het dagbudget met 15% verhogen, zodat we er meer uit halen?",
      budgetChangePercent: 15,
    };
  }
  if (metrics.hoursSinceLastCreativeCheck !== undefined && metrics.hoursSinceLastCreativeCheck >= PERIODIC_CREATIVE_CHECK_HOURS) {
    return {
      rule: "periodic_creative_check",
      severity: "info",
      action: "keep_running",
      recommendation: `Deze campagne draait al ${Math.floor(metrics.hoursSinceLastCreativeCheck / 24)} dagen zonder duidelijke tekenen van sleet. Geen actie nodig, maar bij een langere looptijd is het slim om af en toe zelf te checken of beeld en tekst nog fris aanvoelen.`,
      budgetChangePercent: 0,
    };
  }
  return {
    rule: "learning",
    severity: "info",
    action: "keep_running",
    recommendation: "Nog te vroeg om iets te zeggen. Ik verzamel meer data en kom terug zodra er genoeg te zien is.",
    budgetChangePercent: 0,
  };
}
