import { evaluateCampaign, type CampaignMetrics } from "@/lib/campaign-engine";

export async function POST(request: Request) {
  try {
    const metrics = (await request.json()) as Partial<CampaignMetrics>;
    const required = ["spend", "impressions", "clicks", "leads", "frequency", "targetCpl", "maxBudget"] as const;
    if (required.some((key) => !Number.isFinite(metrics[key]))) {
      return Response.json({ error: "All campaign metrics are required numbers" }, { status: 400 });
    }
    return Response.json({ decision: evaluateCampaign(metrics as CampaignMetrics) });
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
