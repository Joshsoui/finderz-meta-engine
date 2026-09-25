import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, creativeVariants } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

const VARIANT_STATUSES = ["approved", "dismissed"] as const;

/**
 * Approving only ever writes to a variant's own row, plus -- when the
 * campaign is still a draft -- copies the new text onto the campaign itself,
 * since a draft has no live Meta ad or baked creative image yet to conflict
 * with. A live/attention/paused campaign's real ad is never touched here:
 * swapping its actual creative needs the full image-baking + Meta upload
 * flow (see ReplaceCreativeSheet), which is a deliberately separate,
 * explicit action -- approving a variant here just marks it ready to use.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  try {
    const { id, variantId } = await params;
    const body = (await request.json()) as { status?: string };
    if (!body.status || !VARIANT_STATUSES.includes(body.status as typeof VARIANT_STATUSES[number])) {
      return Response.json({ error: "status must be approved or dismissed" }, { status: 400 });
    }

    const db = await getDb();
    const [existing] = await db.select().from(creativeVariants).where(and(eq(creativeVariants.id, variantId), eq(creativeVariants.campaignId, id))).limit(1);
    if (!existing) return Response.json({ error: "Variant not found" }, { status: 404 });

    const [variant] = await db.update(creativeVariants).set({ status: body.status as "approved" | "dismissed" }).where(eq(creativeVariants.id, variantId)).returning();

    let appliedToCampaign = false;
    if (body.status === "approved") {
      const [campaign] = await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, id)).limit(1);
      if (campaign?.status === "draft") {
        await db
          .update(campaigns)
          .set({
            headline: existing.headline,
            primaryText: existing.primaryText,
            descriptionText: existing.descriptionText,
            uspsJson: existing.uspsJson,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(campaigns.id, id));
        appliedToCampaign = true;
      }
    }

    return Response.json({ variant, appliedToCampaign });
  } catch (error) {
    return errorResponse(error, "Variant kon niet worden bijgewerkt");
  }
}
