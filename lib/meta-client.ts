// Meta Marketing API client -- prepared ahead of a real Meta connection.
//
// IMPORTANT: none of this has been exercised against the real Graph API yet.
// It's written directly against Meta's documented Marketing API contracts
// (Graph API v21.0), but there is no way to test it end-to-end until real
// credentials exist (META_ACCESS_TOKEN / META_AD_ACCOUNT_ID / META_PAGE_ID)
// and the app has been through Meta App Review for ads_management, ads_read,
// leads_retrieval and pages_show_list. Treat the first real run as a test:
// watch the response bodies closely, and expect to adjust field names or
// defaults against whatever Meta actually returns.
//
// Safety default: every object this creates (campaign, ad set, ad) is left
// PAUSED. Nothing spends real money until a human explicitly activates the
// campaign in Meta Ads Manager. That's a deliberate choice, not an oversight --
// change it only if you're sure you want this tool to start spend on its own.

const META_API_VERSION = "v21.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export type MetaCredentials = { accessToken: string; adAccountId: string; pageId: string };

/** Reads Meta credentials from the environment; null if any piece is missing (sandbox mode). */
export function getMetaCredentials(): MetaCredentials | null {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const pageId = process.env.META_PAGE_ID;
  if (!accessToken || !adAccountId || !pageId) return null;
  return { accessToken, adAccountId, pageId };
}

type MetaErrorBody = { error?: { message?: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string } };

async function metaRequest<T>(
  path: string,
  accessToken: string,
  init: { method?: "GET" | "POST"; params?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const url = new URL(`${META_GRAPH_BASE}${path}`);
  const method = init.method ?? "GET";
  const params = { ...init.params, access_token: accessToken };

  let response: Response;
  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    response = await fetch(url, { method: "GET" });
  } else {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) body.set(key, String(value));
    }
    response = await fetch(url, { method: "POST", body });
  }

  const payload = (await response.json()) as T & MetaErrorBody;
  if (!response.ok || payload.error) {
    const message = payload.error?.message || `Meta API request failed (${response.status})`;
    throw new Error(`${message} [${path}]`);
  }
  return payload;
}

/**
 * Best-effort geo targeting: resolves a Dutch place name (e.g. "Amsterdam")
 * to a Meta targeting key. Falls back to country-level (Netherlands)
 * targeting if the lookup fails or returns nothing usable -- better to run
 * a slightly too-broad ad than to fail campaign creation over targeting.
 */
async function resolveGeoTargeting(accessToken: string, location: string) {
  try {
    const result = await metaRequest<{ data?: Array<{ key: string; type: string; name: string }> }>(
      "/search",
      accessToken,
      { params: { type: "adgeolocation", location_types: JSON.stringify(["city", "region"]), q: location, limit: 1 } },
    );
    const match = result.data?.[0];
    if (match) {
      const field = match.type === "region" ? "regions" : "cities";
      return { [field]: [{ key: match.key, radius: match.type === "city" ? 25 : undefined, distance_unit: match.type === "city" ? "km" : undefined }] };
    }
  } catch {
    // Fall through to the country-level default below.
  }
  return { countries: ["NL"] };
}

async function createLeadForm(credentials: MetaCredentials, title: string, otysVacancyId?: string): Promise<string> {
  const result = await metaRequest<{ id: string }>(`/${credentials.pageId}/leadgen_forms`, credentials.accessToken, {
    method: "POST",
    params: {
      name: `${title} - sollicitatieformulier`,
      questions: JSON.stringify([{ type: "FULL_NAME" }, { type: "EMAIL" }, { type: "PHONE" }]),
      privacy_policy: JSON.stringify({ url: "https://finderzkeeperz.nl/privacy", link_text: "Privacybeleid" }),
      locale: "nl_NL",
      // Invisible to the applicant, but returned with every lead fetched via
      // the API -- this is how OTYS matches an incoming lead back to the
      // right vacancy (mirrors the "Vacancy ID" tracking parameter that was
      // previously typed by hand into Meta's own form editor).
      ...(otysVacancyId ? { tracking_parameters: JSON.stringify({ vacancy_id: otysVacancyId }) } : {}),
    },
  });
  return result.id;
}

async function uploadAdImage(credentials: MetaCredentials, imageUrl: string): Promise<{ hash: string }> {
  const result = await metaRequest<{ images: Record<string, { hash: string }> }>(
    `/act_${credentials.adAccountId}/adimages`,
    credentials.accessToken,
    { method: "POST", params: { url: imageUrl } },
  );
  const first = Object.values(result.images)[0];
  if (!first) throw new Error("Meta did not return an image hash after upload");
  return first;
}

