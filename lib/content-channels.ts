// Client-safe channel constants/types -- split out from lib/content-engine.ts
// (which imports @/db and must stay server-only) so client components can
// use these without pulling database code into the browser bundle.

export const CONTENT_CHANNELS = [
  "linkedin", "instagram", "instagram_story", "reel", "facebook", "meta_ad", "blog", "landing_page", "email_campaign", "werkinnoordholland",
] as const;
export type ContentChannel = (typeof CONTENT_CHANNELS)[number];

export const CHANNEL_LABEL: Record<ContentChannel, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  instagram_story: "Instagram Story",
  reel: "Reel",
  facebook: "Facebook",
  meta_ad: "Meta Ad",
  blog: "Blog",
  landing_page: "Landingspagina",
  email_campaign: "E-mailcampagne",
  werkinnoordholland: "werkinnoordholland.nu",
};

// Channel-native output shapes -- deliberately different per channel (section 6: "Genereer native content per kanaal", not one text copy-pasted everywhere).
export type ChannelContent =
  | { channel: "linkedin"; post: string; cta: string }
  | { channel: "instagram"; hook: string; caption: string; visualConcept: string; reelConcept: string }
  | { channel: "instagram_story"; frames: Array<{ text: string; visualConcept: string }>; cta: string }
  | { channel: "reel"; hook: string; script: Array<{ scene: string; visual: string }>; caption: string; cta: string }
  | { channel: "facebook"; post: string; cta: string }
  | { channel: "meta_ad"; primaryText: string; headline: string; description: string; cta: string; creativeConcept: string; audienceSuggestion: string }
  | { channel: "blog"; title: string; intro: string; body: string; cta: string }
  | { channel: "landing_page"; headline: string; subheadline: string; body: string; cta: string }
  | { channel: "email_campaign"; subject: string; preheader: string; body: string; cta: string }
  | { channel: "werkinnoordholland"; title: string; body: string; cta: string };
