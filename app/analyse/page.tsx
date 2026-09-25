"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Clock3, LoaderCircle, Microscope, Sparkles, TrendingDown, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";

const MIN_CAMPAIGNS_FOR_ANALYSIS = 4;

type CreativeInsight = {
  id: string;
  kind: "winner" | "watchout";
  theme: string;
  description: string;
  suggestedReuse: string;
  confidence: "low" | "medium" | "high";
  avgCplCents: number | null;
  portfolioAvgCplCents: number | null;
  evidence: Array<{ id: string; title: string; location: string }>;
};

type AnalysisState = {
  lastRunAt: string | null;
  lastRunCampaignsAnalyzed: number;
  lastRunPatternsFound: number;
  lastRunError: string | null;
};

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const CONFIDENCE_LABEL: Record<CreativeInsight["confidence"], string> = { high: "Hoge betrouwbaarheid", medium: "Redelijke betrouwbaarheid", low: "Lage betrouwbaarheid" };

function InsightCard({ insight }: { insight: CreativeInsight }) {
  const isWinner = insight.kind === "winner";
  const diffPercent = insight.avgCplCents && insight.portfolioAvgCplCents
    ? Math.round(((insight.avgCplCents - insight.portfolioAvgCplCents) / insight.portfolioAvgCplCents) * 100)
    : null;

  return (
    <article className="panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={"status " + (isWinner ? "status-good" : "status-attention")}>
          <span />{isWinner ? "Winnend patroon" : "Let op"}
        </span>
        <span className="text-xs font-bold uppercase tracking-wide text-[#607b8d]">{CONFIDENCE_LABEL[insight.confidence]}</span>
      </div>
      <h3 className="mt-2 text-base font-semibold text-white">{insight.theme}</h3>
      <p className="mt-1 text-sm leading-6 text-[#c4d1d9]">{insight.description}</p>

      <div className="mt-4 rounded-xl border border-[#206389] bg-[#13425e] p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#82cbe1]">Om te hergebruiken</p>
        <p className="mt-1.5 text-sm leading-6 text-[#dcebf1]">{insight.suggestedReuse}</p>
      </div>

      {insight.avgCplCents !== null && insight.portfolioAvgCplCents !== null && diffPercent !== null && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          {isWinner ? <TrendingDown className="size-4 text-[#4ade80]" /> : <TrendingUp className="size-4 text-[#e5595e]" />}
          <span className="text-[#c4d1d9]">
            {euro.format(insight.avgCplCents / 100)} kosten/lead bij deze campagnes vs. {euro.format(insight.portfolioAvgCplCents / 100)} portfolio-gemiddelde
            <strong className={isWinner ? "text-[#7fd99c]" : "text-[#f2a1a5]"}> ({diffPercent > 0 ? "+" : ""}{diffPercent}%)</strong>
          </span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {insight.evidence.map((campaign) => (
          <span key={campaign.id} className="rule-pill">{campaign.title} · {campaign.location}</span>
        ))}
      </div>
    </article>
  );
}

export default function AnalysePage() {
  const [state, setState] = useState<AnalysisState | null>(null);
  const [insights, setInsights] = useState<CreativeInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/creative-analysis");
      const payload = await response.json() as { state?: AnalysisState | null; insights?: CreativeInsight[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Analyse kon niet worden geladen.");
      setState(payload.state ?? null);
      setInsights(payload.insights ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Analyse kon niet worden geladen.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function runAnalysis() {
    setIsRunning(true);
    try {
      const response = await fetch("/api/creative-analysis/run", { method: "POST" });
      const payload = await response.json() as { result?: { campaignsAnalyzed: number; patternsFound: number; reason?: string }; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "Analyse kon niet worden uitgevoerd.");
      if (payload.result.reason) {
        toast.info(payload.result.reason);
      } else {
        toast.success(`${payload.result.campaignsAnalyzed} campagne(s) geanalyseerd, ${payload.result.patternsFound} patro(o)nen gevonden`);
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Analyse kon niet worden uitgevoerd.");
    } finally {
      setIsRunning(false);
    }
  }

  const winners = insights.filter((insight) => insight.kind === "winner");
  const watchouts = insights.filter((insight) => insight.kind === "watchout");

  return (
    <AppShell
      active="analyse"
      title="Analyse"
      subtitle="AI-analyse van je eigen campagnedata -- vindt de hooks, USP's en invalshoeken die structureel beter scoren, met reden"
      headerActions={(
        <button className="primary-button disabled:cursor-wait disabled:opacity-60" onClick={() => void runAnalysis()} disabled={isRunning}>
          {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {isRunning ? "Bezig met analyseren…" : "Analyseer nu"}
        </button>
      )}
    >
      <article className="panel overflow-hidden">
        <div className="panel-header">
          <div><div className="eyebrow"><Clock3 className="size-3.5" />Laatste run</div><h2>Status</h2></div>
        </div>
        <div className="px-5 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
          ) : !state ? (
            <p className="text-sm text-[#7f97a8]">Nog niet gedraaid -- klik &quot;Analyseer nu&quot; om je eigen campagnedata te laten doorzoeken op winnende patronen.</p>
          ) : state.lastRunError ? (
            <div className="flex items-start gap-3 text-sm text-[#f2a1a5]"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{state.lastRunError}</div>
          ) : state.lastRunCampaignsAnalyzed < MIN_CAMPAIGNS_FOR_ANALYSIS ? (
            <p className="text-sm text-[#7f97a8]">
              Laatst gedraaid {state.lastRunAt && dateFormat.format(new Date(state.lastRunAt))} -- nog te weinig data: {state.lastRunCampaignsAnalyzed} campagne(s) met genoeg leads
              (minimaal {MIN_CAMPAIGNS_FOR_ANALYSIS} nodig voor betrouwbare patronen). Komt vanzelf zodra er meer campagnes met leads bijkomen.
            </p>
          ) : (
            <p className="text-sm text-[#c4d1d9]">
              Laatst gedraaid {state.lastRunAt && dateFormat.format(new Date(state.lastRunAt))} -- {state.lastRunCampaignsAnalyzed} campagne(s) geanalyseerd,{" "}
              {state.lastRunPatternsFound} patro{state.lastRunPatternsFound === 1 ? "on" : "nen"} gevonden.
            </p>
          )}
        </div>
      </article>

      <article className="panel overflow-hidden">
        <div className="panel-header">
          <div><div className="eyebrow"><Microscope className="size-3.5" />Wat werkt</div><h2>Winnende patronen</h2></div>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
        ) : winners.length === 0 ? (
          <p className="px-5 py-10 text-sm text-[#7f97a8]">Nog geen winnende patronen gevonden.</p>
        ) : (
          <div className="grid gap-4 p-5 lg:grid-cols-2">
            {winners.map((insight) => <InsightCard key={insight.id} insight={insight} />)}
          </div>
        )}
      </article>

      {watchouts.length > 0 && (
        <article className="panel overflow-hidden">
          <div className="panel-header">
            <div><div className="eyebrow"><AlertTriangle className="size-3.5" />Blijft achter</div><h2>Let op</h2></div>
          </div>
          <div className="grid gap-4 p-5 lg:grid-cols-2">
            {watchouts.map((insight) => <InsightCard key={insight.id} insight={insight} />)}
          </div>
        </article>
      )}

      {!isLoading && insights.length === 0 && state && !state.lastRunError && state.lastRunCampaignsAnalyzed >= MIN_CAMPAIGNS_FOR_ANALYSIS && (
        <article className="panel flex items-center gap-3 px-6 py-10 text-sm text-[#7f97a8]">
          <CheckCircle2 className="size-5 text-[#4ade80]" />Geen duidelijke patronen gevonden in de laatste run -- de campagnes presteren te vergelijkbaar om een winnaar aan te wijzen.
        </article>
      )}
    </AppShell>
  );
}
