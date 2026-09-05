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
    metaCampaignId: text("meta_campaign_id"),
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
