export type CampaignStatus = "live" | "attention" | "paused" | "draft" | "completed";

export type CampaignRow = {
  id: string;
  title: string;
  location: string;
  salary: string;
  description: string;
  status: CampaignStatus;
  feeCents: number;
  maxBudgetCents: number;
  spentCents: number;
  targetCplCents: number;
  primaryText: string;
  headline: string;
  descriptionText: string;
  uspsJson: string;
  creativePrompt: string;
  backgroundImageUrl: string | null;
  logoImageUrl: string | null;
  otysVacancyId: string | null;
};

export type Campaign = {
  id: string;
  title: string;
  location: string;
  salary: string;
  status: CampaignStatus;
  fee: number;
  maxBudget: number;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  targetCpl: number;
  usps: [string, string, string];
  primaryText: string;
  headline: string;
  adDescription?: string;
  vacancyDescription?: string;
  backgroundPrompt?: string;
  backgroundImage?: string;
  logoImage?: string;
  otysVacancyId?: string;
  recommendation: string;
  nextAction: string;
};

export function recommendationFor(status: CampaignStatus): { recommendation: string; nextAction: string } {
  switch (status) {
    case "draft":
      return { recommendation: "Concept staat klaar. Controleer beeld en teksten voordat je publiceert naar Meta.", nextAction: "Controleer & publiceer" };
    case "paused":
      return { recommendation: "Campagne staat gepauzeerd.", nextAction: "Herstart campagne" };
    case "attention":
      return { recommendation: "Deze campagne heeft aandacht nodig. Bekijk de prestaties.", nextAction: "Bekijk campagne" };
    case "completed":
      return { recommendation: "Campagne is afgerond.", nextAction: "Bekijk resultaten" };
    default:
      return { recommendation: "Nog onvoldoende data voor een automatische aanbeveling.", nextAction: "Bekijk prestaties" };
  }
}

export function rowToCampaign(row: CampaignRow): Campaign {
  const { recommendation, nextAction } = recommendationFor(row.status);
  let usps: [string, string, string] = ["", "", ""];
  try {
    const parsed = JSON.parse(row.uspsJson);
    if (Array.isArray(parsed) && parsed.length === 3) usps = parsed as [string, string, string];
  } catch {
    // keep the empty fallback
  }

  return {
    id: row.id,
    title: row.title,
    location: row.location,
    salary: row.salary || "Salaris in overleg",
    status: row.status,
    fee: row.feeCents / 100,
    maxBudget: row.maxBudgetCents / 100,
    spend: row.spentCents / 100,
    impressions: 0,
    clicks: 0,
    leads: 0,
    targetCpl: row.targetCplCents / 100,
    usps,
    primaryText: row.primaryText,
    headline: row.headline,
    adDescription: row.descriptionText,
    vacancyDescription: row.description,
    backgroundPrompt: row.creativePrompt,
    backgroundImage: row.backgroundImageUrl ?? undefined,
    logoImage: row.logoImageUrl ?? undefined,
    otysVacancyId: row.otysVacancyId ?? undefined,
    recommendation,
    nextAction,
  };
}

export function statusLabel(status: CampaignStatus) {
  if (status === "live") return "Presteert";
  if (status === "attention") return "Actie nodig";
  if (status === "paused") return "Gepauzeerd";
  if (status === "completed") return "Afgerond";
  return "Concept";
}
