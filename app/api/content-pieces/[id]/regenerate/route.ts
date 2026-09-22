import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contentPieces } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";
import type { ContentChannel } from "@/lib/content-channels";
import { generateContentForChannel } from "@/lib/content-engine";

/** Section 8's "Regenerate" action: re-runs generation for the same opportunity+channel and replaces this piece, rather than leaving old drafts behind. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDb();
    const [existing] = await db.select().from(contentPieces).where(eq(contentPieces.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Content niet gevonden" }, { status: 404 });

    const result = await generateContentForChannel(existing.opportunityId, existing.channel as ContentChannel);
    if ("error" in result) return Response.json({ error: result.error }, { status: 400 });

    await db.delete(contentPieces).where(eq(contentPieces.id, id));

    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Content kon niet opnieuw worden gegenereerd");
  }
}
