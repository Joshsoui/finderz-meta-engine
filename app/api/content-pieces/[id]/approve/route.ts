import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contentPieces, opportunities, opportunityFeedback } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

/**
 * Marks a content piece approved (section 8). MVP is shadow mode (section
 * 13): this never publishes anything itself -- it only moves the piece to
 * "approved"/"ready_to_publish" so a human can act on it outside the app,
 * or (for a meta_ad piece) use it to prefill the existing campaign creation
 * flow.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDb();
    const [piece] = await db.select().from(contentPieces).where(eq(contentPieces.id, id)).limit(1);
    if (!piece) return Response.json({ error: "Content niet gevonden" }, { status: 404 });

    const now = new Date().toISOString();
    const nextStatus = piece.channel === "meta_ad" ? "ready_to_publish" : "approved";
    const [updated] = await db.update(contentPieces).set({ status: nextStatus, updatedAt: now }).where(eq(contentPieces.id, id)).returning();
    await db.update(opportunities).set({ status: nextStatus, updatedAt: now }).where(eq(opportunities.id, piece.opportunityId));
    await db.insert(opportunityFeedback).values({ opportunityId: piece.opportunityId, action: "approved", createdAt: now });

    return Response.json({ contentPiece: updated });
  } catch (error) {
    return errorResponse(error, "Content kon niet worden goedgekeurd");
  }
}
