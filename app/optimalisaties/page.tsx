"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";

type OptimizationAction = {
  id: number;
  rule: string;
  severity: "info" | "attention" | "critical";
  recommendation: string;
  status: "pending" | "applied" | "dismissed";
  createdAt: string;
  appliedAt: string | null;
  campaignId: string;
  campaignTitle: string;
  campaignLocation: string;
};

const RULE_LABEL: Record<string, string> = {
  budget_ceiling: "Budgetplafond bereikt",
  no_leads_after_spend: "Geen leads na spend",
  cpl_above_limit: "CPL boven limiet",
  creative_fatigue: "Creative fatigue",
  low_lead_quality: "Lage leadkwaliteit",
  healthy_cpl: "Gezonde CPL",
  learning: "Nog aan het leren",
};

const STATUS_LABEL: Record<OptimizationAction["status"], string> = {
  pending: "Open",
  applied: "Toegepast",
  dismissed: "Genegeerd",
};

const dateFormat = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function OptimalisatiesPage() {
  const [actions, setActions] = useState<OptimizationAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  async function fetchActions(): Promise<OptimizationAction[]> {
    const response = await fetch("/api/optimization-actions");
    const payload = await response.json() as { actions?: OptimizationAction[]; error?: string };
    if (!response.ok || !payload.actions) throw new Error(payload.error || "Optimalisaties konden niet worden geladen.");
    return payload.actions;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const actions = await fetchActions();
        if (!cancelled) setActions(actions);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Optimalisaties konden niet worden geladen.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runAnalysis() {
    setIsRunning(true);
    try {
      const response = await fetch("/api/campaign-monitor/run", { method: "POST" });
      const payload = await response.json() as { evaluated?: number; actionsApplied?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Analyse kon niet worden uitgevoerd.");
      toast.success(`${payload.evaluated ?? 0} campagne(s) geanalyseerd, ${payload.actionsApplied ?? 0} nieuwe actie(s)`);
      setActions(await fetchActions());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Analyse kon niet worden uitgevoerd.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <AppShell
      active="optimalisaties"
      title="Optimalisaties"
      subtitle="Beslisregels die op live campagnes zijn toegepast"
      headerActions={(
        <button className="primary-button" onClick={runAnalysis} disabled={isRunning}>
          {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {isRunning ? "Bezig met analyseren…" : "Analyseer nu"}
        </button>
      )}
    >
      <article className="panel overflow-hidden">
        <div className="panel-header">
          <div><div className="eyebrow"><BrainCircuit className="size-3.5" />Automatische analyse</div><h2>Toegepaste acties</h2></div>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
        ) : actions.length === 0 ? (
          <p className="py-16 text-center text-sm text-[#7f97a8]">Nog geen optimalisaties. Zet een campagne live en klik op &quot;Analyseer nu&quot;, of wacht op de automatische 15-minuten-check.</p>
        ) : (
          <div className="divide-y divide-white/8">
            {actions.map((action) => (
              <div className="flex flex-wrap items-start justify-between gap-4 p-5" key={action.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={"status status-" + (action.severity === "critical" ? "paused" : action.severity === "attention" ? "attention" : "live")}>
                      <span />{RULE_LABEL[action.rule] ?? action.rule}
                    </span>
                    <span className="text-xs text-[#607b8d]">{STATUS_LABEL[action.status]}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#c4d1d9]">{action.recommendation}</p>
                  <p className="mt-2 text-xs text-[#6f8798]">{action.campaignTitle} · {action.campaignLocation}</p>
                </div>
                <span className="shrink-0 text-xs text-[#526f82]">{dateFormat.format(new Date(action.createdAt))}</span>
              </div>
            ))}
          </div>
        )}
      </article>
    </AppShell>
  );
}
