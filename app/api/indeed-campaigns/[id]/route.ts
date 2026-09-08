import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { indeedCampaigns } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

const STATUSES = ["active", "paused"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { status?: string };
    if (!body.status || !STATUSES.includes(body.status as typeof STATUSES[number])) {
      return Response.json({ error: "Invalid status value" }, { status: 400 });
    }

    const db = await getDb();
    const [campaign] = await db
      .update(indeedCampaigns)
      .set({ status: body.status as typeof STATUSES[number], updatedAt: new Date().toISOString() })
      .where(eq(indeedCampaigns.id, id))
      .returning();
    if (!campaign) return Response.json({ error: "Indeed-campagne niet gevonden" }, { status: 404 });

    return Response.json({ campaign });
  } catch (error) {
    return errorResponse(error, "Indeed-campagne kon niet worden bijgewerkt");
  }
}
