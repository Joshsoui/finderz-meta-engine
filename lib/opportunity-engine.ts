import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { actionRecommendations, aiUsageLog, campaigns, metricSnapshots, opportunities, signals } from "@/db/schema";
import {
  getActiveVacancyContext, getBusinessProfile, listCompanyIds, type ActiveVacancyContext, type BusinessProfile,
} from "@/lib/business-profile";
import { ACTION_TYPES, URGENCY_VALUES, type ActionType, type Urgency } from "@/lib/action-types";

/**
 * Hard pre-AI safety net (section 7): topics involving real human tragedy
 * are never sent to the AI for a relevance judgement at all -- no amount of
 * "geloofwaardige relatie" reasoning makes newsjacking a fatal accident or
 * disaster acceptable. Reorganisaties/ontslagen/faillissementen are
 * deliberately NOT in this list -- section 2 explicitly wants those as
 * signal categories, and whether a company has a credible angle on one is
 * exactly the nuanced judgement left to the AI's own isAppropriate check.
 */
const HARD_BLOCK_TERMS = ["dodelijk", "overleden", "dodental", "slachtoffers", "noodlottig", "ramp", "explosie", "brand met", "gewonden"];

function failsHardGuardrail(title: string, summary: string): string | null {
  const haystack = `${title} ${summary}`.toLowerCase();
  const hit = HARD_BLOCK_TERMS.find((term) => haystack.includes(term));
  return hit ? `Onderwerp raakt aan een tragedie/ramp ("${hit}") -- nooit geschikt voor newsjacking.` : null;
}

type AiActionRecommendation = { action: string; score: number; reasoning: string };

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
  urgency: string;
  optimalActionBeforeHours: number;
  matchingVacancyTitles: string[];
  actionRecommendations: AiActionRecommendation[];
};

/** Default decay steepness per urgency tier (score points lost per day) -- section 5: "een breaking opportunity die vandaag relevant is, moet morgen een lagere score krijgen." AI-classified urgency drives this rather than a per-opportunity AI-picked number, so decay stays predictable and comparable across opportunities. */
const DECAY_RATE_BY_URGENCY: Record<Urgency, number> = { evergreen: 0, normal: 1, time_sensitive: 8, breaking: 20 };

type PerformanceContext = { campaignId: string; title: string; cpl: number | null; targetCpl: number; leads: number; performsWell: boolean };

/**
 * Section 6: the real power is combining external signal + internal vacancy
 * match + past performance ("eerdere logistieke Meta-campagne had goede
 * CTR" = HIGH VALUE), not the signal alone. Deterministic, not a second AI
 * call -- computed in code from existing metricSnapshots/campaigns data and
 * handed to the AI as extra, factual context.
 */
async function getPerformanceContext(campaignIds: string[]): Promise<PerformanceContext[]> {
  if (campaignIds.length === 0) return [];
  const db = await getDb();

  const rows = await db
    .select({ id: campaigns.id, title: campaigns.title, spentCents: campaigns.spentCents, targetCplCents: campaigns.targetCplCents })
    .from(campaigns)
    .where(inArray(campaigns.id, campaignIds));

  const results: PerformanceContext[] = [];
  for (const row of rows) {
    const [latestSnapshot] = await db
      .select({ leads: metricSnapshots.leads })
      .from(metricSnapshots)
      .where(eq(metricSnapshots.campaignId, row.id))
      .orderBy(desc(metricSnapshots.recordedAt))
      .limit(1);
    const leads = latestSnapshot?.leads ?? 0;
    const cpl = leads > 0 ? row.spentCents / leads / 100 : null;
    const targetCpl = row.targetCplCents / 100;
    results.push({ campaignId: row.id, title: row.title, cpl, targetCpl, leads, performsWell: cpl !== null && cpl <= targetCpl });
  }
  return results;
}

