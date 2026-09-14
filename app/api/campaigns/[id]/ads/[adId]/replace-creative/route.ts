import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";
import { getMetaCredentials, replaceAdCreative } from "@/lib/meta-client";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; adId: string }> }) {
  try {
    const { id, adId } = await params;
    if (!getMetaCredentials()) return Response.json({ error: "Meta is not configured" }, { status: 400 });

    const body = (await request.json()) as { imageUrls?: { square?: string; landscape?: string; story?: string } };
    const { square, landscape, story } = body.imageUrls ?? {};
    if (!square || !landscape || !story) {
      return Response.json({ error: "imageUrls.square, .landscape en .story zijn alle drie verplicht" }, { status: 400 });
    }

    const db = await getDb();
    const [campaign] = await db.select({ title: campaigns.title }).from(campaigns).where(eq(campaigns.id, id)).limit(1);
    if (!campaign) return Response.json({ error: "Campagne niet gevonden" }, { status: 404 });

    const result = await replaceAdCreative(adId, { title: campaign.title, imageUrls: { square, landscape, story } });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error, "Advertentie kon niet worden vervangen");
  }
}
