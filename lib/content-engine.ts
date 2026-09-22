import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { actionsTaken, aiUsageLog, campaigns, contentPieces, opportunities, signals } from "@/db/schema";
import { ACTION_TO_CONTENT_CHANNEL, type ActionType } from "@/lib/action-types";
import { getBusinessProfile } from "@/lib/business-profile";
import type { ContentChannel } from "@/lib/content-channels";

const CHANNEL_TO_ACTION: Partial<Record<ContentChannel, ActionType>> = Object.fromEntries(
  Object.entries(ACTION_TO_CONTENT_CHANNEL).map(([action, channel]) => [channel, action])
);

const CHANNEL_SCHEMA: Record<ContentChannel, { instructions: string; schema: Record<string, unknown> }> = {
  linkedin: {
    instructions: "Schrijf professionele LinkedIn-content vanuit werkgever/recruitment-perspectief: meer context en onderbouwing dan op Instagram, passend bij een zakelijk publiek. Sluit af met een duidelijke CTA.",
    schema: {
      type: "object", additionalProperties: false,
      properties: { post: { type: "string" }, cta: { type: "string" } },
      required: ["post", "cta"],
    },
  },
  instagram: {
    instructions: "Schrijf een korte, pakkende Instagram-caption met sterke hook in de eerste regel. Beschrijf ook een visueel concept voor het beeld, en een Reel-concept als het onderwerp zich daarvoor leent (anders een lege string).",
    schema: {
      type: "object", additionalProperties: false,
      properties: { hook: { type: "string" }, caption: { type: "string" }, visualConcept: { type: "string" }, reelConcept: { type: "string" } },
      required: ["hook", "caption", "visualConcept", "reelConcept"],
    },
  },
  instagram_story: {
    instructions: "Ontwerp 2 tot 4 Instagram Story-frames: elk frame een korte tekst (max ~15 woorden) plus een visueel concept. Eindig met een CTA-frame.",
    schema: {
      type: "object", additionalProperties: false,
      properties: {
        frames: { type: "array", minItems: 2, maxItems: 4, items: { type: "object", additionalProperties: false, properties: { text: { type: "string" }, visualConcept: { type: "string" } }, required: ["text", "visualConcept"] } },
        cta: { type: "string" },
      },
      required: ["frames", "cta"],
    },
  },
  reel: {
    instructions: "Schrijf een kort Reel-script: een scroll-stopping hook, 3 tot 6 scenes (elk een korte regie-aanwijzing + wat er in beeld gebeurt), een caption en een CTA.",
    schema: {
      type: "object", additionalProperties: false,
      properties: {
        hook: { type: "string" },
        script: { type: "array", minItems: 3, maxItems: 6, items: { type: "object", additionalProperties: false, properties: { scene: { type: "string" }, visual: { type: "string" } }, required: ["scene", "visual"] } },
        caption: { type: "string" }, cta: { type: "string" },
      },
      required: ["hook", "script", "caption", "cta"],
    },
  },
  facebook: {
    instructions: "Schrijf toegankelijke, laagdrempelige Facebook-content, eventueel met een lokale/regionale insteek. Leadgericht: duidelijk wat de lezer moet doen. Sluit af met een CTA.",
    schema: {
      type: "object", additionalProperties: false,
      properties: { post: { type: "string" }, cta: { type: "string" } },
      required: ["post", "cta"],
    },
  },
  meta_ad: {
    instructions: "Schrijf Meta-advertentiecopy: primaryText (max 420 tekens), headline (max 70 tekens, geen klantnaam), description (max 35 tekens), cta, een beeldconcept (creativeConcept) en een korte doelgroepsuggestie (audienceSuggestion, bijv. leeftijd/regio/interesse). Benoem nooit een klant- of werkgeversnaam.",
    schema: {
      type: "object", additionalProperties: false,
      properties: {
        primaryText: { type: "string" }, headline: { type: "string" }, description: { type: "string" },
        cta: { type: "string" }, creativeConcept: { type: "string" }, audienceSuggestion: { type: "string" },
      },
      required: ["primaryText", "headline", "description", "cta", "creativeConcept", "audienceSuggestion"],
    },
  },
  blog: {
    instructions: "Schrijf een kort blogartikel (titel, intro-alinea, body met kopjes waar relevant, CTA) dat het onderwerp uitlegt vanuit het perspectief van het bedrijf, gebaseerd op de brongegevens.",
    schema: {
      type: "object", additionalProperties: false,
      properties: { title: { type: "string" }, intro: { type: "string" }, body: { type: "string" }, cta: { type: "string" } },
      required: ["title", "intro", "body", "cta"],
    },
  },
  landing_page: {
    instructions: "Schrijf landingspagina-copy: headline, subheadline, body (kort, scanbaar, met de kern van het aanbod) en CTA.",
    schema: {
      type: "object", additionalProperties: false,
      properties: { headline: { type: "string" }, subheadline: { type: "string" }, body: { type: "string" }, cta: { type: "string" } },
      required: ["headline", "subheadline", "body", "cta"],
    },
  },
  email_campaign: {
    instructions: "Schrijf een e-mailcampagne: subject line, preheader (korte preview-tekst), body en CTA.",
    schema: {
      type: "object", additionalProperties: false,
      properties: { subject: { type: "string" }, preheader: { type: "string" }, body: { type: "string" }, cta: { type: "string" } },
      required: ["subject", "preheader", "body", "cta"],
    },
  },
  werkinnoordholland: {
    instructions: "Schrijf kandidaatgerichte, regionale content voor werkinnoordholland.nu: een titel, body-tekst gericht op werkzoekenden in Noord-Holland, en een CTA. Vacaturegericht wanneer er een matchende vacature is.",
    schema: {
      type: "object", additionalProperties: false,
      properties: { title: { type: "string" }, body: { type: "string" }, cta: { type: "string" } },
      required: ["title", "body", "cta"],
    },
  },
};

