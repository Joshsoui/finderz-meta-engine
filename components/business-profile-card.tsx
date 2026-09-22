"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Pencil, UserRoundCog } from "lucide-react";
import { toast } from "sonner";

type BusinessProfile = {
  companyId: string;
  name: string;
  website: string;
  industry: string;
  services: string[];
  targetAudiences: string[];
  regions: string[];
  toneOfVoice: string;
  usps: string[];
  socialChannels: Record<string, string>;
  customerSectors: string[];
  keywords: string[];
};

type Draft = {
  name: string;
  website: string;
  industry: string;
  toneOfVoice: string;
  services: string;
  targetAudiences: string;
  regions: string;
  usps: string;
  customerSectors: string;
  keywords: string;
};

function toDraft(profile: BusinessProfile): Draft {
  return {
    name: profile.name,
    website: profile.website,
    industry: profile.industry,
    toneOfVoice: profile.toneOfVoice,
    services: profile.services.join(", "),
    targetAudiences: profile.targetAudiences.join(", "),
    regions: profile.regions.join(", "),
    usps: profile.usps.join(", "),
    customerSectors: profile.customerSectors.join(", "),
    keywords: profile.keywords.join(", "),
  };
}

function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

const FIELDS: Array<{ key: keyof Draft; label: string; hint?: string; multiline?: boolean }> = [
  { key: "name", label: "Bedrijfsnaam" },
  { key: "website", label: "Website" },
  { key: "industry", label: "Branche" },
  { key: "toneOfVoice", label: "Tone of voice", hint: "bijv. direct, warm, professioneel", multiline: true },
  { key: "services", label: "Diensten", hint: "komma-gescheiden" },
  { key: "targetAudiences", label: "Doelgroepen", hint: "komma-gescheiden" },
  { key: "regions", label: "Regio's", hint: "komma-gescheiden -- ook gebruikt om Radar-signalen te targeten" },
  { key: "customerSectors", label: "Klantsectoren", hint: "sectoren waar kandidaten geplaatst worden, komma-gescheiden" },
  { key: "usps", label: "USP's", hint: "komma-gescheiden" },
  { key: "keywords", label: "Radar-zoekwoorden", hint: "extra termen voor de cheap filter, komma-gescheiden" },
];

/** Central Company/Business Profile the Opportunity Engine matches every signal against (section 1) -- editable here, read live everywhere else via lib/business-profile.ts. Active vacatures/locaties/salarissen are NOT edited here: those come straight from Campagnes/Pipeline. */
export function BusinessProfileCard() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/business-profile");
        const payload = await response.json() as { profile?: BusinessProfile; error?: string };
        if (!response.ok || !payload.profile) throw new Error(payload.error || "Bedrijfsprofiel kon niet worden geladen.");
        if (cancelled) return;
        setProfile(payload.profile);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Bedrijfsprofiel kon niet worden geladen.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!draft || !profile) return;
    if (!draft.name.trim()) {
      toast.error("Bedrijfsnaam is verplicht.");
      return;
    }
    setIsSaving(true);
    try {
      const body: BusinessProfile = {
        companyId: profile.companyId,
        name: draft.name.trim(),
        website: draft.website.trim(),
        industry: draft.industry.trim(),
        toneOfVoice: draft.toneOfVoice.trim(),
        services: splitList(draft.services),
        targetAudiences: splitList(draft.targetAudiences),
        regions: splitList(draft.regions),
        usps: splitList(draft.usps),
        customerSectors: splitList(draft.customerSectors),
        keywords: splitList(draft.keywords),
        socialChannels: profile.socialChannels,
      };
      const response = await fetch("/api/business-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { profile?: BusinessProfile; error?: string };
      if (!response.ok || !payload.profile) throw new Error(payload.error || "Bedrijfsprofiel kon niet worden opgeslagen.");
      setProfile(payload.profile);
      setIsEditing(false);
      toast.success("Bedrijfsprofiel opgeslagen");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bedrijfsprofiel kon niet worden opgeslagen.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className="panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow"><UserRoundCog className="size-3.5" />Radar &amp; Opportunities</div>
          <h2 className="mt-2">Bedrijfsprofiel</h2>
          <p className="mt-1 text-xs text-[#607b8d]">De context waar de Opportunity Engine elk signaal tegen afzet. Actieve vacatures/locaties/salarissen komen automatisch uit Campagnes en Pipeline.</p>
        </div>
        {!isEditing && !isLoading && (
          <button className="secondary-button shrink-0" onClick={() => { if (profile) setDraft(toDraft(profile)); setIsEditing(true); }}>
            <Pencil className="size-4" />Wijzigen
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
      ) : isEditing && draft ? (
        <div className="mt-4 space-y-3">
          {FIELDS.map((field) => (
            <label className="field-label" key={field.key}>
              {field.label} {field.hint && <span className="font-normal text-[#607b8d]">{field.hint}</span>}
              {field.multiline ? (
                <textarea className="field-input min-h-16 resize-y" value={draft[field.key]} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} />
              ) : (
                <input className="field-input" value={draft[field.key]} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} />
              )}
            </label>
          ))}
          <div className="flex gap-2 pt-1">
            <button className="primary-button" onClick={() => void save()} disabled={isSaving}>
              {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Opslaan
            </button>
            <button className="secondary-button" onClick={() => setIsEditing(false)} disabled={isSaving}>Annuleren</button>
          </div>
        </div>
      ) : profile ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="budget-stat"><span>Bedrijfsnaam</span><strong>{profile.name || "—"}</strong></div>
          <div className="budget-stat"><span>Branche</span><strong>{profile.industry || "—"}</strong></div>
          <div className="budget-stat"><span>Regio&apos;s</span><strong>{profile.regions.join(", ") || "—"}</strong></div>
          <div className="budget-stat"><span>Klantsectoren</span><strong>{profile.customerSectors.join(", ") || "—"}</strong></div>
          <div className="budget-stat sm:col-span-2"><span>Diensten</span><strong>{profile.services.join(", ") || "—"}</strong></div>
          <div className="budget-stat sm:col-span-2"><span>Doelgroepen</span><strong>{profile.targetAudiences.join(", ") || "—"}</strong></div>
        </div>
      ) : null}
    </article>
  );
}
