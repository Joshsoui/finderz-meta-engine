import { generateCampaign, type VacancyInput } from "@/lib/campaign-engine";

type AiCampaignPlan = {
  primaryText: string;
  headline: string;
  description: string;
  usps: [string, string, string];
  backgroundPrompt: string;
};

function readOutputText(result: { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  return result.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")?.text;
}

async function createAiPlan(input: VacancyInput): Promise<AiCampaignPlan | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-5-mini",
      store: false,
      instructions: [
        "Je bent senior performance marketeer voor Finderz Keeperz.",
        "Maak Nederlandse Meta-wervingscopy die concreet, geloofwaardig en scanbaar is.",
        "Benoem nooit de klantnaam tenzij die letterlijk als werkgever in de input staat.",
        "Kies exact drie harde USP's uit de vacature; verzin geen arbeidsvoorwaarden.",
        "De primaire tekst is maximaal 420 tekens, de kop maximaal 55 tekens en de beschrijving maximaal 35 tekens.",
        "De beeldbriefing beschrijft alleen een realistische fotografische achtergrond zonder tekst, logo of grafische elementen.",
      ].join(" "),
      input: JSON.stringify(input),
      text: {
        format: {
          type: "json_schema",
          name: "finderz_meta_campaign",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              primaryText: { type: "string" },
              headline: { type: "string" },
              description: { type: "string" },
              usps: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
              backgroundPrompt: { type: "string" },
            },
            required: ["primaryText", "headline", "description", "usps", "backgroundPrompt"],
          },
        },
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) return null;
  const result = (await response.json()) as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const outputText = readOutputText(result);
  if (!outputText) return null;

  try {
    const plan = JSON.parse(outputText) as AiCampaignPlan;
    if (!Array.isArray(plan.usps) || plan.usps.length !== 3) return null;
    return plan;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as Partial<VacancyInput>;
    if (!input.title?.trim() || !input.location?.trim() || !input.description?.trim()) {
      return Response.json({ error: "title, location and description are required" }, { status: 400 });
    }
    if (!Number.isFinite(input.fee) || Number(input.fee) <= 0) {
      return Response.json({ error: "fee must be a positive number" }, { status: 400 });
    }
    const vacancy: VacancyInput = {
      title: input.title,
      location: input.location,
      salary: input.salary,
      description: input.description,
      fee: Number(input.fee),
      targetLeads: input.targetLeads,
    };
    const analysis = generateCampaign(vacancy);
    const aiPlan = await createAiPlan(vacancy);

    return Response.json({
      analysis: aiPlan ? {
        ...analysis,
        copy: {
          primaryText: aiPlan.primaryText,
          headline: aiPlan.headline,
          description: aiPlan.description,
        },
        usps: aiPlan.usps,
        creative: {
          ...analysis.creative,
          backgroundPrompt: aiPlan.backgroundPrompt,
          overlay: { ...analysis.creative.overlay, usps: aiPlan.usps },
        },
      } : analysis,
      aiGenerated: Boolean(aiPlan),
    });
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
