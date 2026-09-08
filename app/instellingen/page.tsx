"use client";

import { AlertTriangle, CheckCircle2, MousePointerClick } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PortfolioBudgetCard } from "@/components/portfolio-budget-card";
import { useMetaStatus } from "@/lib/use-meta-status";

export default function InstellingenPage() {
  const metaStatus = useMetaStatus();

  return (
    <AppShell active="instellingen" title="Instellingen" subtitle="Meta-koppeling en budgetgrens">
      <article className="panel overflow-hidden">
        <div className="border-b border-white/8 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="eyebrow"><MousePointerClick className="size-3.5" />Meta-koppeling</div>
              <h2 className="mt-2">Accountstatus</h2>
            </div>
            {!metaStatus.configured ? (
              <AlertTriangle className="size-5 text-[#df9826]" />
            ) : metaStatus.healthy ? (
              <CheckCircle2 className="size-5 text-[#4ade80]" />
            ) : (
              <AlertTriangle className="size-5 text-[#e5595e]" />
            )}
          </div>
        </div>
        <div className="space-y-3 p-5">
          <div className="connection-row"><span>Advertentieaccount</span><strong className={metaStatus.services.adsManager ? "text-[#7fd99c]" : undefined}>{metaStatus.services.adsManager ? "Gekoppeld" : "Nog koppelen"}</strong></div>
          <div className="connection-row"><span>Lead Forms</span><strong className={metaStatus.services.leadForms ? "text-[#7fd99c]" : undefined}>{metaStatus.services.leadForms ? "Gekoppeld" : "Nog koppelen"}</strong></div>
          <div className="connection-row"><span>Automatische acties</span><strong className={metaStatus.mode === "connected" ? "text-[#7fd99c]" : undefined}>{metaStatus.mode === "connected" ? "Live" : "Sandbox"}</strong></div>
          {metaStatus.mode === "connected" && !metaStatus.healthy && (
            <div className="connection-row"><span>Verbinding</span><strong className="text-[#f2a1a5]" title={metaStatus.lastErrorMessage ?? undefined}>Faalt herhaaldelijk</strong></div>
          )}
        </div>
      </article>

      <PortfolioBudgetCard />
    </AppShell>
  );
}
