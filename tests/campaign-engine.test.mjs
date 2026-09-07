import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

const { generateCampaign, evaluateCampaign, MAX_BUDGET_SHARE } = await vite.ssrLoadModule("/lib/campaign-engine.ts");

const baseVacancy = {
  title: "Elektromonteur Infra",
  location: "IJmuiden",
  salary: "€ 3.500 – € 4.500",
  description: "Werk aan bruggen, sluizen en gemalen rond het Noordzeekanaal.",
  fee: 8000,
};

function baseMetrics(overrides = {}) {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    frequency: 0,
    targetCpl: 50,
    maxBudget: 1600,
    ...overrides,
  };
}

test("MAX_BUDGET_SHARE is 20%", () => {
  assert.equal(MAX_BUDGET_SHARE, 0.2);
});

test("generateCampaign caps the budget at 20% of the fee", () => {
  const result = generateCampaign(baseVacancy);
  assert.equal(result.maxBudget, 1600);
});

test("generateCampaign rounds the budget and target CPL to whole cents", () => {
  const result = generateCampaign({ ...baseVacancy, fee: 333.33, targetLeads: 7 });
  // 333.33 * 0.2 = 66.666 -> rounds to 66.67
  assert.equal(result.maxBudget, 66.67);
  // 66.67 / 7 = 9.524... -> rounds to 9.52
  assert.equal(result.targetCpl, 9.52);
});

test("generateCampaign defaults targetLeads to 28 when not given", () => {
  const result = generateCampaign(baseVacancy);
  // maxBudget 1600 / 28 leads = 57.142... -> rounds to 57.14
  assert.equal(result.targetCpl, 57.14);
});

test("generateCampaign clamps a zero or negative targetLeads to at least 1", () => {
  const zero = generateCampaign({ ...baseVacancy, targetLeads: 0 });
  const negative = generateCampaign({ ...baseVacancy, targetLeads: -5 });
  assert.equal(zero.targetCpl, zero.maxBudget);
  assert.equal(negative.targetCpl, negative.maxBudget);
});

test("generateCampaign falls back to a generic salary line when none is given", () => {
  const result = generateCampaign({ ...baseVacancy, salary: undefined });
  assert.equal(result.usps[0], "Goed salaris");
  assert.match(result.copy.description, /^Goed salaris/);
});

test("generateCampaign trims whitespace in title and location throughout the output", () => {
  const result = generateCampaign({ ...baseVacancy, title: "  Monteur  ", location: "  Almere  " });
  assert.equal(result.audience.region, "Almere");
  assert.equal(result.copy.headline, "Monteur | Almere");
  assert.match(result.creative.backgroundPrompt, /monteur/);
  assert.match(result.creative.backgroundPrompt, /Almere/);
  assert.equal(result.creative.overlay.title, "Monteur");
});

test("generateCampaign never mentions a logo, watermark or AI artifacts in the background brief", () => {
  const result = generateCampaign(baseVacancy);
  assert.match(result.creative.backgroundPrompt, /Geen logo, letters, watermerk/);
});

test("evaluateCampaign pauses once spend reaches the budget ceiling", () => {
  const decision = evaluateCampaign(baseMetrics({ spend: 1600, leads: 5 }));
  assert.equal(decision.rule, "budget_ceiling");
  assert.equal(decision.action, "pause");
  assert.equal(decision.severity, "critical");
});

test("evaluateCampaign pauses on spend without any leads after enough reach", () => {
  const decision = evaluateCampaign(baseMetrics({ spend: 100, impressions: 2000, leads: 0, targetCpl: 50 }));
  assert.equal(decision.rule, "no_leads_after_spend");
  assert.equal(decision.action, "pause");
});

test("evaluateCampaign does not pause on zero leads if reach or spend is still too low", () => {
  const lowReach = evaluateCampaign(baseMetrics({ spend: 100, impressions: 1000, leads: 0, targetCpl: 50 }));
  const lowSpend = evaluateCampaign(baseMetrics({ spend: 10, impressions: 2000, leads: 0, targetCpl: 50 }));
  assert.notEqual(lowReach.rule, "no_leads_after_spend");
  assert.notEqual(lowSpend.rule, "no_leads_after_spend");
});

test("evaluateCampaign pauses when CPL is more than 50% above target", () => {
  const decision = evaluateCampaign(baseMetrics({ spend: 300, leads: 3, targetCpl: 50 }));
  // cpl = 100, target*1.5 = 75 -> above limit
  assert.equal(decision.rule, "cpl_above_limit");
  assert.equal(decision.action, "pause");
});

test("evaluateCampaign does not pause on CPL until there are at least 3 leads", () => {
  const decision = evaluateCampaign(baseMetrics({ spend: 300, leads: 2, targetCpl: 50 }));
  assert.notEqual(decision.rule, "cpl_above_limit");
});

test("evaluateCampaign flags creative fatigue on high frequency", () => {
  const decision = evaluateCampaign(baseMetrics({ frequency: 3, leads: 0 }));
  assert.equal(decision.rule, "creative_fatigue");
  assert.equal(decision.action, "refresh_creative");
  assert.equal(decision.severity, "attention");
});

test("evaluateCampaign flags creative fatigue on low CTR after enough impressions", () => {
  const decision = evaluateCampaign(baseMetrics({ impressions: 2000, clicks: 5, frequency: 1 }));
  // ctr = 0.25% < 0.8%
  assert.equal(decision.rule, "creative_fatigue");
});

test("evaluateCampaign recommends scaling the budget by 15% on a healthy CPL", () => {
  const decision = evaluateCampaign(baseMetrics({ spend: 100, leads: 4, targetCpl: 50, frequency: 1 }));
  // cpl = 25 <= target 50
  assert.equal(decision.rule, "healthy_cpl");
  assert.equal(decision.action, "scale_budget");
  assert.equal(decision.budgetChangePercent, 15);
});

test("evaluateCampaign keeps learning when there isn't enough evidence yet", () => {
  const decision = evaluateCampaign(baseMetrics({ spend: 20, leads: 1, targetCpl: 50 }));
  assert.equal(decision.rule, "learning");
  assert.equal(decision.action, "keep_running");
  assert.equal(decision.budgetChangePercent, 0);
});

test("evaluateCampaign prioritizes the budget ceiling over every other rule", () => {
  const decision = evaluateCampaign(baseMetrics({ spend: 1600, leads: 5, targetCpl: 50, frequency: 5 }));
  // Also matches cpl_above_limit and creative_fatigue, but budget_ceiling must win.
  assert.equal(decision.rule, "budget_ceiling");
});
