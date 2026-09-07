import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";
import { createMetaCampaign, getMetaCredentials, setMetaCampaignStatus } from "@/lib/meta-client";

const CAMPAIGN_STATUSES = ["draft", "live", "attention", "paused", "completed"] as const;

type UpdateCampaignInput = {
  status?: string;
  maxBudget?: number;
  spend?: number;
  primaryText?: string;
  headline?: string;
  description?: string;
  usps?: [string, string, string];
  backgroundImageUrl?: string;
  logoImageUrl?: string;
  finalCreativeImagesJson?: string;
  qualityLeads?: number;
  metaCampaignId?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = (await request.json()) as UpdateCampaignInput;
    if (input.status && !CAMPAIGN_STATUSES.includes(input.status as typeof CAMPAIGN_STATUSES[number])) {
      return Response.json({ error: "Invalid status value" }, { status: 400 });
    }

    const update: Partial<typeof campaigns.$inferInsert> = { updatedAt: new Date().toISOString() };
    if (input.status) update.status = input.status as typeof CAMPAIGN_STATUSES[number];
    if (Number.isFinite(input.maxBudget)) update.maxBudgetCents = Math.round(input.maxBudget! * 100);
    if (Number.isFinite(input.spend)) update.spentCents = Math.round(input.spend! * 100);
    if (input.primaryText) update.primaryText = input.primaryText;
    if (input.headline) update.headline = input.headline;
    if (input.description) update.descriptionText = input.description;
    if (input.usps && input.usps.length === 3) update.uspsJson = JSON.stringify(input.usps);
    if (input.backgroundImageUrl) update.backgroundImageUrl = input.backgroundImageUrl;
    if (input.logoImageUrl) update.logoImageUrl = input.logoImageUrl;
    if (input.finalCreativeImagesJson) update.finalCreativeImagesJson = input.finalCreativeImagesJson;
    if (Number.isFinite(input.qualityLeads)) update.qualityLeads = Math.max(0, Math.round(input.qualityLeads!));
    if (input.metaCampaignId) update.metaCampaignId = input.metaCampaignId;

    const db = await getDb();
    const [existing] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Campaign not found" }, { status: 404 });

    const credentials = getMetaCredentials();
    if (credentials && update.status === "live" && !existing.metaCampaignId) {
      // Going live for the first time: build the real Meta campaign (created
      // paused, per lib/meta-client.ts's safety default) and store its id so
      // insights polling and later pause/budget changes can reach it. Meta
      // gets the fully branded creative (logo, title banner, USPs, CTA baked
      // in by the client via lib/creative-renderer.ts) in all 3 placement
      // shapes, uploaded just before this request -- never the bare AI
      // background photo, and never just one crop stretched across every
      // placement.
      const imagesJson = update.finalCreativeImagesJson ?? existing.finalCreativeImagesJson;
      const images = imagesJson ? (JSON.parse(imagesJson) as Partial<Record<"1:1" | "1.91:1" | "9:16", string>>) : null;
      if (!images?.["1:1"] || !images["1.91:1"] || !images["9:16"]) {
        return Response.json({ error: "Genereer eerst de advertentie-creative (alle 3 formaten) voordat je live gaat" }, { status: 400 });
      }
      const origin = new URL(request.url).origin;
      const toAbsolute = (url: string) => (url.startsWith("http") ? url : `${origin}${url}`);
      const { metaCampaignId, metaLeadFormId } = await createMetaCampaign({
        title: existing.title,
        location: existing.location,
        dailyBudgetCents: update.maxBudgetCents ?? existing.maxBudgetCents,
        primaryText: update.primaryText ?? existing.primaryText,
        headline: update.headline ?? existing.headline,
        description: update.descriptionText ?? existing.descriptionText,
        imageUrls: { square: toAbsolute(images["1:1"]), landscape: toAbsolute(images["1.91:1"]), story: toAbsolute(images["9:16"]) },
      });
      update.metaCampaignId = metaCampaignId;
      update.metaLeadFormId = metaLeadFormId;
    } else if (credentials && existing.metaCampaignId && update.status === "paused") {
      await setMetaCampaignStatus(existing.metaCampaignId, "PAUSED");
    } else if (credentials && existing.metaCampaignId && update.status === "live") {
      await setMetaCampaignStatus(existing.metaCampaignId, "ACTIVE");
    }

    const [campaign] = await db.update(campaigns).set(update).where(eq(campaigns.id, id)).returning();
    return Response.json({ campaign });
  } catch (error) {
    return errorResponse(error, "Campaign could not be updated");
  }
}
