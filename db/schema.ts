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
    metaLeadFormId: text("meta_lead_form_id"),
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

export const optimizationActions = sqliteTable(
  "optimization_actions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    campaignId: text("campaign_id").notNull().references(() => campaigns.id),
    rule: text("rule").notNull(),
    severity: text("severity", { enum: ["info", "attention", "critical"] }).notNull(),
    recommendation: text("recommendation").notNull(),
    status: text("status", { enum: ["pending", "applied", "dismissed"] }).notNull().default("pending"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    appliedAt: text("applied_at"),
  },
  (table) => [index("idx_actions_campaign_status").on(table.campaignId, table.status)]
);
