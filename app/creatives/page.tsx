"use client";

import { useEffect, useState } from "react";
import { Download, ImageIcon, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { CreativePreview } from "@/components/creative-preview";
import {
  type Campaign, type CampaignRow, rowToCampaign, statusLabel,
} from "@/lib/campaign-client";
import {
  CREATIVE_DIMENSIONS, downloadCreative, type CreativeFormat,
} from "@/lib/creative-renderer";

function CreativeCard({ campaign, onDelete }: { campaign: Campaign; onDelete: (id: string) => void }) {
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

  return (
    <AppShell active="creatives" title="Creatives" subtitle="Alle advertentie-creatives per campagne, in elk formaat te downloaden">
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
      ) : campaigns.length === 0 ? (
        <p className="py-24 text-center text-sm text-[#7f97a8]">Nog geen campagnes met een creative.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((campaign) => <CreativeCard key={campaign.id} campaign={campaign} onDelete={removeCampaign} />)}
        </div>
      )}
    </AppShell>
  );
}
