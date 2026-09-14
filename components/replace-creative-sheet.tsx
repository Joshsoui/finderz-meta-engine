"use client";

import { useState } from "react";
import { LoaderCircle, RefreshCw, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { CreativePreview } from "@/components/creative-preview";
import { renderCreative, type CreativeData, type CreativeFormat } from "@/lib/creative-renderer";

type AdInfo = { id: string; name: string; thumbnailUrl?: string };

/** Everything renderCreative() needs to composite the new creative, plus the AI prompt used to generate a fresh background. */
type CampaignCreativeInfo = CreativeData & { backgroundPrompt?: string };

function ReplaceCreativeBuilder({
  campaignId, campaign, ad, onClose, onReplaced,
}: {
  campaignId: string;
  campaign: CampaignCreativeInfo;
  ad: AdInfo;
  onClose: () => void;
  onReplaced: () => void;
}) {
  const [backgroundImage, setBackgroundImage] = useState<string | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function generateAiBackground() {
    setIsGenerating(true);
    try {
      const response = await fetch("/api/generate-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: campaign.backgroundPrompt || `Realistische recruitmentfoto van een ${campaign.title} tijdens het werk. Nederlandse werkomgeving, ruimte voor advertentietekst.`,
          title: campaign.title,
          location: campaign.location,
        }),
      });
      const payload = await response.json() as { image?: string; error?: string };
      if (!response.ok || !payload.image) throw new Error(payload.error || "Achtergrond genereren is niet gelukt.");
      setBackgroundImage(payload.image);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Achtergrond genereren is niet gelukt.");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleUpload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 8_000_000) {
      toast.error("Gebruik een afbeelding van maximaal 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setBackgroundImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function confirmReplace() {
    if (!backgroundImage) return;
    setIsSaving(true);
    try {
      const previewData: CreativeData = { ...campaign, backgroundImage };
      const formats: CreativeFormat[] = ["1:1", "1.91:1", "9:16"];
      const urlByFormat: Partial<Record<CreativeFormat, string>> = {};
      for (const format of formats) {
        const dataUrl = await renderCreative(previewData, format);
        const uploadResponse = await fetch("/api/upload-creative", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });
        const uploadPayload = await uploadResponse.json() as { url?: string; error?: string };
        if (!uploadResponse.ok || !uploadPayload.url) throw new Error(uploadPayload.error || `Creative (${format}) kon niet worden geüpload.`);
        urlByFormat[format] = uploadPayload.url;
      }

      const response = await fetch(`/api/campaigns/${campaignId}/ads/${ad.id}/replace-creative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrls: { square: urlByFormat["1:1"], landscape: urlByFormat["1.91:1"], story: urlByFormat["9:16"] } }),
      });
      const payload = await response.json() as { newAdId?: string; error?: string };
      if (!response.ok || !payload.newAdId) throw new Error(payload.error || "Advertentie kon niet worden vervangen.");

      toast.success("Nieuwe advertentie staat klaar, de oude is gepauzeerd");
      onReplaced();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Advertentie kon niet worden vervangen.");
    } finally {
      setIsSaving(false);
    }
  }

  const previewCampaign: CreativeData = { ...campaign, backgroundImage };

  return (
    <>
      <SheetHeader className="border-b border-white/10 px-6 py-6">
        <SheetTitle className="text-xl text-white">Foto vervangen</SheetTitle>
        <SheetDescription className="text-[#91aabb]">
          Voor &quot;{ad.name}&quot;. Meta laat de foto van een lopende advertentie niet in-place wisselen — dit maakt een nieuwe advertentie aan met dezelfde tekst en het leadformulier, en pauzeert daarna alleen deze ene advertentie. Andere advertenties in deze campagne blijven ongemoeid.
        </SheetDescription>
      </SheetHeader>
      <div className="scrollbar-gutter-stable scrollbar-thin flex-1 space-y-5 overflow-y-auto px-6 py-6">
        <div className="flex flex-wrap gap-2">
          <button className="secondary-button disabled:cursor-wait disabled:opacity-60" onClick={generateAiBackground} disabled={isGenerating}>
            {isGenerating ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {isGenerating ? "Bezig met genereren…" : "Nieuwe AI-achtergrond"}
          </button>
          <label className="secondary-button">
            <Upload className="size-4" />Eigen foto uploaden
            <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleUpload(event.target.files?.[0])} />
          </label>
        </div>
        <div className="creative-stage">
          {backgroundImage ? (
            <CreativePreview campaign={previewCampaign} format="1:1" />
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-[#7f97a8]">
              {ad.thumbnailUrl && <img src={ad.thumbnailUrl} alt="" className="mb-2 size-16 rounded-lg border border-white/10 object-cover" />}
              Kies hierboven een nieuwe AI-achtergrond of upload een eigen foto om een voorbeeld te zien.
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-white/10 p-6">
        <button className="primary-button w-full justify-center disabled:cursor-wait disabled:opacity-60" onClick={confirmReplace} disabled={!backgroundImage || isSaving}>
          {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {isSaving ? "Bezig met vervangen…" : "Advertentie vervangen"}
        </button>
      </div>
    </>
  );
}

export function ReplaceCreativeSheet({
  open, campaignId, campaign, ad, onClose, onReplaced,
}: {
  open: boolean;
  campaignId: string;
  campaign: CampaignCreativeInfo;
  ad: AdInfo | null;
  onClose: () => void;
  onReplaced: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full border-[#23526f] bg-[#0e324e] p-0 text-white sm:max-w-xl">
        {/* Keyed on the ad id so reopening for a different ad resets the picked image instead of carrying over the previous one. */}
        {open && ad && <ReplaceCreativeBuilder key={ad.id} campaignId={campaignId} campaign={campaign} ad={ad} onClose={onClose} onReplaced={onReplaced} />}
      </SheetContent>
    </Sheet>
  );
}
