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
  campaignDurationDays: number;
  metaCampaignId: string | null;
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
  campaignDurationDays: number;
  metaCampaignId?: string;
  recommendation: string;
  nextAction: string;
};

export function recommendationFor(status: CampaignStatus): { recommendation: string; nextAction: string } {
  switch (status) {
    case "draft":
      return { recommendation: "Deze campagne staat klaar. Check het beeld en de tekst hiernaast, en zeg het maar wanneer ik 'm live mag zetten.", nextAction: "Start deze campagne" };
    case "paused":
      return { recommendation: "Deze campagne staat stil. Zeg het maar zodra ik 'm weer mag opstarten.", nextAction: "Herstart deze campagne" };
    case "attention":
      return { recommendation: "Hier heb ik jouw hulp bij nodig — bekijk hieronder wat er speelt.", nextAction: "Bekijk wat er speelt" };
    case "completed":
      return { recommendation: "Deze vacature is ingevuld. Mooi resultaat!", nextAction: "Bekijk het resultaat" };
    default:
      return { recommendation: "Ik hou dit voor je in de gaten en grijp in zodra dat nodig is.", nextAction: "Bekijk hoe het gaat" };
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
    campaignDurationDays: row.campaignDurationDays,
    metaCampaignId: row.metaCampaignId ?? undefined,
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
