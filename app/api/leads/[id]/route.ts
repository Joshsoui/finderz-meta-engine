import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, leads } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

const QUALITY_VALUES = ["unrated", "good", "bad"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const leadId = Number(id);
    if (!Number.isInteger(leadId)) return Response.json({ error: "Invalid lead id" }, { status: 400 });

    const input = (await request.json()) as { quality?: string };
    if (!input.quality || !QUALITY_VALUES.includes(input.quality as typeof QUALITY_VALUES[number])) {
      return Response.json({ error: "Invalid quality value" }, { status: 400 });
    }

    const db = await getDb();
    const [existing] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!existing) return Response.json({ error: "Lead not found" }, { status: 404 });

    const [lead] = await db
      .update(leads)
      .set({ quality: input.quality as typeof QUALITY_VALUES[number] })
      .where(eq(leads.id, leadId))
      .returning();

    // Keep campaigns.qualityLeads (used by the automation engine's
    // low-lead-quality rule) as a live count of "good" leads for this
    // campaign, rather than a manually-typed number.
    const campaignLeads = await db.select({ quality: leads.quality }).from(leads).where(eq(leads.campaignId, existing.campaignId));
    const qualityLeads = campaignLeads.filter((row) => row.quality === "good").length;
    await db.update(campaigns).set({ qualityLeads }).where(eq(campaigns.id, existing.campaignId));

    return Response.json({ lead });
  } catch (error) {
    return errorResponse(error, "Lead could not be updated");
  }
}
