"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, CheckCircle2, Clock3, LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";

type OptimizationAction = {
  id: number;
  rule: string;
  severity: "info" | "attention" | "critical";
  recommendation: string;
  status: "pending" | "applied" | "dismissed";
  budgetChangePercent: number | null;
  createdAt: string;
  appliedAt: string | null;
  campaignId: string;
  campaignTitle: string;
  campaignLocation: string;
};

const RULE_LABEL: Record<string, string> = {
  budget_ceiling: "Budgetplafond bereikt",
  no_leads_after_spend: "Geen sollicitaties ondanks bereik",
  cpl_above_limit: "Sollicitaties te duur",
  creative_fatigue: "Advertentie aan vervanging toe",
  low_lead_quality: "Te veel onbruikbare sollicitaties",
  healthy_cpl: "Budget verhogen",
  ad_rejected: "Advertentie afgekeurd door Meta",
  periodic_creative_check: "Check of beeld/tekst nog fris is",
  budget_scale_cooldown: "Budget recent al verhoogd",
  learning: "Nog aan het verzamelen van data",
};

const STATUS_LABEL: Record<OptimizationAction["status"], string> = {
  pending: "Wacht op goedkeuring",
  applied: "Toegepast",
  dismissed: "Afgewezen",
};

// Stoplicht: rood = urgent, oranje = bijna, groen = gezond.
const SEVERITY_STOPLICHT: Record<OptimizationAction["severity"], { statusClass: string; label: string }> = {
  critical: { statusClass: "status-paused", label: "Urgent" },
  attention: { statusClass: "status-attention", label: "Bijna" },
  info: { statusClass: "status-good", label: "Gezond" },
};

const dateFormat = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function ActionRow({ action, onApprove, onDismiss, isProcessing }: {
  action: OptimizationAction;
  onApprove?: (action: OptimizationAction) => void;
  onDismiss?: (action: OptimizationAction) => void;
  isProcessing?: boolean;
}) {
  const stoplicht = SEVERITY_STOPLICHT[action.severity];
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={"status " + stoplicht.statusClass}><span />{stoplicht.label}</span>
          <span className="text-sm font-semibold text-white">{RULE_LABEL[action.rule] ?? action.rule}</span>
          {Number.isFinite(action.budgetChangePercent) && <span className="rule-pill">+{action.budgetChangePercent}%</span>}
          <span className="text-xs text-[#607b8d]">{STATUS_LABEL[action.status]}</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-[#c4d1d9]">{action.recommendation}</p>
        <p className="mt-2 text-xs text-[#6f8798]">{action.campaignTitle} · {action.campaignLocation}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {action.status === "pending" && onApprove && onDismiss ? (
          <>
            <button className="secondary-button" disabled={isProcessing} onClick={() => onDismiss(action)}>Afwijzen</button>
            <button className="primary-button" disabled={isProcessing} onClick={() => onApprove(action)}>
              {isProcessing ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Goedkeuren
            </button>
          </>
        ) : (
          <span className="text-xs text-[#526f82]">{dateFormat.format(new Date(action.createdAt))}</span>
        )}
      </div>
    </div>
  );
}

export default function OptimalisatiesPage() {
  const [actions, setActions] = useState<OptimizationAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);

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

  async function handle(action: OptimizationAction, decision: "approve" | "dismiss") {
    setProcessingId(action.id);
    try {
      const response = await fetch(`/api/optimization-actions/${action.id}/${decision}`, { method: "POST" });
      const payload = await response.json() as { error?: string; cappedByPortfolioLimit?: boolean };
      if (!response.ok) throw new Error(payload.error || "Actie kon niet worden verwerkt.");
      setActions(await fetchActions());
      if (decision === "approve") {
        toast.success(payload.cappedByPortfolioLimit ? "Budget verhoogd, maar begrensd door het portfolio-dagbudget" : "Budget verhoogd");
      } else {
        toast.info("Voorstel afgewezen");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Actie kon niet worden verwerkt.");
    } finally {
      setProcessingId(null);
    }
  }

  const pending = actions.filter((action) => action.status === "pending");
  const history = actions.filter((action) => action.status !== "pending");

  return (
    <AppShell
      active="optimalisaties"
      title="Optimalisaties"
      subtitle="Beslisregels die op live campagnes worden toegepast"
      headerActions={(
        <button className="primary-button" onClick={runAnalysis} disabled={isRunning}>
          {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {isRunning ? "Bezig met analyseren…" : "Analyseer nu"}
        </button>
      )}
    >
      <article className="panel overflow-hidden">
        <div className="panel-header">
          <div><div className="eyebrow"><Clock3 className="size-3.5" />Wacht op jouw goedkeuring</div><h2>Uit te voeren acties</h2></div>
          {!isLoading && pending.length > 0 && <span className="rule-pill">{pending.length}</span>}
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
        ) : pending.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-10 text-sm text-[#7f97a8]"><CheckCircle2 className="size-5 text-[#4ade80]" />Niets om goed te keuren. Alles draait zoals het hoort.</div>
        ) : (
          <div className="divide-y divide-white/8">
            {pending.map((action) => (
              <ActionRow key={action.id} action={action} onApprove={(a) => void handle(a, "approve")} onDismiss={(a) => void handle(a, "dismiss")} isProcessing={processingId === action.id} />
            ))}
          </div>
        )}
      </article>

      <article className="panel overflow-hidden">
        <div className="panel-header">
          <div><div className="eyebrow"><BrainCircuit className="size-3.5" />Automatische analyse</div><h2>Geschiedenis</h2></div>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
        ) : history.length === 0 ? (
          <p className="py-16 text-center text-sm text-[#7f97a8]">Nog geen optimalisaties. Zet een campagne live en klik op &quot;Analyseer nu&quot;, of wacht op de automatische 15-minuten-check.</p>
        ) : (
          <div className="divide-y divide-white/8">
            {history.map((action) => <ActionRow key={action.id} action={action} />)}
          </div>
        )}
      </article>
    </AppShell>
  );
}
