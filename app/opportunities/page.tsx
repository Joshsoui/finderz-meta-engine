"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Lightbulb, LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OpportunityDetailSheet } from "@/components/opportunity-detail-sheet";
import { CHANNEL_LABEL, type ContentChannel } from "@/lib/content-channels";

type OpportunityRow = {
  id: string;
  title: string;
  score: number;
  whyNow: string;
  matchingCampaignIdsJson: string;
  recommendedChannelsJson: string;
  isAppropriate: boolean;
  status: string;
  createdAt: string;
  signalCategory: string;
  signalRegionsJson: string;
  signalSource: string;
};

type StatusFilter = "all" | "opportunity" | "content_generated" | "review" | "approved" | "ready_to_publish" | "dismissed";
type PeriodFilter = "all" | "today" | "week";

const STATUS_TABS: Array<{ value: StatusFilter; label: string }> = [
  { value: "opportunity", label: "Nieuw" },
  { value: "content_generated", label: "Content klaar" },
  { value: "approved", label: "Goedgekeurd" },
  { value: "all", label: "Alle" },
  { value: "dismissed", label: "Afgewezen" },
];

const dateFormat = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function isToday(iso: string): boolean {
  const date = new Date(iso);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function isThisWeek(iso: string): boolean {
  const date = new Date(iso).getTime();
  return Date.now() - date < 7 * 24 * 60 * 60 * 1000;
}

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("opportunity");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [minScore, setMinScore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      const url = statusFilter === "all" ? "/api/opportunities" : `/api/opportunities?status=${statusFilter}`;
      const response = await fetch(url);
      const payload = await response.json() as { opportunities?: OpportunityRow[]; error?: string };
      if (!response.ok || !payload.opportunities) throw new Error(payload.error || "Opportunities konden niet worden geladen.");
      setOpportunities(payload.opportunities);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Opportunities konden niet worden geladen.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function scanNow() {
    setIsScanning(true);
    try {
      const response = await fetch("/api/radar/scan", { method: "POST" });
      const payload = await response.json() as { analysis?: { opportunitiesCreated: number }; error?: string };
      if (!response.ok) throw new Error(payload.error || "Radar-scan is mislukt.");
      toast.success(payload.analysis ? `Scan klaar -- ${payload.analysis.opportunitiesCreated} nieuwe opportunity/opportunities` : "Scan klaar");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Radar-scan is mislukt.");
    } finally {
      setIsScanning(false);
    }
  }

  const filtered = useMemo(() => {
    return opportunities.filter((opportunity) => {
      if (periodFilter === "today" && !isToday(opportunity.createdAt)) return false;
      if (periodFilter === "week" && !isThisWeek(opportunity.createdAt)) return false;
      if (minScore && opportunity.score < 70) return false;
      return true;
    });
  }, [opportunities, periodFilter, minScore]);

  const highValueCount = opportunities.filter((opportunity) => opportunity.score >= 70 && opportunity.status === "opportunity").length;

  return (
    <AppShell active="opportunities" title="Opportunities" subtitle="AI-gescoorde marketing- en recruitmentkansen uit de Radar">
      <article className="panel overflow-hidden">
        <div className="panel-header">
          <div>
            <div className="eyebrow"><Lightbulb className="size-3.5" />Good morning</div>
            <h2>{highValueCount > 0 ? `${highValueCount} high-value opportunit${highValueCount === 1 ? "y" : "ies"} gedetecteerd` : "Geen nieuwe high-value opportunities"}</h2>
            <p className="mt-1 text-xs text-[#607b8d]">Niets hier wordt automatisch gepubliceerd of geadverteerd -- alles wacht op jouw beoordeling.</p>
          </div>
          <button className="primary-button disabled:cursor-wait disabled:opacity-60" onClick={() => void scanNow()} disabled={isScanning}>
            {isScanning ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {isScanning ? "Bezig met scannen…" : "Scan nu"}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-3">
          <div className="format-switch">
            {STATUS_TABS.map((tab) => (
              <button key={tab.value} className={statusFilter === tab.value ? "active" : ""} onClick={() => setStatusFilter(tab.value)}>{tab.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="format-switch">
              <button className={periodFilter === "all" ? "active" : ""} onClick={() => setPeriodFilter("all")}>Alle tijd</button>
              <button className={periodFilter === "today" ? "active" : ""} onClick={() => setPeriodFilter("today")}>Vandaag</button>
              <button className={periodFilter === "week" ? "active" : ""} onClick={() => setPeriodFilter("week")}>Deze week</button>
            </div>
            <button className={"secondary-button" + (minScore ? " !border-[#3f9d5f] !text-[#7fd99c]" : "")} onClick={() => setMinScore((current) => !current)}>
              Score ≥ 70
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-[#7f97a8]">Geen opportunities voor dit filter. Klik op &quot;Scan nu&quot; om de Radar handmatig te laten zoeken naar nieuwe signalen.</p>
        ) : (
          <div className="divide-y divide-white/8">
            {filtered.map((opportunity) => {
              const recommendedChannels = JSON.parse(opportunity.recommendedChannelsJson) as string[];
              const matchingCount = (JSON.parse(opportunity.matchingCampaignIdsJson) as string[]).length;
              return (
                <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4" key={opportunity.id}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#0f8db7]/15 px-2.5 py-0.5 text-sm font-bold text-[#5bc0df]">{opportunity.score}</span>
                      <span className="text-xs font-bold uppercase tracking-wide text-[#607b8d]">{opportunity.signalCategory.replace("_", " ")}</span>
                      {!opportunity.isAppropriate && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#f2a1a5]"><AlertTriangle className="size-3.5" />Geblokkeerd</span>
                      )}
                    </div>
                    <p className="mt-1 font-semibold text-white">{opportunity.title}</p>
                    <p className="mt-1 text-sm text-[#91aabb]">{opportunity.whyNow}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#6f8798]">
                      <span>{opportunity.signalSource}</span>
                      <span>· {dateFormat.format(new Date(opportunity.createdAt))}</span>
                      {matchingCount > 0 && <span>· {matchingCount} matchende vacature{matchingCount === 1 ? "" : "s"}</span>}
                      {recommendedChannels.length > 0 && <span>· {recommendedChannels.map((channel) => CHANNEL_LABEL[channel as ContentChannel] ?? channel).join(", ")}</span>}
                    </div>
                  </div>
                  <button className="secondary-button shrink-0" onClick={() => setSelectedId(opportunity.id)}>Bekijk</button>
                </div>
              );
            })}
          </div>
        )}
      </article>

      <OpportunityDetailSheet opportunityId={selectedId} onClose={() => setSelectedId(null)} onChanged={() => void load()} />
    </AppShell>
  );
}