async function logAiUsage(model: string, relatedId: string, succeeded: boolean) {
  const db = await getDb();
  await db.insert(aiUsageLog).values({ purpose: "content_generation", model, relatedId, succeeded, createdAt: new Date().toISOString() });
}

export type GenerateContentResult = { contentPieceId: string } | { error: string };

/** Generates and persists one channel-native content piece for an opportunity (section 6). Guardrail-blocked opportunities are refused here too, not just hidden in the UI. */
export async function generateContentForChannel(opportunityId: string, channel: ContentChannel): Promise<GenerateContentResult> {
  const db = await getDb();
  const [opportunity] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
  if (!opportunity) return { error: "Opportunity niet gevonden" };
  if (!opportunity.isAppropriate) return { error: `Deze opportunity is geblokkeerd door de guardrail: ${opportunity.guardrailReason ?? "onbekende reden"}` };

  const [signalRow] = await db.select().from(signals).where(eq(signals.id, opportunity.signalId)).limit(1);
  if (!signalRow) return { error: "Bijbehorend signal niet gevonden" };

  const matchingCampaignIds = JSON.parse(opportunity.matchingCampaignIdsJson) as string[];
  const matchingVacancies = matchingCampaignIds.length > 0
    ? await db.select({ title: campaigns.title, location: campaigns.location, salary: campaigns.salary }).from(campaigns).where(eq(campaigns.id, matchingCampaignIds[0]))
    : [];

  const profile = await getBusinessProfile();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: "OPENAI_API_KEY ontbreekt -- content genereren is nog niet geconfigureerd" };
  const model = process.env.OPENAI_TEXT_MODEL || "gpt-5-mini";
  const channelConfig = CHANNEL_SCHEMA[channel];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      instructions: [
        `Je schrijft Nederlandse contentmarketing voor ${profile.name} (${profile.industry}), tone of voice: ${profile.toneOfVoice || "professioneel en concreet"}.`,
        "Baseer je uitsluitend op de meegegeven opportunity en bron -- verzin geen feiten, cijfers of quotes die daar niet in staan.",
        channelConfig.instructions,
      ].join(" "),
      input: JSON.stringify({
        opportunityTitle: opportunity.title,
        whyNow: opportunity.whyNow,
        sourceSignal: { title: signalRow.title, summary: signalRow.summary, source: signalRow.source },
        matchingVacancies,
      }),
      text: { format: { type: "json_schema", name: `content_${channel}`, strict: true, schema: channelConfig.schema } },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  await logAiUsage(model, opportunityId, response.ok);
  if (!response.ok) return { error: "Content genereren is niet gelukt (AI-aanroep faalde)" };

  const result = (await response.json()) as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const outputText = result.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!outputText) return { error: "Content genereren is niet gelukt (leeg AI-antwoord)" };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    return { error: "Content genereren is niet gelukt (ongeldig AI-antwoord)" };
  }

  const contentPieceId = crypto.randomUUID();
  const now = new Date().toISOString();
  const sourceUrls = signalRow.sourceUrl ? [signalRow.sourceUrl] : [];

  await db.insert(contentPieces).values({
    id: contentPieceId,
    opportunityId,
    channel,
    contentJson: JSON.stringify({ channel, ...parsed }),
    sourceUrlsJson: JSON.stringify(sourceUrls),
    status: "review",
    createdAt: now,
    updatedAt: now,
  });

  await db.update(opportunities).set({ status: "content_generated", updatedAt: now }).where(eq(opportunities.id, opportunityId));

  const matchedAction = CHANNEL_TO_ACTION[channel];
  if (matchedAction) {
    await db.insert(actionsTaken).values({ opportunityId, action: matchedAction, status: "chosen", contentPieceId, createdAt: now });
  }

  return { contentPieceId };
}
