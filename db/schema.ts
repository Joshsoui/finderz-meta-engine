import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    location: text("location").notNull(),
    salary: text("salary").notNull().default(""),
    description: text("description").notNull().default(""),
    status: text("status", { enum: ["draft", "live", "attention", "paused", "completed"] }).notNull().default("draft"),
    feeCents: integer("fee_cents").notNull(),
    maxBudgetCents: integer("max_budget_cents").notNull(),
    spentCents: integer("spent_cents").notNull().default(0),
    targetCplCents: integer("target_cpl_cents").notNull(),
    primaryText: text("primary_text").notNull(),
    headline: text("headline").notNull(),
    descriptionText: text("description_text").notNull(),
    uspsJson: text("usps_json").notNull(),
    creativePrompt: text("creative_prompt").notNull(),
    backgroundImageUrl: text("background_image_url"),
    logoImageUrl: text("logo_image_url"),
    /** JSON: { "1:1": url, "1.91:1": url, "9:16": url } -- the branded creative baked and uploaded per placement shape when the campaign first goes live. */
    finalCreativeImagesJson: text("final_creative_images_json"),
    /** OTYS vacancy identifier, passed to Meta as a lead form tracking parameter so OTYS can match incoming leads to the right vacancy. */
    otysVacancyId: text("otys_vacancy_id"),
    qualityLeads: integer("quality_leads").notNull().default(0),
    metaCampaignId: text("meta_campaign_id"),
    metaAdId: text("meta_ad_id"),
    metaLeadFormId: text("meta_lead_form_id"),
    /** When the automation last increased this campaign's budget -- enforces a cooldown so a healthy campaign isn't rescaled every 15-minute monitor cycle. */
    budgetScaledAt: text("budget_scaled_at"),
    /** Expected campaign duration in days, used to pace the lifetime budget cap into a daily_budget for Meta -- most vacancy campaigns run 1-2 weeks, but a long-running one needs a much bigger number here. */
    campaignDurationDays: integer("campaign_duration_days").notNull().default(10),
    /** Set once, the first time a campaign goes live -- used to time the periodic creative-freshness nudge on long-running campaigns. */
    liveSince: text("live_since"),
    /** When the periodic "check the creative" nudge last fired for this campaign. */
    lastCreativeCheckAt: text("last_creative_check_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_campaigns_status_updated").on(table.status, table.updatedAt)]
);

export const metricSnapshots = sqliteTable(
  "metric_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    campaignId: text("campaign_id").notNull().references(() => campaigns.id),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    leads: integer("leads").notNull().default(0),
    spendCents: integer("spend_cents").notNull().default(0),
    frequencyHundredths: integer("frequency_hundredths").notNull().default(0),
    recordedAt: text("recorded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_metrics_campaign_recorded").on(table.campaignId, table.recordedAt)]
);

export const pipelineVacancies = sqliteTable(
  "pipeline_vacancies",
  {
    id: text("id").primaryKey(),
    source: text("source", { enum: ["finderzkeeperz", "captainrecruit", "manual"] }).notNull(),
    sourceUrl: text("source_url"),
    title: text("title").notNull(),
    location: text("location").notNull().default(""),
    employmentType: text("employment_type").notNull().default(""),
    salary: text("salary").notNull().default(""),
    description: text("description").notNull().default(""),
    feeCents: integer("fee_cents"),
    /** OTYS vacancy identifier, once the pipeline is fed by the OTYS API instead of scraping -- carried through to a created campaign's own otysVacancyId so lead matching needs no manual copy-paste. */
    otysVacancyId: text("otys_vacancy_id"),
    status: text("status", { enum: ["new", "campaign_created", "dismissed"] }).notNull().default("new"),
    campaignId: text("campaign_id").references(() => campaigns.id),
    firstSeenAt: text("first_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_pipeline_status_updated").on(table.status, table.updatedAt)]
);

