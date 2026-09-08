"use client";

import { useEffect, useState } from "react";
import {
  AlertOctagon, Clock3, ImageIcon, LoaderCircle, RefreshCw, ShieldAlert, ShieldCheck, Target, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";

type OptimizationAction = {
  id: number;
  rule: string;
  severity: "info" | "attention" | "critical";
  recommendation: string;
  status: "pending" | "applied" | "dismissed";
  createdAt: string;
  campaignTitle: string;
  campaignLocation: string;
};

const RULES = [
  {
    icon: AlertOctagon,
    title: "Budgetplafond",
    text: "Pauzeert direct zodra de spend 20% van de fee bereikt — dat plafond wordt nooit overschreden.",
  },
  {
    icon: ShieldAlert,
    title: "Geen leads na spend",
    text: "Pauzeert wanneer er bij minstens 2.000 impressies en genoeg spend nog altijd geen enkele lead is binnengekomen.",
  },
  {
    icon: Target,
    title: "CPL boven limiet",
    text: "Pauzeert zodra de kosten per lead (bij 3 of meer leads) meer dan 50% boven de doel-CPL uitkomen.",
  },
  {
    icon: ImageIcon,
    title: "Creative fatigue",
    text: "Vervangt de creative bij een frequentie boven 2,8 of een CTR onder 0,8% na voldoende bereik.",
  },
  {
    icon: ShieldCheck,
    title: "Lage leadkwaliteit",
    text: "Houdt het budget vast (schaalt niet op) als minder dan de helft van de leads als bruikbaar is gemarkeerd, ook als de CPL goed is.",
  },
  {
    icon: TrendingUp,
    title: "Budget schalen (met jouw goedkeuring)",
    text: "Stelt voor het dagbudget met maximaal 15% te verhogen zodra de CPL binnen doel blijft én de leadkwaliteit op orde is -- verschijnt als voorstel bij \"Uit te voeren acties\" en wordt pas uitgevoerd na jouw akkoord, begrensd door het portfolio-dagbudget.",
  },
] as const;

const dateFormat = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function AutomatiseringPage() {
  const [actions, setActions] = useState<OptimizationAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  async function fetchActions(): Promise<OptimizationAction[]> {
    const response = await fetch("/api/optimization-actions");
    const payload = await response.json() as { actions?: OptimizationAction[]; error?: string };
    if (!response.ok || !payload.actions) throw new Error(payload.error || "Acties konden niet worden geladen.");
    return payload.actions.filter((action) => action.status !== "pending").slice(0, 8);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const actions = await fetchActions();
        if (!cancelled) setActions(actions);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Acties konden niet worden geladen.");
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
      active="automatisering"
      title="Automatisering"
      subtitle="Beslisregels die elke 15 minuten automatisch op live campagnes draaien"
      headerActions={(
        <button className="primary-button" onClick={runAnalysis} disabled={isRunning}>
          {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {isRunning ? "Bezig met analyseren…" : "Analyseer nu"}
        </button>
      )}
    >
      <section className="grid gap-3 md:grid-cols-3">
        {RULES.map((rule) => (
          <div className="automation-card" key={rule.title}>
            <rule.icon className="size-5 text-[#4fc6e9]" />
            <h3>{rule.title}</h3>
            <p>{rule.text}</p>
            <span><span />Actief</span>
          </div>
        ))}
      </section>

      <article className="panel overflow-hidden">
        <div className="panel-header">
          <div><div className="eyebrow"><Clock3 className="size-3.5" />Recente acties</div><h2>Laatst toegepast</h2></div>
          <span className="live-pulse"><span />Live</span>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
        ) : actions.length === 0 ? (
          <p className="py-16 text-center text-sm text-[#7f97a8]">Nog geen acties toegepast. Zet een campagne live om de beslisregels te laten meedraaien.</p>
        ) : (
          <div className="divide-y divide-white/8">
            {actions.map((action) => (
              <div className="flex flex-wrap items-start justify-between gap-4 p-5" key={action.id}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{action.campaignTitle} <span className="font-normal text-[#6f8798]">· {action.campaignLocation}</span></p>
                  <p className="mt-1 text-sm leading-6 text-[#c4d1d9]">{action.recommendation}</p>
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