function buildInstructions(profile: BusinessProfile): string {
  return [
    `Je bent een senior marketingstrateeg voor ${profile.name}, actief in "${profile.industry}", regio's: ${profile.regions.join(", ") || "onbekend"}.`,
    `Doelgroepen: ${profile.targetAudiences.join(", ") || "onbekend"}. Sectoren waar kandidaten geplaatst worden: ${profile.customerSectors.join(", ") || "onbekend"}.`,
    "Je krijgt één extern signaal, een lijst huidige openstaande vacatures, en (indien aanwezig) performance van eerdere campagnes op matchende vacatures. Bepaal eerst kritisch of dit signaal een ECHTE, concrete marketing- of recruitmentkans is -- de meeste signalen zijn dat niet. Wees streng: alleen bij een duidelijke, uitlegbare link met vacatures, regio, doelgroep of eerdere performance is isRelevantOpportunity true. Een match met een vacature waar eerdere campagnes al goed presteerden (performsWell) weegt zwaarder mee dan het signaal alleen.",
    "Beoordeel daarnaast onafhankelijk of dit onderwerp gepast is om als bedrijf op in te haken (isAppropriate): NIET gepast bij tragedie, onvoldoende betrouwbare bron, of als het bedrijf geen geloofwaardige relatie met het onderwerp heeft, of als het opportunistisch/misleidend zou overkomen. Leg guardrailReason altijd uit, ook als isAppropriate true is (bijvoorbeeld 'geen bezwaren').",
    "Verzin GEEN feiten, cijfers of quotes die niet in het signaal of de performance-data staan. matchingVacancyTitles bevat ALLEEN titels die letterlijk voorkomen in de meegegeven vacaturelijst.",
    `Classificeer urgency als een van: ${URGENCY_VALUES.join(", ")} (evergreen = tijdloos bruikbaar, breaking = alleen de eerstkomende dag(en) relevant). optimalActionBeforeHours schat hoeveel uur vanaf nu actie nog zinvol is.`,
    `BELANGRIJK: een Opportunity betekent NIET automatisch dat er content gemaakt moet worden. Scoor voor ELK van deze ${ACTION_TYPES.length} actietypes apart hoe geschikt het is (0-100) met een korte reasoning, ook als dat "ignore" of "monitor" is met een hoge score en de rest laag: ${ACTION_TYPES.join(", ")}. Wees kritisch: de meeste acties scoren laag, niet ieder signaal verdient een social post op elk kanaal.`,
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
  performanceContext: PerformanceContext[],
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
      input: JSON.stringify({ signal, activeVacancyTitles: vacancyTitles, pastPerformanceOnMatchingVacancies: performanceContext }),
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
              urgency: { type: "string", enum: [...URGENCY_VALUES] },
              optimalActionBeforeHours: { type: "integer" },
              matchingVacancyTitles: { type: "array", items: { type: "string" } },
              actionRecommendations: {
                type: "array",
                items: {
                  type: "object", additionalProperties: false,
                  properties: { action: { type: "string", enum: [...ACTION_TYPES] }, score: { type: "integer" }, reasoning: { type: "string" } },
                  required: ["action", "score", "reasoning"],
                },
              },
            },
            required: [
              "isRelevantOpportunity", "isAppropriate", "guardrailReason", "title", "whyNow",
              "relevanceScore", "timelinessScore", "audienceFitScore", "regionalFitScore",
              "commercialPotentialScore", "contentPotentialScore", "recruitmentPotentialScore",
              "urgency", "optimalActionBeforeHours", "matchingVacancyTitles", "actionRecommendations",
            ],
          },
        },
      },
    }),
    signal: AbortSignal.timeout(60_000),
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

export type AnalyzeSignalResult = { created: number; reason: string };

/**
 * The Opportunity Engine's per-signal entry point (section 4/8). Runs the
 * hard guardrail once, then -- per company (multi-company ready, section
 * 6/8) -- the AI relevance + scoring + action-recommendation pass, and
 * persists an Opportunity (+ its scored ActionRecommendations) only when
 * the AI itself judges it a real one for that company. Never one row per
 * signal regardless of relevance.
 */
