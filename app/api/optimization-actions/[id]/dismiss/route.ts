import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { optimizationActions } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actionId = Number(id);
    if (!Number.isInteger(actionId)) return Response.json({ error: "Invalid action id" }, { status: 400 });

    const db = await getDb();
    const [action] = await db.select().from(optimizationActions).where(eq(optimizationActions.id, actionId)).limit(1);
    if (!action) return Response.json({ error: "Action not found" }, { status: 404 });
    if (action.status !== "pending") return Response.json({ error: "Deze actie is al verwerkt" }, { status: 400 });

    const [updated] = await db
      .update(optimizationActions)
      .set({ status: "dismissed" })
      .where(eq(optimizationActions.id, actionId))
      .returning();

    return Response.json({ action: updated });
  } catch (error) {
    return errorResponse(error, "Action could not be dismissed");
  }
}
