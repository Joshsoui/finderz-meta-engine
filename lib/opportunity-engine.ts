import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiUsageLog, opportunities, signals } from "@/db/schema";
import { getActiveVacancyContext, getBusinessProfile, type BusinessProfile } from "@/lib/business-profile";

/**
 * Hard pre-AI safety net (section 7): topics involving real human tragedy
 * are never sent to the AI for a relevance judgement at all -- no amount of
 * "geloofwaardige relatie" reasoning makes newsjacking a fatal accident or
 * disaster acceptable. Reorganisaties/ontslagen/faillissementen are
 * deliberately NOT in this list -- section 2 explicitly wants those as
 * signal categories, and whether FK has a credible angle on one is exactly
 * the nuanced judgement left to the AI's own isAppropriate check below.
 */
const HARD_BLOCK_TERMS = ["dodelijk", "overleden", "dodental", "slachtoffers", "noodlottig", "ramp", "explosie", "brand met", "gewonden"];

function failsHardGuardrail(title: string, summary: string): string | null {
  const haystack = `${title} ${summary}`.toLowerCase();
  const hit = HARD_BLOCK_TERMS.find((term) => haystack.includes(term));
  return hit ? `Onderwerp raakt aan een tragedie/ramp ("${hit}") -- nooit geschikt voor newsjacking.` : null;
}

type AiOpportunityAnalysis = {
  isRelevantOpportunity: boolean;
  isAppropriate: boolean;
  guardrailReason: string;
  title: string;
  whyNow: string;
  relevanceScore: number;
  timelinessScore: number;
  audienceFitScore: number;
  regionalFitScore: number;
  commercialPotentialScore: number;
  contentPotentialScore: number;
  recruitmentPotentialScore: number;
  matchingVacancyTitles: string[];
  recommendedChannels: string[];
};

const RECOMMENDED_CHANNEL_OPTIONS = ["instagram", "facebook", "linkedin", "meta_ads", "werkinnoordholland"];

function buildInstructions(profile: BusinessProfile): string {
  return [
    `Je bent een senior marketingstrateeg voor ${profile.name}, actief in "${profile.industry}", regio's: ${profile.regions.join(", ") || "onbekend"}.`,
    `Doelgroepen: ${profile.targetAudiences.join(", ") || "onbekend"}. Sectoren waar kandidaten geplaatst worden: ${profile.customerSectors.join(", ") || "onbekend"}.`,
    "Je krijgt één extern nieuwssignaal en een lijst huidige openstaande vacatures. Bepaal eerst kritisch of dit signaal een ECHTE, concrete marketing- of recruitmentkans is voor dit bedrijf -- de meeste nieuwsberichten zijn dat niet. Wees streng: alleen bij een duidelijke, uitlegbare link met de vacatures, regio of doelgroep is isRelevantOpportunity true.",
    "Beoordeel daarnaast onafhankelijk of dit onderwerp gepast is om als bedrijf op in te haken (isAppropriate): NIET gepast bij tragedie, onvoldoende betrouwbare bron, of als het bedrijf geen geloofwaardige relatie met het onderwerp heeft, of als het opportunistisch/misleidend zou overkomen. Leg guardrailReason altijd uit, ook als isAppropriate true is (bijvoorbeeld 'geen bezwaren').",
    "Verzin GEEN feiten, cijfers of quotes die niet in het signaal staan. matchingVacancyTitles bevat ALLEEN titels die letterlijk voorkomen in de meegegeven vacaturelijst -- nooit een vacature die niet in de lijst staat.",
    `recommendedChannels: kies alleen uit deze opties: ${RECOMMENDED_CHANNEL_OPTIONS.join(", ")}.`,
    "Alle score-velden zijn een geheel getal 0-100. Schrijf whyNow en title in het Nederlands, kort en concreet.",
  ].join(" ");
}

async function logAiUsage(purpose: "opportunity_scoring", model: string, relatedId: string, succeeded: boolean) {
  const db = await getDb();
  await db.insert(aiUsageLog).values({ purpose, model, relatedId, succeeded, createdAt: new Date().toISOString() });
}

async function callOpportunityAi(
  profile: BusinessProfile,
  signal: { title: string; summary: string; source: string; category: string },
  vacancyTitles: string[],
): Promise<AiOpportunityAnalysis | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENAI_OPPORTUNITY_MODEL || process.env.OPENAI_TEXT_MODEL || "gpt-5-mini";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      instructions: buildInstructions(profile),
      input: JSON.stringify({ signal, activeVacancyTitles: vacancyTitles }),
      text: {
        format: {
          type: "json_schema",
          name: "opportunity_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              isRelevantOpportunity: { type: "boolean" },
              isAppropriate: { type: "boolean" },
              guardrailReason: { type: "string" },
              title: { type: "string" },
              whyNow: { type: "string" },
              relevanceScore: { type: "integer" },
              timelinessScore: { type: "integer" },
              audienceFitScore: { type: "integer" },
              regionalFitScore: { type: "integer" },
              commercialPotentialScore: { type: "integer" },
              contentPotentialScore: { type: "integer" },
              recruitmentPotentialScore: { type: "integer" },
              matchingVacancyTitles: { type: "array", items: { type: "string" } },
              recommendedChannels: { type: "array", items: { type: "string" } },
            },
            required: [
              "isRelevantOpportunity", "isAppropriate", "guardrailReason", "title", "whyNow",
              "relevanceScore", "timelinessScore", "audienceFitScore", "regionalFitScore",
              "commercialPotentialScore", "contentPotentialScore", "recruitmentPotentialScore",
              "matchingVacancyTitles", "recommendedChannels",
            ],
          },
        },
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  const succeeded = response.ok;
  await logAiUsage("opportunity_scoring", model, signal.title.slice(0, 64), succeeded);
  if (!succeeded) return null;

  const result = (await response.json()) as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const outputText = result.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!outputText) return null;

  try {
    return JSON.parse(outputText) as AiOpportunityAnalysis;
  } catch {
    return null;
  }
}

