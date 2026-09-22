import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contentPieces } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

/** Manual edit of a generated content piece (section 8's "Edit" action) -- replaces contentJson wholesale with whatever the review UI sends back. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { content?: Record<string, unknown> };
    if (!body.content || typeof body.content !== "object") return Response.json({ error: "content is verplicht" }, { status: 400 });

    const db = await getDb();
    const [existing] = await db.select().from(contentPieces).where(eq(contentPieces.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Content niet gevonden" }, { status: 404 });

    const now = new Date().toISOString();
    const [updated] = await db
      .update(contentPieces)
      .set({ contentJson: JSON.stringify(body.content), updatedAt: now })
      .where(eq(contentPieces.id, id))
      .returning();

    return Response.json({ contentPiece: updated });
  } catch (error) {
    return errorResponse(error, "Content kon niet worden bijgewerkt");
  }
}
