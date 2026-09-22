// Client-safe action-type constants (section 3: an Opportunity does not
// automatically mean "make a social post" -- these are the full set of
// candidate actions the Action Recommendation Engine scores against every
// opportunity). Kept separate from lib/content-channels.ts because not
// every action produces AI-generated content (ignore/monitor/sales_alert/
// pr_opportunity/website_update are recommend-only, section 3/8).

export const ACTION_TYPES = [
  "ignore", "monitor", "social_post", "linkedin_post", "instagram_post", "instagram_story", "reel",
  "meta_campaign", "blog", "landing_page", "email_campaign", "pr_opportunity", "sales_alert",
  "recruitment_campaign", "website_update",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_LABEL: Record<ActionType, string> = {
  ignore: "Negeren",
  monitor: "Monitoren",
  social_post: "Social post",
  linkedin_post: "LinkedIn post",
  instagram_post: "Instagram post",
  instagram_story: "Instagram Story",
  reel: "Reel",
  meta_campaign: "Meta-campagne",
  blog: "Blog",
  landing_page: "Landingspagina",
  email_campaign: "E-mailcampagne",
  pr_opportunity: "PR-kans",
  sales_alert: "Sales alert",
  recruitment_campaign: "Recruitmentcampagne",
  website_update: "Website-update",
};

/** Which content channel (lib/content-channels.ts) generating this action's content, if any -- ignore/monitor/pr_opportunity/sales_alert/website_update are recommend-only, this platform doesn't generate copy for them. */
export const ACTION_TO_CONTENT_CHANNEL: Partial<Record<ActionType, string>> = {
  social_post: "facebook",
  linkedin_post: "linkedin",
  instagram_post: "instagram",
  instagram_story: "instagram_story",
  reel: "reel",
  meta_campaign: "meta_ad",
  blog: "blog",
  landing_page: "landing_page",
  email_campaign: "email_campaign",
  recruitment_campaign: "werkinnoordholland",
};

export const URGENCY_VALUES = ["evergreen", "normal", "time_sensitive", "breaking"] as const;
export type Urgency = (typeof URGENCY_VALUES)[number];

export const URGENCY_LABEL: Record<Urgency, string> = {
  evergreen: "Evergreen",
  normal: "Normaal",
  time_sensitive: "Tijdsgevoelig",
  breaking: "Breaking",
};