export type AnalyzeSignalResult = { created: boolean; opportunityId?: string; reason: string };

/**
 * The Opportunity Engine's per-signal entry point (section 4). Runs the
 * hard guardrail, then (if the signal survives) the AI relevance + scoring
 * pass, then persists an Opportunity row only when the AI itself judges it
 * a real one -- never one row per signal regardless of relevance.
 */
export async function analyzeSignal(signalId: string): Promise<AnalyzeSignalResult> {
  const db = await getDb();
  const [signalRow] = await db.select().from(signals).where(eq(signals.id, signalId)).limit(1);
  if (!signalRow) return { created: false, reason: "Signal niet gevonden" };
  if (signalRow.status !== "new") return { created: false, reason: `Signal al verwerkt (status: ${signalRow.status})` };

  const hardBlockReason = failsHardGuardrail(signalRow.title, signalRow.summary);
  if (hardBlockReason) {
    await db.update(signals).set({ status: "irrelevant" }).where(eq(signals.id, signalId));
    return { created: false, reason: hardBlockReason };
  }

  const profile = await getBusinessProfile();
  const vacancies = await getActiveVacancyContext();
  const vacancyTitles = [...new Set(vacancies.map((vacancy) => vacancy.title))];

  const analysis = await callOpportunityAi(
    profile,
    { title: signalRow.title, summary: signalRow.summary, source: signalRow.source, category: signalRow.category },
    vacancyTitles,
  );

  if (!analysis) {
    // AI unavailable/failed -- leave the signal as "new" so a later scan (once configured) can retry, rather than silently discarding it as irrelevant.
    return { created: false, reason: "AI-analyse niet beschikbaar (OPENAI_API_KEY ontbreekt of de aanroep faalde)" };
  }

  if (!analysis.isRelevantOpportunity) {
    await db.update(signals).set({ status: "irrelevant" }).where(eq(signals.id, signalId));
    return { created: false, reason: "AI beoordeelde dit signaal als geen concrete kans" };
  }

  const matchedCampaignIds = vacancies
    .filter((vacancy) => analysis.matchingVacancyTitles.includes(vacancy.title))
    .map((vacancy) => vacancy.campaignId);
  const recommendedChannels = analysis.recommendedChannels.filter((channel) => RECOMMENDED_CHANNEL_OPTIONS.includes(channel));

  const subscores = [
    analysis.relevanceScore, analysis.timelinessScore, analysis.audienceFitScore, analysis.regionalFitScore,
    analysis.commercialPotentialScore, analysis.contentPotentialScore, analysis.recruitmentPotentialScore,
  ].map((score) => Math.max(0, Math.min(100, Math.round(score))));
  const totalScore = Math.round(subscores.reduce((sum, score) => sum + score, 0) / subscores.length);

  const opportunityId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(opportunities).values({
    id: opportunityId,
    signalId,
    companyId: profile.companyId,
    title: analysis.title,
    score: totalScore,
    relevanceScore: subscores[0],
    timelinessScore: subscores[1],
    audienceFitScore: subscores[2],
    regionalFitScore: subscores[3],
    commercialPotentialScore: subscores[4],
    contentPotentialScore: subscores[5],
    recruitmentPotentialScore: subscores[6],
    whyNow: analysis.whyNow,
    matchingCampaignIdsJson: JSON.stringify([...new Set(matchedCampaignIds)]),
    recommendedChannelsJson: JSON.stringify(recommendedChannels),
    isAppropriate: analysis.isAppropriate,
    guardrailReason: analysis.guardrailReason,
    status: "opportunity",
    createdAt: now,
    updatedAt: now,
  });

  await db.update(signals).set({ status: "analyzed" }).where(eq(signals.id, signalId));

  return { created: true, opportunityId, reason: "Opportunity aangemaakt" };
}

/** Runs analyzeSignal() over every signal that passed the cheap filter and hasn't been analyzed yet -- the "only promising signals -> deeper AI analysis" step of section 12's pipeline. */
export async function analyzePendingSignals(limit = 20): Promise<{ analyzed: number; opportunitiesCreated: number; errors: string[] }> {
  const db = await getDb();
  const pending = await db
    .select({ id: signals.id })
    .from(signals)
    .where(and(eq(signals.status, "new"), eq(signals.passedCheapFilter, true)))
    .limit(limit);

  let analyzed = 0;
  let opportunitiesCreated = 0;
  const errors: string[] = [];

  for (const row of pending) {
    try {
      const result = await analyzeSignal(row.id);
      analyzed += 1;
      if (result.created) opportunitiesCreated += 1;
    } catch (error) {
      errors.push(`${row.id}: ${error instanceof Error ? error.message : "onbekende fout"}`);
    }
  }

  return { analyzed, opportunitiesCreated, errors };
}
