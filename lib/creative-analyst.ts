import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { aiUsageLog, campaigns, creativeAnalysisState, creativeInsights, metricSnapshots } from "@/db/schema";

/** Below this a campaign's own CPL is still mostly noise -- same confidence-floor reasoning as AD_PERFORMANCE_CONFIDENT_LEADS in app/page.tsx, applied here to which campaigns are even worth feeding into the analysis. */
const MIN_LEADS_FOR_DATAPOINT = 3;
/** Too few qualifying campaigns and any "pattern" the AI names is really just one or two anecdotes, not something worth reusing. */
const MIN_CAMPAIGNS_FOR_ANALYSIS = 4;

export type CreativeDatapoint = {
  campaignId: string;
  title: string;
  location: string;
  salary: string;
  usps: string[];
  headline: string;
  primaryText: string;
  descriptionText: string;
  spendCents: number;
  leads: number;
  cplCents: number | null;
};

/**
 * Deterministic dataset assembly -- no AI involved. Mirrors the same
 * campaigns+metricSnapshots join /api/campaigns uses (leads live in the
 * latest snapshot, not on the campaigns row itself), filtered down to
 * campaigns with enough real spend and leads that their CPL means anything.
 */
async function getCreativePerformanceDataset(): Promise<CreativeDatapoint[]> {
  const db = await getDb();
  const rows = await db.select().from(campaigns).where(inArray(campaigns.status, ["live", "attention", "paused", "completed"]));
  if (rows.length === 0) return [];

  const campaignIds = rows.map((row) => row.id);
  const latestLeadsByCampaign = new Map<string, number>();
  const snapshots = await db
    .select({ campaignId: metricSnapshots.campaignId, leads: metricSnapshots.leads })
    .from(metricSnapshots)
    .where(inArray(metricSnapshots.campaignId, campaignIds))
    .orderBy(desc(metricSnapshots.recordedAt));
  for (const snapshot of snapshots) {
    if (!latestLeadsByCampaign.has(snapshot.campaignId)) latestLeadsByCampaign.set(snapshot.campaignId, snapshot.leads);
  }

  return rows
    .map((row) => {
      const leads = latestLeadsByCampaign.get(row.id) ?? 0;
      let usps: string[] = [];
      try {
        const parsed = JSON.parse(row.uspsJson);
        if (Array.isArray(parsed)) usps = parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      } catch {
        // keep empty
      }
      return {
        campaignId: row.id,
        title: row.title,
        location: row.location,
        salary: row.salary,
        usps,
        headline: row.headline,
        primaryText: row.primaryText,
        descriptionText: row.descriptionText,
        spendCents: row.spentCents,
        leads,
        cplCents: leads > 0 ? Math.round(row.spentCents / leads) : null,
      };
    })
    .filter((point) => point.spendCents > 0 && point.leads >= MIN_LEADS_FOR_DATAPOINT);
}

type AiPattern = {
  kind: "winner" | "watchout";
  theme: string;
  description: string;
  suggestedReuse: string;
  evidenceCampaignIds: string[];
  confidence: "low" | "medium" | "high";
};

type AiCreativeAnalysis = { patterns: AiPattern[] };

function buildInstructions(): string {
  return [
    "Je bent een senior performance-marketeer die de historische advertentiedata van dit wervingsbureau analyseert.",
    "Je krijgt een lijst campagnes met hun advertentietekst (USP's, headline, primaire tekst), locatie, salaris en prestaties (spend en kosten per lead, beide in centen).",
    "Zoek naar PATRONEN, geen toevalstreffers: een patroon moet zichtbaar zijn in minstens 2 verschillende campagnes met een vergelijkbare aanpak (bijv. eenzelfde soort USP, salaris wel/niet in de headline, eenzelfde toon of invalshoek) -- nooit alleen de ene campagne met het laagste getal.",
    "Benoem zowel winnende patronen (kind: winner, structureel lagere kosten per lead) als patronen die structureel achterblijven (kind: watchout, structureel hogere kosten per lead) -- alleen als daar minstens 2 campagnes bewijs voor zijn.",
    "suggestedReuse is een concreet, herbruikbaar stukje tekst of een concrete aanpak, gebaseerd op wat er ECHT in de meegegeven advertentieteksten staat -- verzin niets, citeer of parafraseer de aanpak uit de evidence-campagnes.",
    "evidenceCampaignIds bevat ALLEEN campaignId's die letterlijk in de input voorkomen.",
    "confidence: gebruik 'high' alleen bij 4 of meer evidence-campagnes met een consistent verschil, 'medium' bij 2-3, 'low' als het verschil klein of wisselend is.",
    "Schrijf theme, description en suggestedReuse in het Nederlands, kort en concreet. Presenteer geen aannames als zekerheid.",
  ].join(" ");
}