export const dailySpendLog = sqliteTable("daily_spend_log", {
  date: text("date").primaryKey(), // YYYY-MM-DD, Europe/Amsterdam local date
  amountCents: integer("amount_cents").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * A lightweight, manual-only stand-in for Meta's campaigns table. Indeed's
 * own Sponsored Jobs API needs a paid partner application and charges per
 * API call, so unlike Meta there's no automation or real campaign object
 * here -- just enough of a record (a title, a running/paused status) to
 * hang daily spend entries off per Indeed campaign, instead of one flat
 * number for "Indeed" as a whole.
 */
export const indeedCampaigns = sqliteTable("indeed_campaigns", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status", { enum: ["active", "paused"] }).notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/** One manually-entered spend amount for one Indeed campaign on one day. */
export const indeedSpendLog = sqliteTable(
  "indeed_spend_log",
  {
    campaignId: text("campaign_id").notNull().references(() => indeedCampaigns.id),
    date: text("date").notNull(), // YYYY-MM-DD, Europe/Amsterdam local date
    amountCents: integer("amount_cents").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.campaignId, table.date] }), index("idx_indeed_spend_date").on(table.date)]
);

export const leads = sqliteTable(
  "leads",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    campaignId: text("campaign_id").notNull().references(() => campaigns.id),
    metaLeadId: text("meta_lead_id").notNull().unique(),
    fullName: text("full_name").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    quality: text("quality", { enum: ["unrated", "good", "bad"] }).notNull().default("unrated"),
    receivedAt: text("received_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_leads_campaign_received").on(table.campaignId, table.receivedAt)]
);

