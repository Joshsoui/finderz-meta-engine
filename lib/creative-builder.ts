import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiUsageLog, campaigns, creativeVariants } from "@/db/schema";
import { getLatestWinnerPatterns, type WinnerPattern } from "@/lib/creative-analyst";

type AiVariant = {
  headline: string;
  primaryText: string;
  descriptionText: string;
  usps: [string, string, string];
  rationale: string;
};

/**
 * Same hard constraints as /api/analyze-vacancy's createAiPlan (client name
 * never mentioned, exactly 3 USPs with salary first, the same length
 * limits) -- this produces copy for the same ad format, so it has to follow
 * the same rules. The difference: this is a *second* variant of an existing
 * campaign, explicitly built to apply the Analyst's current winning
 * patterns rather than a first draft from scratch.
 */
function buildInstructions(patterns: WinnerPattern[]): string {
  return [
    "Je bent senior performance marketeer voor Finderz Keeperz en maakt een NIEUWE testvariant van bestaande Meta-wervingscopy voor dezelfde vacature.",
    "Gebruik ALLEEN de vacaturefeiten die al in de meegegeven titel, locatie, salaris en huidige tekst staan -- verzin geen nieuwe arbeidsvoorwaarden, salaris of functie-inhoud.",
    "Benoem nooit de naam van de klant/werkgever, ook niet als die in de titel voorkomt.",
    "Kies exact drie harde USP's; de eerste is altijd het salaris, kort genoteerd (bijvoorbeeld 'Tot € 3.200 p/m'). Elke USP is een korte bullet van maximaal circa 28 tekens, geen volledige zin, geen herhaling van de functietitel of locatie.",
    "De kop is een korte, pakkende zin of vraag die de kandidaat direct aanspreekt, geen letterlijke functietitel, geen klantnaam, geen leestekens als | of :. Maximaal 70 tekens.",
    "De primaire tekst is maximaal 420 tekens en de beschrijving maximaal 35 tekens.",
    "Deze variant moet zichtbaar anders zijn dan de huidige tekst -- geen kleine woordwijziging, maar een andere invalshoek die het meegegeven winnende patroon toepast.",
    "rationale legt in 1-2 Nederlandse zinnen uit welk patroon je hebt toegepast en waarom dat voor deze vacature zou moeten werken.",
    patterns.length > 0
      ? `Winnende patronen uit eigen historische data om toe te passen: ${patterns.map((pattern) => `"${pattern.theme}" -- ${pattern.suggestedReuse}`).join(" | ")}`
      : "Er zijn nog geen winnende patronen bekend -- kies een andere, zelfstandig onderbouwde invalshoek dan de huidige tekst.",
  ].join(" ");
}

async function logAiUsage(model: string, relatedId: string, succeeded: boolean) {
  const db = await getDb();
  await db.insert(aiUsageLog).values({ purpose: "content_generation", model, relatedId, succeeded, createdAt: new Date().toISOString() });
}

async function callBuilderAi(
  campaign: { title: string; location: string; salary: string; headline: string; primaryText: string; descriptionText: string },
  patterns: WinnerPattern[],
): Promise<AiVariant | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENAI_TEXT_MODEL || "gpt-5-mini";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      instructions: buildInstructions(patterns),
      input: JSON.stringify({ currentCampaign: campaign }),
      text: {
        format: {
          type: "json_schema",
          name: "creative_variant",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              headline: { type: "string" },
              primaryText: { type: "string" },
              descriptionText: { type: "string" },
              usps: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
              rationale: { type: "string" },
            },
            required: ["headline", "primaryText", "descriptionText", "usps", "rationale"],
          },
        },
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  const succeeded = response.ok;
  await logAiUsage(model, campaign.title.slice(0, 64), succeeded);
  if (!succeeded) return null;

  const result = (await response.json()) as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const outputText = result.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!outputText) return null;

  try {
    const parsed = JSON.parse(outputText) as AiVariant;
    if (!Array.isArray(parsed.usps) || parsed.usps.length !== 3) return null;
    return parsed;
  } catch {
    return null;
  }
}

export type GenerateVariantResult = { variant?: typeof creativeVariants.$inferSelect; error?: string };

/**
 * The Creative Builder's entry point -- always produces a *reviewable*
 * variant (status "review"), never applies it anywhere on its own. Approving
 * it is a separate, explicit step (see /api/campaigns/[id]/variants/[id]).
 */
export async function generateCreativeVariant(campaignId: string): Promise<GenerateVariantResult> {
  const db = await getDb();
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!campaign) return { error: "Campagne niet gevonden" };

  const patterns = await getLatestWinnerPatterns();
  const aiVariant = await callBuilderAi(
    { title: campaign.title, location: campaign.location, salary: campaign.salary, headline: campaign.headline, primaryText: campaign.primaryText, descriptionText: campaign.descriptionText },
    patterns,
  );
  if (!aiVariant) return { error: "AI-generatie niet beschikbaar (OPENAI_API_KEY ontbreekt of de aanroep faalde)" };

  const [variant] = await db
    .insert(creativeVariants)
    .values({
      id: crypto.randomUUID(),
      campaignId,
      headline: aiVariant.headline,
      primaryText: aiVariant.primaryText,
      descriptionText: aiVariant.descriptionText,
      uspsJson: JSON.stringify(aiVariant.usps),
      rationale: aiVariant.rationale,
      status: "review",
      createdAt: new Date().toISOString(),
    })
    .returning();

  return { variant };
}

export async function listCreativeVariants(campaignId: string) {
  const db = await getDb();
  return db.select().from(creativeVariants).where(eq(creativeVariants.campaignId, campaignId)).orderBy(desc(creativeVariants.createdAt));
}