async function logAiUsage(model: string, succeeded: boolean) {
  const db = await getDb();
  await db.insert(aiUsageLog).values({ purpose: "creative_analysis", model, relatedId: null, succeeded, createdAt: new Date().toISOString() });
}

async function callCreativeAnalysisAi(dataset: CreativeDatapoint[]): Promise<AiCreativeAnalysis | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENAI_OPPORTUNITY_MODEL || process.env.OPENAI_TEXT_MODEL || "gpt-5-mini";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      instructions: buildInstructions(),
      input: JSON.stringify({ campaigns: dataset }),
      text: {
        format: {
          type: "json_schema",
          name: "creative_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              patterns: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    kind: { type: "string", enum: ["winner", "watchout"] },
                    theme: { type: "string" },
                    description: { type: "string" },
                    suggestedReuse: { type: "string" },
                    evidenceCampaignIds: { type: "array", items: { type: "string" } },
                    confidence: { type: "string", enum: ["low", "medium", "high"] },
                  },
                  required: ["kind", "theme", "description", "suggestedReuse", "evidenceCampaignIds", "confidence"],
                },
              },
            },
            required: ["patterns"],
          },
        },
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const succeeded = response.ok;
  await logAiUsage(model, succeeded);
  if (!succeeded) return null;

  const result = (await response.json()) as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const outputText = result.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!outputText) return null;

  try {
    return JSON.parse(outputText) as AiCreativeAnalysis;
  } catch {
    return null;
  }
}

async function recordState(campaignsAnalyzed: number, patternsFound: number, error: string | null) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db
    .insert(creativeAnalysisState)
    .values({ id: "global", lastRunAt: now, lastRunCampaignsAnalyzed: campaignsAnalyzed, lastRunPatternsFound: patternsFound, lastRunError: error })
    .onConflictDoUpdate({
      target: creativeAnalysisState.id,
      set: { lastRunAt: now, lastRunCampaignsAnalyzed: campaignsAnalyzed, lastRunPatternsFound: patternsFound, lastRunError: error },
    });
}

export type CreativeAnalysisResult = { campaignsAnalyzed: number; patternsFound: number; reason?: string };

/**
 * The Creative Analyst's entry point -- manually triggered (no cron yet,
 * same caution the rest of this intelligence layer started with). Never
 * trusts the AI's own evidence count or math: a pattern backed by fewer
 * than 2 real campaigns from the dataset is dropped regardless of what the
 * model claimed, and avgCplCents/portfolioAvgCplCents are always computed
 * here from the real data, not taken from the AI's output.
 */
