import { errorResponse } from "@/lib/api-error";
import { getMetaCredentials, setMetaCampaignStatus, updateMetaCampaignBudget } from "@/lib/meta-client";

/**
 * Direct control over any campaign in the ad account by its Meta campaign id
 * -- including ones never imported into this platform's own `campaigns`
 * table. Pause/resume and daily-budget changes are pure Graph API
 * passthroughs (see lib/meta-client.ts), so they need nothing local to work,
 * matching how Ads Manager itself lets you act on any campaign directly.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ metaCampaignId: string }> }) {
  try {
    const { metaCampaignId } = await params;
    if (!getMetaCredentials()) return Response.json({ error: "Meta is not configured" }, { status: 400 });

    const body = (await request.json()) as { status?: "ACTIVE" | "PAUSED"; dailyBudgetCents?: number };
    if (body.status === undefined && body.dailyBudgetCents === undefined) {
      return Response.json({ error: "status or dailyBudgetCents is required" }, { status: 400 });
    }
    if (body.status !== undefined && body.status !== "ACTIVE" && body.status !== "PAUSED") {
      return Response.json({ error: "status must be ACTIVE or PAUSED" }, { status: 400 });
    }
    if (body.dailyBudgetCents !== undefined && (!Number.isFinite(body.dailyBudgetCents) || body.dailyBudgetCents <= 0)) {
      return Response.json({ error: "dailyBudgetCents must be a positive number" }, { status: 400 });
    }

    if (body.status !== undefined) await setMetaCampaignStatus(metaCampaignId, body.status);
    if (body.dailyBudgetCents !== undefined) await updateMetaCampaignBudget(metaCampaignId, body.dailyBudgetCents);

    return Response.json({ status: body.status, dailyBudgetCents: body.dailyBudgetCents });
  } catch (error) {
    return errorResponse(error, "Campagne kon niet worden bijgewerkt");
  }
}
