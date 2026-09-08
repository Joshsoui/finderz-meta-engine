import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
