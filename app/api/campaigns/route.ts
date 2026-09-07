import { desc } from "drizzle-orm";
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
};

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
    };
    const generated = generateCampaign(vacancy);
    const usps = input.usps && input.usps.length === 3 ? input.usps : generated.usps;
    const copy = input.copy ?? generated.copy;
    const backgroundPrompt = input.backgroundPrompt ?? generated.creative.backgroundPrompt;

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const db = await getDb();
    const [campaign] = await db.insert(campaigns).values({
      id,
      title: vacancy.title.trim(),
      location: vacancy.location.trim(),
      salary: vacancy.salary?.trim() || "",
      description: vacancy.description.trim(),
      status: "draft",
      feeCents: Math.round(vacancy.fee * 100),
      maxBudgetCents: Math.round(generated.maxBudget * 100),
      targetCplCents: Math.round(generated.targetCpl * 100),
      primaryText: copy.primaryText,
      headline: copy.headline,
      descriptionText: copy.description,
      uspsJson: JSON.stringify(usps),
      creativePrompt: backgroundPrompt,
      backgroundImageUrl: input.backgroundImageUrl,
      logoImageUrl: input.logoImageUrl,
      otysVacancyId: input.otysVacancyId?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return Response.json({ campaign, generated }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Campaign could not be created");
  }
}
