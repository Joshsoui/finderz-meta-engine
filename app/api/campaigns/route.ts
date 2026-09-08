import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, leads, metricSnapshots } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";
import { generateCampaign, type VacancyInput } from "@/lib/campaign-engine";
import { fetchLeadFormIdForCampaign, fetchNewLeads, getMetaCredentials } from "@/lib/meta-client";

type CreateCampaignInput = VacancyInput & {
  usps?: [string, string, string];
  copy?: { primaryText: string; headline: string; description: string };
  backgroundPrompt?: string;
  backgroundImageUrl?: string;
  logoImageUrl?: string;
  otysVacancyId?: string;
  /** Set when importing a campaign that already exists in Ads Manager (made outside this platform) instead of creating a fresh one. */
  metaCampaignId?: string;
  /** The real campaign's effective_status from Meta at import time, used to seed our own status. */
  importedEffectiveStatus?: string;
  /** The real cumulative spend already on this campaign at import time, so budget tracking starts accurate instead of at 0 until the next monitor cycle. */
  importedSpentCents?: number;
  /** The real cumulative lead count already on this campaign at import time, same reasoning as importedSpentCents. */
  importedLeads?: number;
};

const STATUS_FROM_EFFECTIVE_STATUS: Record<string, "live" | "paused"> = { ACTIVE: "live", PAUSED: "paused" };

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.select().from(campaigns).orderBy(desc(campaigns.updatedAt)).limit(100);

    // impressions/clicks/leads live in metricSnapshots (the monitor loop's
    // periodic pull from Meta), not on the campaigns row itself -- without
    // this join every campaign would show 0 leads on the dashboard
    // regardless of how many it actually has.
    const campaignIds = rows.map((row) => row.id);
    const latestByCampaign = new Map<string, { impressions: number; clicks: number; leads: number }>();
    if (campaignIds.length > 0) {
      const snapshots = await db
        .select({ campaignId: metricSnapshots.campaignId, impressions: metricSnapshots.impressions, clicks: metricSnapshots.clicks, leads: metricSnapshots.leads, recordedAt: metricSnapshots.recordedAt })
        .from(metricSnapshots)
        .where(inArray(metricSnapshots.campaignId, campaignIds))
        .orderBy(desc(metricSnapshots.recordedAt));
      for (const snapshot of snapshots) {
        if (!latestByCampaign.has(snapshot.campaignId)) {
          latestByCampaign.set(snapshot.campaignId, { impressions: snapshot.impressions, clicks: snapshot.clicks, leads: snapshot.leads });
        }
      }
    }

    const enriched = rows.map((row) => ({ ...row, ...(latestByCampaign.get(row.id) ?? { impressions: 0, clicks: 0, leads: 0 }) }));
    return Response.json({ campaigns: enriched });
  } catch (error) {
    return errorResponse(error, "Campaigns unavailable");
  }
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as Partial<CreateCampaignInput>;
    if (!input.title?.trim() || !input.location?.trim() || !input.description?.trim() || !Number.isFinite(input.fee) || Number(input.fee) <= 0) {
      return Response.json({ error: "Complete vacancy data and a positive fee are required" }, { status: 400 });
    }
    const vacancy: VacancyInput = {
      title: input.title,
      location: input.location,
      salary: input.salary,
      description: input.description,
      fee: Number(input.fee),
      targetLeads: input.targetLeads,
      durationDays: input.durationDays,
    };
    const generated = generateCampaign(vacancy);
    const usps = input.usps && input.usps.length === 3 ? input.usps : generated.usps;
    const copy = input.copy ?? generated.copy;
    const backgroundPrompt = input.backgroundPrompt ?? generated.creative.backgroundPrompt;

    const db = await getDb();
    const isImport = Boolean(input.metaCampaignId);
    if (isImport) {
      const [existing] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.metaCampaignId, input.metaCampaignId!)).limit(1);
      if (existing) return Response.json({ error: "Deze campagne is al geïmporteerd" }, { status: 400 });
    }
    const status = isImport ? (STATUS_FROM_EFFECTIVE_STATUS[input.importedEffectiveStatus ?? ""] ?? "attention") : "draft";

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const [campaign] = await db.insert(campaigns).values({
      id,
      title: vacancy.title.trim(),
      location: vacancy.location.trim(),
      salary: vacancy.salary?.trim() || "",
      description: vacancy.description.trim(),
      status,
      feeCents: Math.round(vacancy.fee * 100),
      maxBudgetCents: Math.round(generated.maxBudget * 100),
      spentCents: isImport ? Math.max(0, Math.round(input.importedSpentCents ?? 0)) : 0,
      targetCplCents: Math.round(generated.targetCpl * 100),
      campaignDurationDays: generated.durationDays,
      primaryText: copy.primaryText,
      headline: copy.headline,
      descriptionText: copy.description,
      uspsJson: JSON.stringify(usps),
      creativePrompt: backgroundPrompt,
      backgroundImageUrl: input.backgroundImageUrl,
      logoImageUrl: input.logoImageUrl,
      otysVacancyId: input.otysVacancyId?.trim() || undefined,
      metaCampaignId: input.metaCampaignId,
      liveSince: isImport && status === "live" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    }).returning();

    // Seed a first snapshot from the real numbers at import time -- without
    // this, the dashboard would show 0 leads for an imported campaign until
    // the next 15-minute monitor cycle happens to run.
    if (isImport) {
      await db.insert(metricSnapshots).values({
        campaignId: id,
        spendCents: campaign.spentCents,
        leads: Math.max(0, Math.round(input.importedLeads ?? 0)),
        impressions: 0,
        clicks: 0,
        frequencyHundredths: 0,
        recordedAt: now,
      });

      // A campaign made outside this platform never had its lead form id
      // recorded anywhere -- the aggregate lead *count* is seeded above, but
      // without also finding the real form and pulling the actual lead
      // records (name/email/phone), the Leads page would stay empty for an
      // imported campaign even though the count on the dashboard is right.
      // Non-fatal: the campaign is already created at this point, and the
      // 15-minute monitor cycle would eventually pick this up on its own
      // once metaLeadFormId is set here anyway -- this just avoids the wait.
      if (getMetaCredentials()) {
        try {
          const leadFormId = await fetchLeadFormIdForCampaign(input.metaCampaignId!);
          if (leadFormId) {
            await db.update(campaigns).set({ metaLeadFormId: leadFormId }).where(eq(campaigns.id, id));
            const realLeads = await fetchNewLeads(leadFormId);
            for (const lead of realLeads) {
              await db
                .insert(leads)
                .values({ campaignId: id, metaLeadId: lead.metaLeadId, fullName: lead.fullName, email: lead.email, phone: lead.phone, receivedAt: lead.receivedAt })
                .onConflictDoNothing();
            }
          }
        } catch (error) {
          console.error(`Could not pull real leads for imported campaign ${id}`, error);
        }
      }
    }

    return Response.json({ campaign, generated }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Campaign could not be created");
  }
}
