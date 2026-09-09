"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2, ExternalLink, LoaderCircle, MapPin, Plus, RefreshCw, Sparkles, X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { NewCampaignSheet } from "@/components/new-campaign-sheet";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import type { Campaign } from "@/lib/campaign-client";

type PipelineSource = "finderzkeeperz" | "captainrecruit" | "manual";
type PipelineStatus = "new" | "campaign_created" | "dismissed";

type PipelineVacancy = {
  id: string;
  source: PipelineSource;
  sourceUrl: string | null;
  title: string;
  location: string;
  employmentType: string;
  salary: string;
  description: string;
  feeCents: number | null;
  otysVacancyId: string | null;
  status: PipelineStatus;
  campaignId: string | null;
  firstSeenAt: string;
  updatedAt: string;
};

const SOURCE_LABEL: Record<PipelineSource, string> = {
  finderzkeeperz: "Finderz Keeperz",
  captainrecruit: "Captain Recruit",
  manual: "Handmatig",
};

function AddManualVacancySheet({ onAdded }: { onAdded: (vacancy: PipelineVacancy) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [salary, setSalary] = useState("");
  const [description, setDescription] = useState("");
  const [fee, setFee] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    if (!title.trim() || !description.trim()) {
      toast.error("Titel en omschrijving zijn verplicht.");
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), location: location.trim(), employmentType: employmentType.trim(),
          salary: salary.trim(), description: description.trim(),
          fee: fee ? Number(fee) : undefined,
        }),
      });
      const payload = await response.json() as { vacancy?: PipelineVacancy; error?: string };
      if (!response.ok || !payload.vacancy) throw new Error(payload.error || "Vacature kon niet worden toegevoegd.");
      onAdded(payload.vacancy);
      setOpen(false);
      setTitle(""); setLocation(""); setEmploymentType(""); setSalary(""); setDescription(""); setFee("");
      toast.success("Vacature toegevoegd aan de pipeline");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Vacature kon niet worden toegevoegd.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="secondary-button"><Plus className="size-4" />Vacature toevoegen</button>
      </SheetTrigger>
      <SheetContent className="w-full border-[#23526f] bg-[#0e324e] p-0 text-white sm:max-w-xl">
        <SheetHeader className="border-b border-white/10 px-6 py-6">
          <SheetTitle className="text-xl text-white">Vacature toevoegen aan pipeline</SheetTitle>
          <SheetDescription className="text-[#91aabb]">Handmatig een vacature toevoegen die niet via scrapen binnenkomt.</SheetDescription>
        </SheetHeader>
        <div className="scrollbar-gutter-stable scrollbar-thin flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <label className="field-label">Functietitel
            <input className="field-input" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field-label">Locatie
              <input className="field-input" value={location} onChange={(event) => setLocation(event.target.value)} />
            </label>
            <label className="field-label">Dienstverband
              <input className="field-input" value={employmentType} onChange={(event) => setEmploymentType(event.target.value)} placeholder="Fulltime / Parttime" />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field-label">Salaris <span className="font-normal text-[#607b8d]">optioneel</span>
              <input className="field-input" value={salary} onChange={(event) => setSalary(event.target.value)} />
            </label>
            <label className="field-label">Verwachte plaatsingsfee <span className="font-normal text-[#607b8d]">optioneel</span>
              <input className="field-input" inputMode="numeric" value={fee} onChange={(event) => setFee(event.target.value)} />
            </label>
          </div>
          <label className="field-label">Vacatureomschrijving
            <textarea className="field-input min-h-32 resize-none leading-6" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
        </div>
        <div className="border-t border-white/10 p-6">
          <button className="primary-button w-full justify-center disabled:cursor-wait disabled:opacity-60" onClick={save} disabled={isSaving}>
            {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {isSaving ? "Bezig met opslaan…" : "Toevoegen aan pipeline"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VacancyCard({
  vacancy, onDismiss, onRestore, onCampaignCreated,
}: {
  vacancy: PipelineVacancy;
  onDismiss: (id: string) => void;
  onRestore: (id: string) => void;
  onCampaignCreated: (vacancyId: string, campaign: Campaign) => void;
}) {
  return (
    <article className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="rounded-full bg-[#134b6c] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#82cbe1]">{SOURCE_LABEL[vacancy.source]}</span>
          <h3 className="mt-2 text-base font-semibold text-white">{vacancy.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#7f97a8]">
            {vacancy.location && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{vacancy.location}</span>}
            {vacancy.employmentType && <span className="flex items-center gap-1"><Building2 className="size-3.5" />{vacancy.employmentType}</span>}
            {vacancy.salary && <span>{vacancy.salary}</span>}
          </div>
        </div>
        {vacancy.sourceUrl && (
          <a href={vacancy.sourceUrl} target="_blank" rel="noreferrer" className="secondary-button shrink-0">
            <ExternalLink className="size-4" />Bekijk vacature
          </a>
        )}
      </div>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#91aabb]">{vacancy.description}</p>
      {vacancy.status === "new" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <NewCampaignSheet
            initialValues={{
              title: vacancy.title,
              location: vacancy.location,
              salary: vacancy.salary,
              description: vacancy.description,
              fee: vacancy.feeCents ? String(vacancy.feeCents / 100) : undefined,
              otysVacancyId: vacancy.otysVacancyId ?? undefined,
            }}
            trigger={<button className="primary-button"><Sparkles className="size-4" />Start campagne</button>}
            onCreate={(campaign) => onCampaignCreated(vacancy.id, campaign)}
          />
          <button className="secondary-button" onClick={() => onDismiss(vacancy.id)}><X className="size-4" />Negeren</button>
        </div>
      )}
      {vacancy.status === "dismissed" && (
        <div className="mt-4">
          <button className="secondary-button" onClick={() => onRestore(vacancy.id)}><RefreshCw className="size-4" />Terugzetten naar nieuw</button>
        </div>
      )}
      {vacancy.status === "campaign_created" && (
        <div className="mt-4 text-sm font-semibold text-[#5cc8e8]">Omgezet naar campagne</div>
      )}
    </article>
  );
}

export default function Pipeline() {
  const [vacancies, setVacancies] = useState<PipelineVacancy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function loadVacancies() {
    try {
      const response = await fetch("/api/pipeline");
      const payload = await response.json() as { vacancies?: PipelineVacancy[]; error?: string };
      if (!response.ok || !payload.vacancies) throw new Error(payload.error || "Pipeline kon niet worden geladen.");
      setVacancies(payload.vacancies);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pipeline kon niet worden geladen.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/pipeline");
        const payload = await response.json() as { vacancies?: PipelineVacancy[]; error?: string };
        if (!response.ok || !payload.vacancies) throw new Error(payload.error || "Pipeline kon niet worden geladen.");
        if (!cancelled) setVacancies(payload.vacancies);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Pipeline kon niet worden geladen.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/pipeline/refresh", { method: "POST" });
      const payload = await response.json() as { scanned?: number; upserted?: number; errors?: string[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Verversen is niet gelukt.");
      await loadVacancies();
      if (payload.errors?.length) {
        toast.warning(`Vernieuwd met fouten: ${payload.errors.join("; ")}`);
      } else {
        toast.success(`Pipeline ververst — ${payload.upserted ?? 0} vacatures gecontroleerd.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verversen is niet gelukt.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function updateStatus(id: string, status: PipelineStatus, campaignId?: string) {
    setVacancies((current) => current.map((vacancy) => vacancy.id === id ? { ...vacancy, status, campaignId: campaignId ?? vacancy.campaignId } : vacancy));
    try {
      const response = await fetch(`/api/pipeline/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaignId ? { status, campaignId } : { status }),
      });
      if (!response.ok) throw new Error("Wijziging kon niet worden opgeslagen.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Wijziging kon niet worden opgeslagen.");
    }
  }

  function handleCampaignCreated(vacancyId: string, campaign: Campaign) {
    updateStatus(vacancyId, "campaign_created", campaign.id);
    toast.success("Campagne aangemaakt vanuit deze vacature");
  }

  const grouped = useMemo(() => ({
    new: vacancies.filter((vacancy) => vacancy.status === "new"),
    campaign_created: vacancies.filter((vacancy) => vacancy.status === "campaign_created"),
    dismissed: vacancies.filter((vacancy) => vacancy.status === "dismissed"),
  }), [vacancies]);

  return (
    <AppShell
      active="pipeline"
      title="Vacature-pipeline"
      subtitle="Nieuwe vacatures van Finderz Keeperz, Captain Recruit en handmatige invoer"
      headerActions={(
        <>
          <button className="secondary-button" onClick={refresh} disabled={isRefreshing}>
            {isRefreshing ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {isRefreshing ? "Bezig met verversen…" : "Ververs nu"}
          </button>
          <AddManualVacancySheet onAdded={(vacancy) => setVacancies((current) => [vacancy, ...current])} />
        </>
      )}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
      ) : (
        <Tabs defaultValue="new" className="gap-4">
          <TabsList variant="line" className="w-full justify-start gap-6 overflow-x-auto border-b border-white/8">
            <TabsTrigger value="new" className="h-11 px-0 text-[#7891a2] data-[state=active]:text-white after:bg-[#35b7df]">Nieuw ({grouped.new.length})</TabsTrigger>
            <TabsTrigger value="campaign_created" className="h-11 px-0 text-[#7891a2] data-[state=active]:text-white after:bg-[#35b7df]">Omgezet naar campagne ({grouped.campaign_created.length})</TabsTrigger>
            <TabsTrigger value="dismissed" className="h-11 px-0 text-[#7891a2] data-[state=active]:text-white after:bg-[#35b7df]">Genegeerd ({grouped.dismissed.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="new" className="space-y-4">
            {grouped.new.length === 0 && <p className="py-12 text-center text-sm text-[#7f97a8]">Geen nieuwe vacatures. Klik op &quot;Ververs nu&quot; om de sites opnieuw te controleren.</p>}
            {grouped.new.map((vacancy) => (
              <VacancyCard key={vacancy.id} vacancy={vacancy} onDismiss={(id) => updateStatus(id, "dismissed")} onRestore={(id) => updateStatus(id, "new")} onCampaignCreated={handleCampaignCreated} />
            ))}
          </TabsContent>
          <TabsContent value="campaign_created" className="space-y-4">
            {grouped.campaign_created.length === 0 && <p className="py-12 text-center text-sm text-[#7f97a8]">Nog geen vacatures omgezet naar een campagne.</p>}
            {grouped.campaign_created.map((vacancy) => (
              <VacancyCard key={vacancy.id} vacancy={vacancy} onDismiss={(id) => updateStatus(id, "dismissed")} onRestore={(id) => updateStatus(id, "new")} onCampaignCreated={handleCampaignCreated} />
            ))}
          </TabsContent>
          <TabsContent value="dismissed" className="space-y-4">
            {grouped.dismissed.length === 0 && <p className="py-12 text-center text-sm text-[#7f97a8]">Niets genegeerd.</p>}
            {grouped.dismissed.map((vacancy) => (
              <VacancyCard key={vacancy.id} vacancy={vacancy} onDismiss={(id) => updateStatus(id, "dismissed")} onRestore={(id) => updateStatus(id, "new")} onCampaignCreated={handleCampaignCreated} />
            ))}
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}
