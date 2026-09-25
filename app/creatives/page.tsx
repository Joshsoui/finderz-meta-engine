"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2, Download, ImageIcon, LoaderCircle, Sparkles, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { CreativePreview } from "@/components/creative-preview";
import {
  type Campaign, type CampaignRow, rowToCampaign, statusLabel,
} from "@/lib/campaign-client";
import {
  CREATIVE_DIMENSIONS, downloadCreative, type CreativeFormat,
} from "@/lib/creative-renderer";

type CreativeVariant = {
  id: string;
  headline: string;
  primaryText: string;
  descriptionText: string;
  uspsJson: string;
  rationale: string;
  status: "review" | "approved" | "dismissed";
  createdAt: string;
};

/**
 * The Creative Builder, one step below the Analyst on /analyse: generates a
 * new ad-copy variant that explicitly applies the Analyst's current winning
 * patterns, for a human to review here. Never auto-applied to a live ad --
 * see app/api/campaigns/[id]/variants/[variantId] for what "approve"
 * actually does for a draft vs. a live campaign.
 */
function VariantsSection({ campaign, onApplied }: { campaign: Campaign; onApplied: (update: Partial<Campaign>) => void }) {
  const [variants, setVariants] = useState<CreativeVariant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/campaigns/${campaign.id}/variants`);
        const payload = await response.json() as { variants?: CreativeVariant[]; error?: string };
        if (response.ok && payload.variants && !cancelled) setVariants(payload.variants);
      } catch {
        // The card still works without variants; fail quietly.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign.id]);

  async function generate() {
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/variants`, { method: "POST" });
      const payload = await response.json() as { variant?: CreativeVariant; error?: string };
      if (!response.ok || !payload.variant) throw new Error(payload.error || "Testvariant kon niet worden gegenereerd.");
      setVariants((current) => [payload.variant!, ...current]);
      toast.success("Nieuwe testvariant gegenereerd");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Testvariant kon niet worden gegenereerd.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function decide(variant: CreativeVariant, status: "approved" | "dismissed") {
    setProcessingId(variant.id);
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/variants/${variant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json() as { variant?: CreativeVariant; appliedToCampaign?: boolean; error?: string };
      if (!response.ok || !payload.variant) throw new Error(payload.error || "Kon niet worden verwerkt.");
      setVariants((current) => current.map((item) => (item.id === variant.id ? payload.variant! : item)));
      if (payload.appliedToCampaign) {
        let usps: [string, string, string] = ["", "", ""];
        try {
          const parsed = JSON.parse(variant.uspsJson);
          if (Array.isArray(parsed) && parsed.length === 3) usps = parsed as [string, string, string];
        } catch {
          // keep fallback
        }
        onApplied({ headline: variant.headline, primaryText: variant.primaryText, adDescription: variant.descriptionText, usps });
        toast.success("Toegepast op de campagne (nog concept, dus zonder Meta te raken)");
      } else if (status === "approved") {
        toast.success("Goedgekeurd -- kopieer de tekst hieronder voor een nieuwe campagne of om de live advertentie handmatig te vervangen");
      } else {
        toast.info("Variant afgewezen");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kon niet worden verwerkt.");
    } finally {
      setProcessingId(null);
    }
  }

  const active = variants.filter((variant) => variant.status !== "dismissed");

  return (
    <div className="mt-5 border-t border-white/8 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#607b8d]">Testvariaties</p>
          <p className="mt-0.5 text-xs text-[#6f8798]">Nieuwe copy op basis van winnende patronen uit <span className="text-[#5bc0df]">/analyse</span></p>
        </div>
        <button className="secondary-button !h-8 !px-2.5 !text-xs" onClick={() => void generate()} disabled={isGenerating}>
          {isGenerating ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {isGenerating ? "Bezig…" : "Genereer variant"}
        </button>
      </div>
      {isLoading ? null : active.length === 0 ? (
        <p className="mt-3 text-xs text-[#7f97a8]">Nog geen testvariaties voor deze campagne.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {active.map((variant) => {
            let usps: string[] = [];
            try {
              const parsed = JSON.parse(variant.uspsJson);
              if (Array.isArray(parsed)) usps = parsed;
            } catch {
              // keep empty
            }
            return (
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3.5" key={variant.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className={"status " + (variant.status === "approved" ? "status-good" : "status-attention")}>
                    <span />{variant.status === "approved" ? "Goedgekeurd" : "Ter review"}
                  </span>
                  {variant.status === "review" && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button className="secondary-button !h-7 !px-2 !text-xs" onClick={() => void decide(variant, "dismissed")} disabled={processingId === variant.id}>
                        <X className="size-3.5" />Afwijzen
                      </button>
                      <button className="primary-button !h-7 !px-2 !text-xs" onClick={() => void decide(variant, "approved")} disabled={processingId === variant.id}>
                        {processingId === variant.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}Goedkeuren
                      </button>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs leading-5 text-[#91aabb]">{variant.rationale}</p>
                <p className="mt-2 text-sm font-semibold text-white">{variant.headline}</p>
                <p className="mt-1 text-xs leading-5 text-[#c4d1d9]">{variant.primaryText}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {usps.filter((usp) => usp.trim()).map((usp) => <span key={usp} className="rule-pill">{usp}</span>)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreativeCard({ campaign, onDelete, onUpdate }: { campaign: Campaign; onDelete: (id: string) => void; onUpdate: (id: string, update: Partial<Campaign>) => void }) {
  const [format, setFormat] = useState<CreativeFormat>("1:1");
  const [isDeleting, setIsDeleting] = useState(false);

  async function exportCreative() {
    try {
      await downloadCreative(campaign, format);
      toast.success(`${CREATIVE_DIMENSIONS[format].label} gedownload`);
    } catch {
      toast.error("De advertentie kon niet worden geëxporteerd.");
    }
  }

  async function deleteCampaign() {
    if (!window.confirm(`"${campaign.title}" definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
      const payload = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok || !payload.deleted) throw new Error(payload.error || "Campagne kon niet worden verwijderd.");
      toast.success("Campagne verwijderd");
      onDelete(campaign.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Campagne kon niet worden verwijderd.");
      setIsDeleting(false);
    }
  }

  return (
    <article className="panel overflow-hidden">
      <div className="panel-header">
        <div>
          <div className="eyebrow"><ImageIcon className="size-3.5" />{statusLabel(campaign.status)}</div>
          <h2>{campaign.title}</h2>
          <p className="mt-1 text-sm text-[#6f8798]">{campaign.location}</p>
        </div>
        {campaign.status !== "live" && (
          <button className="secondary-button" disabled={isDeleting} onClick={() => void deleteCampaign()} title="Verwijder deze campagne">
            {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </button>
        )}
      </div>
      <div className="space-y-4 p-5">
        <div className="format-switch" aria-label="Advertentieformaat">
          {(Object.keys(CREATIVE_DIMENSIONS) as CreativeFormat[]).map((value) => (
            <button key={value} className={format === value ? "active" : ""} onClick={() => setFormat(value)}>
              {value}<span>{CREATIVE_DIMENSIONS[value].label.split(" ")[0]}</span>
            </button>
          ))}
        </div>
        <div className="creative-stage">
          <CreativePreview campaign={campaign} format={format} />
          {!campaign.backgroundImage && <div className="creative-notice"><ImageIcon className="size-4" />Nog geen AI-achtergrond</div>}
        </div>
        <button className="primary-button w-full justify-center" onClick={exportCreative}><Download className="size-4" />Download PNG</button>
        <VariantsSection campaign={campaign} onApplied={(update) => onUpdate(campaign.id, update)} />
      </div>
    </article>
  );
}

export default function CreativesPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/campaigns");
        const payload = await response.json() as { campaigns?: CampaignRow[]; error?: string };
        if (!response.ok || !payload.campaigns) throw new Error(payload.error || "Campagnes konden niet worden geladen.");
        if (cancelled) return;
        setCampaigns(payload.campaigns.map(rowToCampaign));
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Campagnes konden niet worden geladen.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function removeCampaign(id: string) {
    setCampaigns((current) => current.filter((campaign) => campaign.id !== id));
  }

  function updateCampaign(id: string, update: Partial<Campaign>) {
    setCampaigns((current) => current.map((campaign) => (campaign.id === id ? { ...campaign, ...update } : campaign)));
  }

  return (
    <AppShell active="creatives" title="Creatives" subtitle="Alle advertentie-creatives per campagne, in elk formaat te downloaden">
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
      ) : campaigns.length === 0 ? (
        <p className="py-24 text-center text-sm text-[#7f97a8]">Nog geen campagnes met een creative.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((campaign) => <CreativeCard key={campaign.id} campaign={campaign} onDelete={removeCampaign} onUpdate={updateCampaign} />)}
        </div>
      )}
    </AppShell>
  );
}
