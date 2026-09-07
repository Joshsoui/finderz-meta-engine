import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";

type UpdateCampaignInput = {
  status?: "draft" | "live" | "attention" | "paused" | "completed";
  maxBudget?: number;
  spend?: number;
  primaryText?: string;
  headline?: string;
  description?: string;
  usps?: [string, string, string];
  backgroundImageUrl?: string;
  logoImageUrl?: string;
  metaCampaignId?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = (await request.json()) as UpdateCampaignInput;

    const update: Partial<typeof campaigns.$inferInsert> = { updatedAt: new Date().toISOString() };
    if (input.status) update.status = input.status;
    if (Number.isFinite(input.maxBudget)) update.maxBudgetCents = Math.round(input.maxBudget! * 100);
    if (Number.isFinite(input.spend)) update.spentCents = Math.round(input.spend! * 100);
    if (input.primaryText) update.primaryText = input.primaryText;
    if (input.headline) update.headline = input.headline;
    if (input.description) update.descriptionText = input.description;
    if (input.usps && input.usps.length === 3) update.uspsJson = JSON.stringify(input.usps);
    if (input.backgroundImageUrl) update.backgroundImageUrl = input.backgroundImageUrl;
    if (input.logoImageUrl) update.logoImageUrl = input.logoImageUrl;
    if (input.metaCampaignId) update.metaCampaignId = input.metaCampaignId;

    const db = await getDb();
    const [campaign] = await db.update(campaigns).set(update).where(eq(campaigns.id, id)).returning();
    if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });

    return Response.json({ campaign });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Campaign could not be updated" }, { status: 500 });
  }
}
