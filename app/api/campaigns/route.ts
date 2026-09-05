import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { generateCampaign, type VacancyInput } from "@/lib/campaign-engine";

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.select().from(campaigns).orderBy(desc(campaigns.updatedAt)).limit(100);
    return Response.json({ campaigns: rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Campaigns unavailable" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as VacancyInput;
    if (!input.title?.trim() || !input.location?.trim() || !input.description?.trim() || !Number.isFinite(input.fee) || input.fee <= 0) {
      return Response.json({ error: "Complete vacancy data and a positive fee are required" }, { status: 400 });
    }
    const generated = generateCampaign(input);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const db = await getDb();
    const [campaign] = await db.insert(campaigns).values({
      id,
      title: input.title.trim(),
      location: input.location.trim(),
      salary: input.salary?.trim() || "",
      description: input.description.trim(),
      status: "draft",
      feeCents: Math.round(input.fee * 100),
      maxBudgetCents: Math.round(generated.maxBudget * 100),
      targetCplCents: Math.round(generated.targetCpl * 100),
      primaryText: generated.copy.primaryText,
      headline: generated.copy.headline,
      descriptionText: generated.copy.description,
      uspsJson: JSON.stringify(generated.usps),
      creativePrompt: generated.creative.backgroundPrompt,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return Response.json({ campaign, generated }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Campaign could not be created" }, { status: 500 });
  }
}