/** Single-row table (id always "meta") tracking whether the Meta API integration is actually working, not just configured -- an expired token or a broken call would otherwise only show up in server logs. */
export const metaSyncHealth = sqliteTable("meta_sync_health", {
  id: text("id").primaryKey(),
  lastSuccessAt: text("last_success_at"),
  lastErrorAt: text("last_error_at"),
  lastErrorMessage: text("last_error_message"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
});

export const optimizationActions = sqliteTable(
  "optimization_actions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    campaignId: text("campaign_id").notNull().references(() => campaigns.id),
    rule: text("rule").notNull(),
    severity: text("severity", { enum: ["info", "attention", "critical"] }).notNull(),
    recommendation: text("recommendation").notNull(),
    status: text("status", { enum: ["pending", "applied", "dismissed"] }).notNull().default("pending"),
    /** Set only on a scale_budget suggestion awaiting approval -- the % increase to apply once a human approves it (see /api/optimization-actions/[id]/approve). */
    budgetChangePercent: integer("budget_change_percent"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    appliedAt: text("applied_at"),
  },
  (table) => [index("idx_actions_campaign_status").on(table.campaignId, table.status)]
);

/** Single-row table (id always "global") holding portfolio-wide settings, currently just the hard cap on combined daily Meta spend across every campaign. */
export const portfolioSettings = sqliteTable("portfolio_settings", {
  id: text("id").primaryKey(),
  maxDailyBudgetCents: integer("max_daily_budget_cents").notNull().default(35000),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Single-row table (id always "meta") caching the whole Meta ad account's
 * spend -- unlike campaigns.spentCents, which only ever covers campaigns
 * this platform itself created, this covers every campaign in the account,
 * including ones made directly in Ads Manager before (or outside of) this
 * platform. Synced from Meta's account-level insights during the 15-minute
 * monitor cycle, not fetched per page load.
 */
export const accountSpendSummary = sqliteTable("account_spend_summary", {
  id: text("id").primaryKey(),
  todayCents: integer("today_cents").notNull().default(0),
  last7dCents: integer("last_7d_cents").notNull().default(0),
  lifetimeCents: integer("lifetime_cents").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * A day-by-day history of accountSpendSummary.todayCents, one row per date
 * -- accountSpendSummary itself only ever holds today/last_7d/lifetime, so
 * without this a spend export could only ever look back 7 days for the
 * whole-account (non-platform-tracked-campaigns-included) Meta figure.
 * Written once per 15-minute monitor cycle alongside accountSpendSummary
 * (each write for "today" simply overwrites the same row until the day
 * rolls over).
 */
export const accountSpendDailyLog = sqliteTable("account_spend_daily_log", {
  date: text("date").primaryKey(), // YYYY-MM-DD, Europe/Amsterdam local date
  amountCents: integer("amount_cents").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ===================================================================
// Radar / Opportunity intelligence layer
//
// Deliberately generic (not Finderz-Keeperz-specific fields baked into
// code): a Company is just a row, Finderz Keeperz is the first one. A
// later company (different industry/region/services) reuses these exact
// tables and the same Radar/Opportunity code with its own profile row and
// its own signal-provider configuration -- the "Industry Autopilot" idea.
// ===================================================================

export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  website: text("website").notNull().default(""),
  industry: text("industry").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * The context the Opportunity Engine matches every signal against. Active
 * vacancies/job categories/locations/salaries are NOT duplicated here --
 * those already live in `campaigns` and `pipelineVacancies` and are read
 * from there directly (see lib/business-profile.ts).
 */
export const businessProfiles = sqliteTable("business_profiles", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull().references(() => companies.id),
  servicesJson: text("services_json").notNull().default("[]"),
  targetAudiencesJson: text("target_audiences_json").notNull().default("[]"),
  regionsJson: text("regions_json").notNull().default("[]"),
  toneOfVoice: text("tone_of_voice").notNull().default(""),
  uspsJson: text("usps_json").notNull().default("[]"),
  /** JSON object: {platform: url}, e.g. {"linkedin": "...", "instagram": "..."}. */
  socialChannelsJson: text("social_channels_json").notNull().default("{}"),
  /** Sectors FK places candidates into, e.g. ["logistiek", "productie", "techniek"]. */
  customerSectorsJson: text("customer_sectors_json").notNull().default("[]"),
  /** Keywords Radar's cheap filter matches signals against -- seeded from the fields above but editable separately for tuning without touching them. */
  keywordsJson: text("keywords_json").notNull().default("[]"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/** One normalized external signal, regardless of which provider found it (see lib/radar/providers). */
export const signals = sqliteTable(
  "signals",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(), // "news" | "regional" | "labour_market" | ...
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
    /** sourceUrl when present, else a hash of provider+title+publishedAt -- unique so overlapping RSS windows or re-runs never insert the same story twice. */
    dedupeKey: text("dedupe_key").notNull().unique(),
    publishedAt: text("published_at"),
    detectedAt: text("detected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    category: text("category").notNull().default(""),
    regionsJson: text("regions_json").notNull().default("[]"),
    companiesJson: text("companies_json").notNull().default("[]"),
    industriesJson: text("industries_json").notNull().default("[]"),
    jobCategoriesJson: text("job_categories_json").notNull().default("[]"),
    keywordsJson: text("keywords_json").notNull().default("[]"),
    /** Raw provider payload, kept for debugging/re-analysis without re-fetching the source. */
    rawDataJson: text("raw_data_json"),
    /** Set once the free, rule-based cheap filter has matched this against the business profile -- only signals where this is true ever cost an AI call (section 12 cost control). */
    passedCheapFilter: integer("passed_cheap_filter", { mode: "boolean" }).notNull().default(false),
    status: text("status", { enum: ["new", "analyzed", "irrelevant"] }).notNull().default("new"),
  },
  (table) => [
    index("idx_signals_status_detected").on(table.status, table.detectedAt),
    index("idx_signals_provider_detected").on(table.provider, table.detectedAt),
  ]
);

/** AI-scored marketing/recruitment opportunity derived from one signal. */
export const opportunities = sqliteTable(
  "opportunities",
  {
    id: text("id").primaryKey(),
    signalId: text("signal_id").notNull().references(() => signals.id),
    companyId: text("company_id").notNull().references(() => companies.id),
    title: text("title").notNull(),
    score: integer("score").notNull(),
    relevanceScore: integer("relevance_score").notNull(),
    timelinessScore: integer("timeliness_score").notNull(),
    audienceFitScore: integer("audience_fit_score").notNull(),
    regionalFitScore: integer("regional_fit_score").notNull(),
    commercialPotentialScore: integer("commercial_potential_score").notNull(),
    contentPotentialScore: integer("content_potential_score").notNull(),
    recruitmentPotentialScore: integer("recruitment_potential_score").notNull(),
    whyNow: text("why_now").notNull(),
    /** campaigns.id values of matching active vacancies -- looked up at scoring time, never duplicated as separate rows. */
    matchingCampaignIdsJson: text("matching_campaign_ids_json").notNull().default("[]"),
    /** e.g. ["instagram", "facebook", "linkedin", "meta_ads"]. */
    recommendedChannelsJson: text("recommended_channels_json").notNull().default("[]"),
    /** Guardrail verdict from the AI pass itself (section 7). False means this must never be promoted to content generation, regardless of score. */
    isAppropriate: integer("is_appropriate", { mode: "boolean" }).notNull().default(true),
    guardrailReason: text("guardrail_reason"),
    status: text("status", {
      enum: ["detected", "analyzed", "opportunity", "content_generated", "review", "approved", "ready_to_publish", "dismissed"],
    }).notNull().default("opportunity"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_opportunities_status_score").on(table.status, table.score),
    index("idx_opportunities_company_created").on(table.companyId, table.createdAt),
  ]
);

/** Approve/dismiss feedback on an opportunity -- the raw material for later learning (section 10/13). */
export const opportunityFeedback = sqliteTable("opportunity_feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  opportunityId: text("opportunity_id").notNull().references(() => opportunities.id),
  action: text("action", { enum: ["dismissed", "approved"] }).notNull(),
  reason: text("reason", {
    enum: ["irrelevant", "wrong_audience", "too_commercial", "not_interesting", "wrong_timing", "other"],
  }),
  note: text("note"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/** One piece of channel-native content generated from an opportunity -- never one text copy-pasted across channels (section 6). */
export const contentPieces = sqliteTable(
  "content_pieces",
  {
    id: text("id").primaryKey(),
    opportunityId: text("opportunity_id").notNull().references(() => opportunities.id),
    channel: text("channel", {
      enum: ["linkedin", "instagram", "instagram_story", "facebook", "meta_ad", "werkinnoordholland"],
    }).notNull(),
    /** Shape depends on channel -- see lib/content-engine.ts ContentByChannel. */
    contentJson: text("content_json").notNull(),
    /** Source signal URL(s) the copy is allowed to reference -- guards against the AI inventing facts (section 7). */
    sourceUrlsJson: text("source_urls_json").notNull().default("[]"),
    status: text("status", { enum: ["review", "approved", "ready_to_publish", "dismissed"] }).notNull().default("review"),
    /** Set once a meta_ad piece has produced a real campaign via the existing Meta Engine flow -- closes Signal -> Opportunity -> Content -> Campaign -> Performance (section 10) without a separate performance table; performance itself stays in the existing metricSnapshots/leads tables. */
    campaignId: text("campaign_id").references(() => campaigns.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_content_opportunity_channel").on(table.opportunityId, table.channel)]
);

/** Every AI call the intelligence layer makes (the cheap filter is rule-based and free, so this only covers deep opportunity scoring and content generation) -- section 12's cost visibility requirement. */
export const aiUsageLog = sqliteTable(
  "ai_usage_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    purpose: text("purpose", { enum: ["opportunity_scoring", "content_generation"] }).notNull(),
    model: text("model").notNull(),
    relatedId: text("related_id"), // signalId or opportunityId, depending on purpose
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    succeeded: integer("succeeded", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_ai_usage_purpose_created").on(table.purpose, table.createdAt)]
);