export async function analyzeSignal(signalId: string): Promise<AnalyzeSignalResult> {
  const db = await getDb();
  const [signalRow] = await db.select().from(signals).where(eq(signals.id, signalId)).limit(1);
  if (!signalRow) return { created: 0, reason: "Signal niet gevonden" };
  if (signalRow.status !== "new") return { created: 0, reason: `Signal al verwerkt (status: ${signalRow.status})` };

  const hardBlockReason = failsHardGuardrail(signalRow.title, signalRow.summary);
  if (hardBlockReason) {
    await db.update(signals).set({ status: "irrelevant" }).where(eq(signals.id, signalId));
    return { created: 0, reason: hardBlockReason };
  }

  const companyIds = await listCompanyIds();
  let created = 0;
  let anyAiFailure = false;

  for (const companyId of companyIds) {
    const profile = await getBusinessProfile(companyId);
    const vacancies = await getActiveVacancyContext();
    const vacancyTitles = [...new Set(vacancies.map((vacancy: ActiveVacancyContext) => vacancy.title))];
    // Cheap, deterministic pre-check: only bother fetching performance data
    // for vacancies whose title actually appears in the signal/summary text
    // -- otherwise every signal would pull performance for the whole
    // vacancy list for nothing.
    const roughlyRelatedCampaignIds = vacancies
      .filter((vacancy: ActiveVacancyContext) => `${signalRow.title} ${signalRow.summary}`.toLowerCase().includes(vacancy.title.toLowerCase().slice(0, 12)))
      .map((vacancy: ActiveVacancyContext) => vacancy.campaignId);
    const performanceContext = await getPerformanceContext(roughlyRelatedCampaignIds);

    const analysis = await callOpportunityAi(
      profile,
      { title: signalRow.title, summary: signalRow.summary, source: signalRow.source, category: signalRow.category },
      vacancyTitles,
      performanceContext,
    );

    if (!analysis) {
      anyAiFailure = true;
      continue;
    }
    if (!analysis.isRelevantOpportunity) continue;

    const matchedCampaignIds = vacancies
      .filter((vacancy: ActiveVacancyContext) => analysis.matchingVacancyTitles.includes(vacancy.title))
      .map((vacancy: ActiveVacancyContext) => vacancy.campaignId);

    const subscores = [
      analysis.relevanceScore, analysis.timelinessScore, analysis.audienceFitScore, analysis.regionalFitScore,
      analysis.commercialPotentialScore, analysis.contentPotentialScore, analysis.recruitmentPotentialScore,
    ].map((score) => Math.max(0, Math.min(100, Math.round(score))));
    const totalScore = Math.round(subscores.reduce((sum, score) => sum + score, 0) / subscores.length);

    const urgency: Urgency = URGENCY_VALUES.includes(analysis.urgency as Urgency) ? (analysis.urgency as Urgency) : "normal";
    const optimalActionBeforeAt = Number.isFinite(analysis.optimalActionBeforeHours) && analysis.optimalActionBeforeHours > 0
      ? new Date(Date.now() + analysis.optimalActionBeforeHours * 60 * 60 * 1000).toISOString()
      : null;

    const opportunityId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.insert(opportunities).values({
      id: opportunityId,
      signalId,
      companyId,
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
      isAppropriate: analysis.isAppropriate,
      guardrailReason: analysis.guardrailReason,
      urgency,
      decayRatePerDay: DECAY_RATE_BY_URGENCY[urgency],
      optimalActionBeforeAt,
      status: "opportunity",
      createdAt: now,
      updatedAt: now,
    });

    const validActions = new Set<string>(ACTION_TYPES);
    const recommendationRows = analysis.actionRecommendations
      .filter((recommendation) => validActions.has(recommendation.action))
      .map((recommendation) => ({
        opportunityId,
        action: recommendation.action as ActionType,
        score: Math.max(0, Math.min(100, Math.round(recommendation.score))),
        reasoning: recommendation.reasoning,
        createdAt: now,
      }));
    if (recommendationRows.length > 0) await db.insert(actionRecommendations).values(recommendationRows);

    created += 1;
  }

  await db.update(signals).set({ status: created === 0 && anyAiFailure ? "new" : "analyzed" }).where(eq(signals.id, signalId));

  if (created === 0 && anyAiFailure) return { created: 0, reason: "AI-analyse niet beschikbaar (OPENAI_API_KEY ontbreekt of de aanroep faalde)" };
  if (created === 0) return { created: 0, reason: "AI beoordeelde dit signaal als geen concrete kans voor een van de bedrijven" };
  return { created, reason: `${created} opportunity/opportunities aangemaakt` };
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
      opportunitiesCreated += result.created;
    } catch (error) {
      errors.push(`${row.id}: ${error instanceof Error ? error.message : "onbekende fout"}`);
    }
  }

  return { analyzed, opportunitiesCreated, errors };
}
