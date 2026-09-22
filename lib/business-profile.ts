import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { businessProfiles, campaigns, companies, pipelineVacancies } from "@/db/schema";

/**
 * Finderz Keeperz is the first company this runs for, but nothing here is
 * hardcoded to it beyond this default id -- a later company gets its own
 * companyId and reuses every function below unchanged (section 14).
 */
export const DEFAULT_COMPANY_ID = "finderzkeeperz";

export type BusinessProfile = {
  companyId: string;
  name: string;
  website: string;
  industry: string;
  services: string[];
  targetAudiences: string[];
  regions: string[];
  toneOfVoice: string;
  usps: string[];
  socialChannels: Record<string, string>;
  customerSectors: string[];
  keywords: string[];
};

/** Sensible starting point shown until someone fills in the real profile via Instellingen -- never invented business facts, just an empty, editable shape (name/website/regions are the only fields actually known from this codebase, everything else stays blank rather than guessed). */
function defaultProfile(companyId: string): BusinessProfile {
  return {
    companyId,
    name: "Finderz Keeperz",
    website: "https://www.finderzkeeperz.nl",
    industry: "Werving & selectie",
    services: [],
    targetAudiences: [],
    regions: ["Noord-Holland"],
    toneOfVoice: "",
    usps: [],
    socialChannels: {},
    customerSectors: [],
    keywords: [],
  };
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseJsonRecord(value: string | null | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Every company the Radar/Opportunity Engine should match signals against
 * (section 6/8: "MATCH TO COMPANY" is an explicit step, and Company #2
 * must slot in without touching this code). Falls back to just
 * DEFAULT_COMPANY_ID when no company has been onboarded via /instellingen
 * yet, so the pipeline still works before a real companies row exists.
 */
export async function listCompanyIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select({ id: companies.id }).from(companies);
  return rows.length > 0 ? rows.map((row) => row.id) : [DEFAULT_COMPANY_ID];
}

/** Reads the stored profile, falling back to defaultProfile() when nothing has been saved yet -- same "read with fallback, upsert on save" pattern as lib/portfolio-budget.ts. */
export async function getBusinessProfile(companyId: string = DEFAULT_COMPANY_ID): Promise<BusinessProfile> {
  const db = await getDb();
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const [profile] = await db.select().from(businessProfiles).where(eq(businessProfiles.companyId, companyId)).limit(1);

  const fallback = defaultProfile(companyId);
  if (!company && !profile) return fallback;

  return {
    companyId,
    name: company?.name || fallback.name,
    website: company?.website || fallback.website,
    industry: company?.industry || fallback.industry,
    services: profile ? parseJsonArray(profile.servicesJson) : fallback.services,
    targetAudiences: profile ? parseJsonArray(profile.targetAudiencesJson) : fallback.targetAudiences,
    regions: profile && parseJsonArray(profile.regionsJson).length > 0 ? parseJsonArray(profile.regionsJson) : fallback.regions,
    toneOfVoice: profile?.toneOfVoice || fallback.toneOfVoice,
    usps: profile ? parseJsonArray(profile.uspsJson) : fallback.usps,
    socialChannels: profile ? parseJsonRecord(profile.socialChannelsJson) : fallback.socialChannels,
    customerSectors: profile ? parseJsonArray(profile.customerSectorsJson) : fallback.customerSectors,
    keywords: profile ? parseJsonArray(profile.keywordsJson) : fallback.keywords,
  };
}

export async function saveBusinessProfile(input: BusinessProfile): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  await db
    .insert(companies)
    .values({ id: input.companyId, name: input.name, website: input.website, industry: input.industry, updatedAt: now })
    .onConflictDoUpdate({
      target: companies.id,
      set: { name: input.name, website: input.website, industry: input.industry, updatedAt: now },
    });

  await db
    .insert(businessProfiles)
    .values({
      id: input.companyId,
      companyId: input.companyId,
      servicesJson: JSON.stringify(input.services),
      targetAudiencesJson: JSON.stringify(input.targetAudiences),
      regionsJson: JSON.stringify(input.regions),
      toneOfVoice: input.toneOfVoice,
      uspsJson: JSON.stringify(input.usps),
      socialChannelsJson: JSON.stringify(input.socialChannels),
      customerSectorsJson: JSON.stringify(input.customerSectors),
      keywordsJson: JSON.stringify(input.keywords),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      // id (the primary key) is used here, not companyId -- companyId has no unique constraint of its own, it's just set equal to id at insert time (one profile per company, id === companyId).
      target: businessProfiles.id,
      set: {
        servicesJson: JSON.stringify(input.services),
        targetAudiencesJson: JSON.stringify(input.targetAudiences),
        regionsJson: JSON.stringify(input.regions),
        toneOfVoice: input.toneOfVoice,
        uspsJson: JSON.stringify(input.usps),
        socialChannelsJson: JSON.stringify(input.socialChannels),
        customerSectorsJson: JSON.stringify(input.customerSectors),
        keywordsJson: JSON.stringify(input.keywords),
        updatedAt: now,
      },
    });
}

export type ActiveVacancyContext = {
  campaignId: string;
  title: string;
  location: string;
  salary: string;
  status: string;
};

/**
 * The "actieve vacatures / functiegroepen / locaties / salarissen" context
 * the spec asks the profile to know -- read live from the existing
 * campaigns + pipelineVacancies tables rather than duplicated into the
 * profile (section 1's "voorkom dubbele opslag").
 */
export async function getActiveVacancyContext(): Promise<ActiveVacancyContext[]> {
  const db = await getDb();
  const liveCampaigns = await db
    .select({ id: campaigns.id, title: campaigns.title, location: campaigns.location, salary: campaigns.salary, status: campaigns.status })
    .from(campaigns)
    .where(inArray(campaigns.status, ["live", "attention"]))
    .orderBy(desc(campaigns.updatedAt))
    .limit(100);

  const openPipeline = await db
    .select({ id: pipelineVacancies.id, title: pipelineVacancies.title, location: pipelineVacancies.location, salary: pipelineVacancies.salary })
    .from(pipelineVacancies)
    .where(eq(pipelineVacancies.status, "new"))
    .orderBy(desc(pipelineVacancies.updatedAt))
    .limit(100);

  return [
    ...liveCampaigns.map((row) => ({ campaignId: row.id, title: row.title, location: row.location, salary: row.salary, status: row.status })),
    ...openPipeline.map((row) => ({ campaignId: row.id, title: row.title, location: row.location, salary: row.salary, status: "pipeline" })),
  ];
}
