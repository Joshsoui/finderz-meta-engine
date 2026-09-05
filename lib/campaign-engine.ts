export const MAX_BUDGET_SHARE = 0.2;

export type VacancyInput = {
  title: string;
  location: string;
  salary?: string;
  description: string;
  fee: number;
  targetLeads?: number;
};

export type CampaignMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  frequency: number;
  targetCpl: number;
  maxBudget: number;
};

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
  const salary = input.salary?.trim() || "Goed salaris";
  const usps = [salary, "Uitzicht op vast contract", "Persoonlijke begeleiding"] as const;

  return {
    maxBudget,
    targetCpl,
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
      headline: input.title.trim() + " | " + input.location.trim(),
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
        ". Natuurlijk licht, geloofwaardige Nederlandse werkomgeving, volwassen professionele uitstraling, ruimte links voor tekst. Geen logo, letters, watermerk of AI-achtige vervorming.",
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
      recommendation: "Budgetplafond bereikt. Pauzeer de campagne om de maximale 20% van de fee niet te overschrijden.",
      budgetChangePercent: 0,
    };
  }
  if (metrics.impressions >= 2000 && metrics.leads === 0 && metrics.spend >= Math.max(metrics.targetCpl * 1.5, 100)) {
    return {
      rule: "no_leads_after_spend",
      severity: "critical",
      action: "pause",
      recommendation: "Voldoende bereik en spend zonder leads. Pauzeer en herbouw propositie en formulier.",
      budgetChangePercent: 0,
    };
  }
  if (metrics.leads >= 3 && cpl > metrics.targetCpl * 1.5) {
    return {
      rule: "cpl_above_limit",
      severity: "critical",
      action: "pause",
      recommendation: "CPL ligt meer dan 50% boven het doel. Pauzeer en vervang creative of doelgroepaanpak.",
      budgetChangePercent: 0,
    };
  }
  if (metrics.frequency >= 2.8 || (metrics.impressions >= 2000 && ctr < 0.8)) {
    return {
      rule: "creative_fatigue",
      severity: "attention",
      action: "refresh_creative",
      recommendation: "Creative fatigue of lage CTR gedetecteerd. Genereer een nieuwe achtergrond en teksthoek.",
      budgetChangePercent: 0,
    };
  }
  if (metrics.leads >= 3 && cpl <= metrics.targetCpl) {
    return {
      rule: "healthy_cpl",
      severity: "info",
      action: "scale_budget",
      recommendation: "Campagne presteert binnen de doel-CPL. Verhoog het dagbudget gecontroleerd met maximaal 15%.",
      budgetChangePercent: 15,
    };
  }
  return {
    rule: "learning",
    severity: "info",
    action: "keep_running",
    recommendation: "Nog onvoldoende bewijs voor een wijziging. Laat de campagne doorlopen en beoordeel opnieuw na extra bereik.",
    budgetChangePercent: 0,
  };
}
