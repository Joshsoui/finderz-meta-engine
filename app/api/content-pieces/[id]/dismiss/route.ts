import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contentPieces } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDb();
    const [piece] = await db.select().from(contentPieces).where(eq(contentPieces.id, id)).limit(1);
    if (!piece) return Response.json({ error: "Content niet gevonden" }, { status: 404 });

    const [updated] = await db
      .update(contentPieces)
      .set({ status: "dismissed", updatedAt: new Date().toISOString() })
      .where(eq(contentPieces.id, id))
      .returning();

    return Response.json({ contentPiece: updated });
  } catch (error) {
    return errorResponse(error, "Content kon niet worden afgewezen");
  }
}
