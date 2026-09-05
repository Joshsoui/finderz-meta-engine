import { generateCampaign, type VacancyInput } from "@/lib/campaign-engine";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as Partial<VacancyInput>;
    if (!input.title?.trim() || !input.location?.trim() || !input.description?.trim()) {
      return Response.json({ error: "title, location and description are required" }, { status: 400 });
    }
    if (!Number.isFinite(input.fee) || Number(input.fee) <= 0) {
      return Response.json({ error: "fee must be a positive number" }, { status: 400 });
    }
    return Response.json({
      analysis: generateCampaign({
        title: input.title,
        location: input.location,
        salary: input.salary,
        description: input.description,
        fee: Number(input.fee),
        targetLeads: input.targetLeads,
      }),
    });
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
