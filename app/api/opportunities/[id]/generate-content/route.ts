import { errorResponse } from "@/lib/api-error";
import { CONTENT_CHANNELS, type ContentChannel } from "@/lib/content-channels";
import { generateContentForChannel } from "@/lib/content-engine";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { channel?: string };
    if (!CONTENT_CHANNELS.includes(body.channel as ContentChannel)) {
      return Response.json({ error: `channel moet een van deze zijn: ${CONTENT_CHANNELS.join(", ")}` }, { status: 400 });
    }

    const result = await generateContentForChannel(id, body.channel as ContentChannel);
    if ("error" in result) return Response.json({ error: result.error }, { status: 400 });

    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Content kon niet worden gegenereerd");
  }
}
