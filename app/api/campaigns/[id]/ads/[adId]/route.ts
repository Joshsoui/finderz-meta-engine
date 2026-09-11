import { errorResponse } from "@/lib/api-error";
import { getMetaCredentials, setMetaAdStatus } from "@/lib/meta-client";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; adId: string }> }) {
  try {
    const { adId } = await params;
    if (!getMetaCredentials()) return Response.json({ error: "Meta is not configured" }, { status: 400 });

    const body = (await request.json()) as { status?: "ACTIVE" | "PAUSED" };
    if (body.status !== "ACTIVE" && body.status !== "PAUSED") {
      return Response.json({ error: "status must be ACTIVE or PAUSED" }, { status: 400 });
    }

    await setMetaAdStatus(adId, body.status);
    return Response.json({ status: body.status });
  } catch (error) {
    return errorResponse(error, "Advertentiestatus kon niet worden gewijzigd");
  }
}