export type CreateMetaCampaignInput = {
  title: string;
  location: string;
  dailyBudgetCents: number;
  primaryText: string;
  headline: string;
  description: string;
  /** Publicly reachable URLs of the branded creative in each placement shape (this worker serves them under /media/...). */
  imageUrls: { square: string; landscape: string; story: string };
  /** OTYS vacancy identifier; passed to Meta as the lead form's "vacancy_id" tracking parameter when set. */
  otysVacancyId?: string;
};

/**
 * Builds the full Meta object graph for one vacancy campaign: a lead form on
 * the Page, a Campaign (Advantage Campaign Budget, so the daily budget lives
 * on the campaign itself), one Ad Set, one Ad Creative, and one Ad. Returns
 * the campaign id to store as `campaigns.metaCampaignId` -- that id alone is
 * enough to fetch insights and to pause/resume/rebudget the campaign later.
 *
 * Everything is created PAUSED. Meta requires job ads to run under the
 * "EMPLOYMENT" special ad category, which also means Meta will broaden or
 * ignore age/gender targeting regardless of what's requested here -- that's
 * expected, not a bug.
 */
export async function createMetaCampaign(input: CreateMetaCampaignInput): Promise<{ metaCampaignId: string; metaAdId: string; metaLeadFormId: string }> {
  const credentials = getMetaCredentials();
  if (!credentials) throw new Error("Meta is not configured (missing META_ACCESS_TOKEN / META_AD_ACCOUNT_ID / META_PAGE_ID)");

  const leadFormId = await createLeadForm(credentials, input.title, input.otysVacancyId);

  const campaign = await metaRequest<{ id: string }>(`/act_${credentials.adAccountId}/campaigns`, credentials.accessToken, {
    method: "POST",
    params: {
      name: `${input.title} - ${input.location}`,
      objective: "OUTCOME_LEADS",
      special_ad_categories: JSON.stringify(["EMPLOYMENT"]),
      status: "PAUSED",
      daily_budget: input.dailyBudgetCents,
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    },
  });

  const targeting = {
    age_min: 23,
    age_max: 55,
    geo_locations: await resolveGeoTargeting(credentials.accessToken, input.location),
  };

  const adSet = await metaRequest<{ id: string }>(`/act_${credentials.adAccountId}/adsets`, credentials.accessToken, {
    method: "POST",
    params: {
      name: `${input.title} - adset`,
      campaign_id: campaign.id,
      optimization_goal: "LEAD_GENERATION",
      billing_event: "IMPRESSIONS",
      status: "PAUSED",
      targeting: JSON.stringify(targeting),
      promoted_object: JSON.stringify({ page_id: credentials.pageId }),
    },
  });

  const [squareImage, landscapeImage, storyImage] = await Promise.all([
    uploadAdImage(credentials, input.imageUrls.square),
    uploadAdImage(credentials, input.imageUrls.landscape),
    uploadAdImage(credentials, input.imageUrls.story),
  ]);

  // asset_feed_spec + asset_customization_rules is Meta's documented way to
  // serve a different image per placement shape from one ad: the square
  // crop is the default (also set as the object_story_spec base image, for
  // any placement the rules below don't cover), the landscape crop goes to
  // Feed-shaped placements, and the vertical crop goes to Stories/Reels.
  const creative = await metaRequest<{ id: string }>(`/act_${credentials.adAccountId}/adcreatives`, credentials.accessToken, {
    method: "POST",
    params: {
      name: `${input.title} - creative`,
      object_story_spec: JSON.stringify({
        page_id: credentials.pageId,
        link_data: {
          message: input.primaryText,
          name: input.headline,
          description: input.description,
          image_hash: squareImage.hash,
          link: `https://www.facebook.com/${credentials.pageId}`,
          call_to_action: { type: "APPLY_NOW", value: { lead_gen_form_id: leadFormId } },
        },
      }),
      asset_feed_spec: JSON.stringify({
        images: [
          { hash: squareImage.hash, adlabels: [{ name: "square" }] },
          { hash: landscapeImage.hash, adlabels: [{ name: "landscape" }] },
          { hash: storyImage.hash, adlabels: [{ name: "story" }] },
        ],
        ad_formats: ["SINGLE_IMAGE"],
        asset_customization_rules: [
          {
            customization_spec: {
              publisher_platforms: ["facebook", "instagram"],
              facebook_positions: ["story", "facebook_reels"],
              instagram_positions: ["story", "reels"],
            },
            image_label: { name: "story" },
          },
          {
            customization_spec: {
              publisher_platforms: ["facebook", "instagram"],
              facebook_positions: ["feed", "video_feeds", "marketplace", "right_hand_column", "search", "instream_banner"],
              instagram_positions: ["stream", "explore", "explore_home"],
            },
            image_label: { name: "landscape" },
          },
        ],
      }),
    },
  });

  const ad = await metaRequest<{ id: string }>(`/act_${credentials.adAccountId}/ads`, credentials.accessToken, {
    method: "POST",
    params: {
      name: `${input.title} - ad`,
      adset_id: adSet.id,
      status: "PAUSED",
      creative: JSON.stringify({ creative_id: creative.id }),
    },
  });

  return { metaCampaignId: campaign.id, metaAdId: ad.id, metaLeadFormId: leadFormId };
}