export async function runCreativeAnalysis(): Promise<CreativeAnalysisResult> {
  const dataset = await getCreativePerformanceDataset();
  if (dataset.length < MIN_CAMPAIGNS_FOR_ANALYSIS) {
    const reason = `Nog te weinig data: ${dataset.length} campagne(s) met genoeg leads (minimaal ${MIN_CAMPAIGNS_FOR_ANALYSIS} nodig voor betrouwbare patronen).`;
    await recordState(dataset.length, 0, null);
    return { campaignsAnalyzed: dataset.length, patternsFound: 0, reason };
  }

  const analysis = await callCreativeAnalysisAi(dataset);
  if (!analysis) {
    const reason = "AI-analyse niet beschikbaar (OPENAI_API_KEY ontbreekt of de aanroep faalde)";
    await recordState(dataset.length, 0, reason);
    return { campaignsAnalyzed: dataset.length, patternsFound: 0, reason };
  }

  const datasetById = new Map(dataset.map((point) => [point.campaignId, point]));
  const portfolioCpls = dataset.map((point) => point.cplCents).filter((cpl): cpl is number => cpl !== null);
  const portfolioAvgCplCents = portfolioCpls.length > 0 ? Math.round(portfolioCpls.reduce((sum, value) => sum + value, 0) / portfolioCpls.length) : null;

  const runId = crypto.randomUUID();
  const now = new Date().toISOString();
  const rows = [];
  for (const pattern of analysis.patterns) {
    const validEvidenceIds = [...new Set(pattern.evidenceCampaignIds)].filter((id) => datasetById.has(id));
    if (validEvidenceIds.length < 2) continue;

    const evidenceCpls = validEvidenceIds.map((id) => datasetById.get(id)!.cplCents).filter((cpl): cpl is number => cpl !== null);
    const avgCplCents = evidenceCpls.length > 0 ? Math.round(evidenceCpls.reduce((sum, value) => sum + value, 0) / evidenceCpls.length) : null;
    const confidence: "low" | "medium" | "high" =
      validEvidenceIds.length >= 4 && pattern.confidence === "high" ? "high" : validEvidenceIds.length >= 2 ? (pattern.confidence === "low" ? "low" : "medium") : "low";

    rows.push({
      id: crypto.randomUUID(),
      runId,
      kind: pattern.kind === "watchout" ? ("watchout" as const) : ("winner" as const),
      theme: pattern.theme,
      description: pattern.description,
      suggestedReuse: pattern.suggestedReuse,
      evidenceCampaignIdsJson: JSON.stringify(validEvidenceIds),
      avgCplCents,
      portfolioAvgCplCents,
      confidence,
      createdAt: now,
    });
  }

  if (rows.length > 0) {
    const db = await getDb();
    await db.insert(creativeInsights).values(rows);
  }

  await recordState(dataset.length, rows.length, null);
  return { campaignsAnalyzed: dataset.length, patternsFound: rows.length };
}

export type CreativeInsightWithEvidence = {
  id: string;
  kind: "winner" | "watchout";
  theme: string;
  description: string;
  suggestedReuse: string;
  confidence: "low" | "medium" | "high";
  avgCplCents: number | null;
  portfolioAvgCplCents: number | null;
  evidence: Array<{ id: string; title: string; location: string }>;
};

const CONFIDENCE_RANK: Record<"low" | "medium" | "high", number> = { high: 3, medium: 2, low: 1 };

/** Only the most recent run's patterns -- older runs stay in the table for history, but the UI shows "what we found this time", same as Radar shows current signals rather than every scan ever done. */
export async function getLatestCreativeInsights(): Promise<{
  state: { lastRunAt: string | null; lastRunCampaignsAnalyzed: number; lastRunPatternsFound: number; lastRunError: string | null } | null;
  insights: CreativeInsightWithEvidence[];
}> {
  const db = await getDb();
  const [state] = await db.select().from(creativeAnalysisState).where(eq(creativeAnalysisState.id, "global")).limit(1);
  const [latestRun] = await db.select({ runId: creativeInsights.runId }).from(creativeInsights).orderBy(desc(creativeInsights.createdAt)).limit(1);
  if (!latestRun) return { state: state ?? null, insights: [] };

  const rows = await db.select().from(creativeInsights).where(eq(creativeInsights.runId, latestRun.runId));
  const allCampaignIds = [...new Set(rows.flatMap((row) => JSON.parse(row.evidenceCampaignIdsJson) as string[]))];
  const campaignRows = allCampaignIds.length > 0
    ? await db.select({ id: campaigns.id, title: campaigns.title, location: campaigns.location }).from(campaigns).where(inArray(campaigns.id, allCampaignIds))
    : [];
  const campaignById = new Map(campaignRows.map((row) => [row.id, row]));

  const insights: CreativeInsightWithEvidence[] = rows
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      theme: row.theme,
      description: row.description,
      suggestedReuse: row.suggestedReuse,
      confidence: row.confidence,
      avgCplCents: row.avgCplCents,
      portfolioAvgCplCents: row.portfolioAvgCplCents,
      evidence: (JSON.parse(row.evidenceCampaignIdsJson) as string[])
        .map((id) => campaignById.get(id))
        .filter((row): row is { id: string; title: string; location: string } => Boolean(row)),
    }))
    .sort((a, b) => (a.kind !== b.kind ? (a.kind === "winner" ? -1 : 1) : CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence]));

  return { state: state ?? null, insights };
}
