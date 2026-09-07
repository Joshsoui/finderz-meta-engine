import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pipelineVacancies } from "@/db/schema";

type UpdatePipelineInput = {
  status?: "new" | "campaign_created" | "dismissed";
  campaignId?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = (await request.json()) as UpdatePipelineInput;

    const update: Partial<typeof pipelineVacancies.$inferInsert> = { updatedAt: new Date().toISOString() };
    if (input.status) update.status = input.status;
    if (input.campaignId) update.campaignId = input.campaignId;

    const db = await getDb();
    const [vacancy] = await db.update(pipelineVacancies).set(update).where(eq(pipelineVacancies.id, id)).returning();
    if (!vacancy) return Response.json({ error: "Vacature niet gevonden" }, { status: 404 });

    return Response.json({ vacancy });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Vacature kon niet worden bijgewerkt" }, { status: 500 });
  }
}
