"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { BrainCircuit, Euro, LoaderCircle, Plus, Sparkles, Upload, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { type Campaign, type CampaignRow, rowToCampaign } from "@/lib/campaign-client";
import { DEFAULT_CAMPAIGN_DURATION_DAYS, deriveDailyBudgetCents } from "@/lib/campaign-engine";

const euro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export type NewCampaignInitialValues = {
  title?: string;
  location?: string;
  salary?: string;
  description?: string;
  fee?: string;
  otysVacancyId?: string;
  durationDays?: string;
};

export function NewCampaignSheet({
  onCreate, initialValues, trigger,
}: {
  onCreate: (campaign: Campaign) => void;
  initialValues?: NewCampaignInitialValues;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialValues?.title ?? "Technisch Medewerker Buitendienst");
  const [location, setLocation] = useState(initialValues?.location ?? "Noord-Holland");
  const [salary, setSalary] = useState(initialValues?.salary ?? "€ 3.200 – € 4.000");
  const [fee, setFee] = useState(initialValues?.fee ?? "7000");
  const [durationDays, setDurationDays] = useState(initialValues?.durationDays ?? String(DEFAULT_CAMPAIGN_DURATION_DAYS));
  const [description, setDescription] = useState(
    initialValues?.description ?? "Werk zelfstandig op locatie, los technische storingen op en onderhoud installaties. Mbo 2 elektrotechniek, rijbewijs B en klantgerichte instelling."
  );
  const [otysVacancyId, setOtysVacancyId] = useState(initialValues?.otysVacancyId ?? "");
  const [logoImage, setLogoImage] = useState<string>();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  function readLogo(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2_000_000) {
      toast.error("Gebruik een PNG, JPG, WebP of SVG van maximaal 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      setIsUploadingLogo(true);
      try {
        const response = await fetch("/api/upload-logo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: String(reader.result) }),
        });
        const payload = await response.json() as { url?: string; error?: string };
        if (!response.ok || !payload.url) throw new Error(payload.error || "Logo uploaden is niet gelukt.");
        setLogoImage(payload.url);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Logo uploaden is niet gelukt.");
      } finally {
        setIsUploadingLogo(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function createCampaign() {
    const numericFee = Math.max(Number(fee) || 0, 0);
    const numericDuration = Math.max(Number(durationDays) || DEFAULT_CAMPAIGN_DURATION_DAYS, 1);
    if (!title.trim() || !location.trim() || !description.trim() || numericFee <= 0) {
      toast.error("Vul de functie, locatie, vacaturetekst en fee in.");
      return;
    }
    setIsGenerating(true);
    try {
      const vacancy = {
        title: title.trim(), location: location.trim(), salary: salary.trim(),
        description: description.trim(), fee: numericFee, durationDays: numericDuration,
      };
      const analysisResponse = await fetch("/api/analyze-vacancy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vacancy),
      });
      const analysisPayload = await analysisResponse.json() as {
        analysis?: {
          maxBudget: number;
          targetCpl: number;
          usps: [string, string, string];
          copy: { primaryText: string; headline: string; description: string };
          creative: { backgroundPrompt: string };
        };
        error?: string;
      };
      if (!analysisResponse.ok || !analysisPayload.analysis) {
        throw new Error(analysisPayload.error || "De vacature kon niet worden geanalyseerd.");
      }

      const analysis = analysisPayload.analysis;
      let backgroundImage: string | undefined;
      let backgroundError: string | undefined;
      const backgroundResponse = await fetch("/api/generate-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: analysis.creative.backgroundPrompt,
          title: vacancy.title,
          location: vacancy.location,
        }),
      });
      const backgroundPayload = await backgroundResponse.json() as { image?: string; error?: string };
      if (backgroundResponse.ok && backgroundPayload.image) backgroundImage = backgroundPayload.image;
      else backgroundError = backgroundPayload.error;

      const createResponse = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...vacancy,
          usps: analysis.usps,
          copy: analysis.copy,
          backgroundPrompt: analysis.creative.backgroundPrompt,
          backgroundImageUrl: backgroundImage,
          logoImageUrl: logoImage,
          otysVacancyId: otysVacancyId.trim() || undefined,
        }),
      });
      const createPayload = await createResponse.json() as { campaign?: CampaignRow; error?: string };
      if (!createResponse.ok || !createPayload.campaign) {
        throw new Error(createPayload.error || "De campagne kon niet worden opgeslagen.");
      }

      onCreate(rowToCampaign(createPayload.campaign));
      setOpen(false);
      if (backgroundImage) {
        toast.success("Complete advertentieset gegenereerd", {
          description: "Beeld, copy, USP's en drie exportformaten staan klaar.",
        });
      } else {
        toast.warning("Campagneconcept staat klaar", {
          description: backgroundError || "Voeg de OpenAI-sleutel toe om de achtergrond te genereren.",
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Genereren is niet gelukt.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? <button className="primary-button"><Plus className="size-4" />Nieuwe campagne</button>}
      </SheetTrigger>
      <SheetContent className="w-full border-[#23526f] bg-[#0e324e] p-0 text-white sm:max-w-xl">
        <SheetHeader className="border-b border-white/10 px-6 py-6">
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-[#0f8db7]/15 text-[#5bc0df]">
            <WandSparkles className="size-5" />
          </div>
          <SheetTitle className="text-xl text-white">Campagne genereren</SheetTitle>
          <SheetDescription className="text-[#91aabb]">
            De vacature wordt vertaald naar doelgroep, teksten, creative en een budgetplafond van 20% van de fee.
          </SheetDescription>
        </SheetHeader>
        <div className="scrollbar-gutter-stable scrollbar-thin flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <label className="field-label">Functietitel
            <input className="field-input" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field-label">Locatie
              <input className="field-input" value={location} onChange={(event) => setLocation(event.target.value)} />
            </label>
            <label className="field-label">Salaris
              <input className="field-input" value={salary} onChange={(event) => setSalary(event.target.value)} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field-label">Verwachte plaatsingsfee
              <div className="relative">
                <Euro className="absolute left-3 top-3.5 size-4 text-[#6f8798]" />
                <input className="field-input pl-9" inputMode="numeric" value={fee} onChange={(event) => setFee(event.target.value)} />
              </div>
            </label>
            <label className="field-label">Verwachte looptijd (dagen)
              <input className="field-input" inputMode="numeric" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} />
            </label>
          </div>
          <div className="budget-preview">
            <div><span>Maximaal advertentiebudget</span><strong>{euro.format((Number(fee) || 0) * 0.2)}</strong></div>
            <span className="rule-pill">20% van fee</span>
          </div>
          <p className="text-xs leading-5 text-[#7f97a8]">
            Meta krijgt hiervan een dagbudget van circa {euro.format(deriveDailyBudgetCents(Math.round((Number(fee) || 0) * 0.2 * 100), Math.max(Number(durationDays) || DEFAULT_CAMPAIGN_DURATION_DAYS, 1)) / 100)}, gespreid over de opgegeven looptijd. Loopt de campagne langer (bijv. één die je bewust langer laat draaien), zet de looptijd dan hoger zodat het budget niet te snel opraakt.
          </p>
          <label className="field-label">Vacatureomschrijving
            <textarea className="field-input min-h-32 resize-none leading-6" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="field-label">OTYS vacature-ID <span className="font-normal text-[#607b8d]">optioneel · voor leadmatching</span>
            <input className="field-input" placeholder="Plak hier de vacature-code uit OTYS" value={otysVacancyId} onChange={(event) => setOtysVacancyId(event.target.value)} />
          </label>
          <label className="field-label">Finderz Keeperz-logo <span className="font-normal text-[#607b8d]">optioneel · PNG, JPG, WebP of SVG</span>
            <span className="logo-upload">
              {isUploadingLogo ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {isUploadingLogo ? "Logo uploaden…" : logoImage ? "Logo toegevoegd · wijzigen" : "Logo uploaden"}
              <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => readLogo(event.target.files?.[0])} disabled={isUploadingLogo} />
            </span>
          </label>
          <div className="rounded-xl border border-[#196085] bg-[#13425e] p-4">
            <div className="flex gap-3">
              <BrainCircuit className="mt-0.5 size-5 shrink-0 text-[#5bc0df]" />
              <div>
                <p className="text-sm font-semibold text-white">Analyse bij genereren</p>
                <p className="mt-1 text-sm leading-6 text-[#91aabb]">Doelgroep, propositie, drie USP&apos;s, teksten, beeldbriefing en KPI-grenzen worden automatisch opgesteld.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 p-6">
          <button className="primary-button w-full justify-center disabled:cursor-wait disabled:opacity-60" onClick={createCampaign} disabled={isGenerating || isUploadingLogo}>
            {isGenerating ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {isGenerating ? "Advertentieset wordt gemaakt…" : "Analyseer en genereer"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
