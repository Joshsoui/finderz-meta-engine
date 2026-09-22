// Client-safe channel constants/types -- split out from lib/content-engine.ts
// (which imports @/db and must stay server-only) so client components can
// use these without pulling database code into the browser bundle.

export const CONTENT_CHANNELS = ["linkedin", "instagram", "instagram_story", "facebook", "meta_ad", "werkinnoordholland"] as const;
export type ContentChannel = (typeof CONTENT_CHANNELS)[number];

export const CHANNEL_LABEL: Record<ContentChannel, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  instagram_story: "Instagram Story",
  facebook: "Facebook",
  meta_ad: "Meta Ad",
  werkinnoordholland: "werkinnoordholland.nu",
};

// Channel-native output shapes -- deliberately different per channel (section 6: "Genereer native content per kanaal", not one text copy-pasted everywhere).
export type ChannelContent =
  | { channel: "linkedin"; post: string; cta: string }
  | { channel: "instagram"; hook: string; caption: string; visualConcept: string; reelConcept: string }
  | { channel: "instagram_story"; frames: Array<{ text: string; visualConcept: string }>; cta: string }
  | { channel: "facebook"; post: string; cta: string }
  | { channel: "meta_ad"; primaryText: string; headline: string; description: string; cta: string; creativeConcept: string; audienceSuggestion: string }
  | { channel: "werkinnoordholland"; title: string; body: string; cta: string };
