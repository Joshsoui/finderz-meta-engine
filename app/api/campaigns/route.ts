import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";
import { generateCampaign, type VacancyInput } from "@/lib/campaign-engine";

type CreateCampaignInput = VacancyInput & {
  usps?: [string, string, string];
  copy?: { primaryText: string; headline: string; description: string };
  backgroundPrompt?: string;
  backgroundImageUrl?: string;
  logoImageUrl?: string;
  otysVacancyId?: string;
  /** Set when importing a campaign that already exists in Ads Manager (made outside this platform) instead of creating a fresh one. */
  metaCampaignId?: string;
  /** The real campaign's effective_status from Meta at import time, used to seed our own status. */
  importedEffectiveStatus?: string;
  /** The real cumulative spend already on this campaign at import time, so budget tracking starts accurate instead of at 0 until the next monitor cycle. */
  importedSpentCents?: number;
};

const STATUS_FROM_EFFECTIVE_STATUS: Record<string, "live" | "paused"> = { ACTIVE: "live", PAUSED: "paused" };

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.select().from(campaigns).orderBy(desc(campaigns.updatedAt)).limit(100);
    return Response.json({ campaigns: rows });
  } catch (error) {
    return errorResponse(error, "Campaigns unavailable");
  }
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as Partial<CreateCampaignInput>;
    if (!input.title?.trim() || !input.location?.trim() || !input.description?.trim() || !Number.isFinite(input.fee) || Number(input.fee) <= 0) {
      return Response.json({ error: "Complete vacancy data and a positive fee are required" }, { status: 400 });
    }
    const vacancy: VacancyInput = {
      title: input.title,
      location: input.location,
      salary: input.salary,
      description: input.description,
      fee: Number(input.fee),
      targetLeads: input.targetLeads,
      durationDays: input.durationDays,
    };
    const generated = generateCampaign(vacancy);
    const usps = input.usps && input.usps.length === 3 ? input.usps : generated.usps;
    const copy = input.copy ?? generated.copy;
    const backgroundPrompt = input.backgroundPrompt ?? generated.creative.backgroundPrompt;

    const db = await getDb();
    const isImport = Boolean(input.metaCampaignId);
    if (isImport) {
      const [existing] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.metaCampaignId, input.metaCampaignId!)).limit(1);
      if (existing) return Response.json({ error: "Deze campagne is al geïmporteerd" }, { status: 400 });
    }
    const status = isImport ? (STATUS_FROM_EFFECTIVE_STATUS[input.importedEffectiveStatus ?? ""] ?? "attention") : "draft";

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const [campaign] = await db.insert(campaigns).values({
      id,
      title: vacancy.title.trim(),
      location: vacancy.location.trim(),
      salary: vacancy.salary?.trim() || "",
      description: vacancy.description.trim(),
      status,
      feeCents: Math.round(vacancy.fee * 100),
      maxBudgetCents: Math.round(generated.maxBudget * 100),
      spentCents: isImport ? Math.max(0, Math.round(input.importedSpentCents ?? 0)) : 0,
      targetCplCents: Math.round(generated.targetCpl * 100),
      campaignDurationDays: generated.durationDays,
      primaryText: copy.primaryText,
      headline: copy.headline,
      descriptionText: copy.description,
      uspsJson: JSON.stringify(usps),
      creativePrompt: backgroundPrompt,
      backgroundImageUrl: input.backgroundImageUrl,
      logoImageUrl: input.logoImageUrl,
      otysVacancyId: input.otysVacancyId?.trim() || undefined,
      metaCampaignId: input.metaCampaignId,
      liveSince: isImport && status === "live" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return Response.json({ campaign, generated }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Campaign could not be created");
  }
}
