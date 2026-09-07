import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pipelineVacancies } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

const PIPELINE_STATUSES = ["new", "campaign_created", "dismissed"] as const;

type UpdatePipelineInput = {
  status?: string;
  campaignId?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = (await request.json()) as UpdatePipelineInput;
    if (input.status && !PIPELINE_STATUSES.includes(input.status as typeof PIPELINE_STATUSES[number])) {
      return Response.json({ error: "Invalid status value" }, { status: 400 });
    }

    const update: Partial<typeof pipelineVacancies.$inferInsert> = { updatedAt: new Date().toISOString() };
    if (input.status) update.status = input.status as typeof PIPELINE_STATUSES[number];
    if (input.campaignId) update.campaignId = input.campaignId;

    const db = await getDb();
    const [vacancy] = await db.update(pipelineVacancies).set(update).where(eq(pipelineVacancies.id, id)).returning();
    if (!vacancy) return Response.json({ error: "Vacature niet gevonden" }, { status: 404 });

    return Response.json({ vacancy });
  } catch (error) {
    return errorResponse(error, "Vacature kon niet worden bijgewerkt");
  }
}