export type MetaCampaignInsights = { spend: number; impressions: number; clicks: number; leads: number; frequency: number };

/** Fetches today's cumulative insights for one campaign. */
export async function fetchCampaignInsights(metaCampaignId: string, datePreset: "today" | "lifetime" = "today"): Promise<MetaCampaignInsights> {
  const credentials = getMetaCredentials();
  if (!credentials) throw new Error("Meta is not configured");

  const result = await metaRequest<{
    data?: Array<{ spend?: string; impressions?: string; clicks?: string; frequency?: string; actions?: Array<{ action_type: string; value: string }> }>;
  }>(`/${metaCampaignId}/insights`, credentials.accessToken, {
    params: { fields: "spend,impressions,clicks,frequency,actions", date_preset: datePreset },
  });

  const row = result.data?.[0];
  if (!row) return { spend: 0, impressions: 0, clicks: 0, leads: 0, frequency: 0 };

  const leadAction = row.actions?.find((action) => action.action_type === "lead" || action.action_type === "leadgen.other");
  return {
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    frequency: Number(row.frequency ?? 0),
    leads: Number(leadAction?.value ?? 0),
  };
}

export type MetaAdStatus = { effectiveStatus: string; rejectionReason?: string };

/**
 * Checks whether Meta has actually approved the ad for delivery.
 * effective_status covers review outcomes Meta doesn't otherwise surface
 * anywhere in insights -- a DISAPPROVED ad just shows up as zero spend/leads
 * forever unless something explicitly checks this. effective_status itself
 * is a confirmed, stable Graph API field; issues_info's exact per-entry
 * shape is not (Meta's docs list it as an untyped list), so the rejection
 * text is extracted defensively and may need adjusting once a real
 * disapproval is seen.
 */
export async function fetchAdStatus(metaAdId: string): Promise<MetaAdStatus> {
  const credentials = getMetaCredentials();
  if (!credentials) throw new Error("Meta is not configured");

  const result = await metaRequest<{ effective_status?: string; issues_info?: Array<Record<string, unknown>> }>(
    `/${metaAdId}`,
    credentials.accessToken,
    { params: { fields: "effective_status,issues_info" } },
  );

  const firstIssue = result.issues_info?.[0];
  const rejectionReason = firstIssue
    ? String(firstIssue.error_summary ?? firstIssue.error_message ?? firstIssue.title ?? JSON.stringify(firstIssue))
    : undefined;

  return { effectiveStatus: result.effective_status ?? "UNKNOWN", rejectionReason };
}

export type MetaLead = { metaLeadId: string; fullName: string; email: string; phone: string; receivedAt: string };

/**
 * Fetches leads submitted on a lead form, newest first. Meta's `field_data` is
 * a list of {name, values[]} pairs rather than a flat object, so pull out the
 * three fields we ask for by name (full_name/email/phone -- matches the
 * questions createLeadForm() configures) and tolerate any missing.
 */
export async function fetchNewLeads(leadFormId: string): Promise<MetaLead[]> {
  const credentials = getMetaCredentials();
  if (!credentials) throw new Error("Meta is not configured");

  const result = await metaRequest<{
    data?: Array<{ id: string; created_time: string; field_data?: Array<{ name: string; values: string[] }> }>;
  }>(`/${leadFormId}/leads`, credentials.accessToken, { params: { fields: "id,created_time,field_data", limit: 100 } });

  return (result.data ?? []).map((row) => {
    const field = (name: string) => row.field_data?.find((entry) => entry.name === name)?.values[0] ?? "";
    return {
      metaLeadId: row.id,
      fullName: field("full_name"),
      email: field("email"),
      phone: field("phone"),
      receivedAt: row.created_time,
    };
  });
}

/** Pauses or resumes a campaign on Meta -- used when a decision rule fires, or a human toggles status in the app. */
export async function setMetaCampaignStatus(metaCampaignId: string, status: "ACTIVE" | "PAUSED"): Promise<void> {
  const credentials = getMetaCredentials();
  if (!credentials) throw new Error("Meta is not configured");
  await metaRequest(`/${metaCampaignId}`, credentials.accessToken, { method: "POST", params: { status } });
}

/** Updates the campaign-level daily budget (Advantage Campaign Budget) -- used by the "scale budget" automation rule. */
export async function updateMetaCampaignBudget(metaCampaignId: string, dailyBudgetCents: number): Promise<void> {
  const credentials = getMetaCredentials();
  if (!credentials) throw new Error("Meta is not configured");
  await metaRequest(`/${metaCampaignId}`, credentials.accessToken, {
    method: "POST",
    params: { daily_budget: Math.round(dailyBudgetCents) },
  });
}
