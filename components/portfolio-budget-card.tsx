"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

const euro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function PortfolioBudgetCard() {
  const [maxDailyBudget, setMaxDailyBudget] = useState<number>();
  const [usedToday, setUsedToday] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/portfolio-settings");
        const payload = await response.json() as { maxDailyBudget?: number; usedToday?: number; error?: string };
        if (!response.ok || payload.maxDailyBudget === undefined) throw new Error(payload.error || "Instelling kon niet worden geladen.");
        if (cancelled) return;
        setMaxDailyBudget(payload.maxDailyBudget);
        setUsedToday(payload.usedToday ?? 0);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Instelling kon niet worden geladen.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    const amount = Number(draft.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Vul een geldig bedrag in.");
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch("/api/portfolio-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxDailyBudget: amount }),
      });
      const payload = await response.json() as { maxDailyBudget?: number; usedToday?: number; error?: string };
      if (!response.ok || payload.maxDailyBudget === undefined) throw new Error(payload.error || "Instelling kon niet worden opgeslagen.");
      setMaxDailyBudget(payload.maxDailyBudget);
      setUsedToday(payload.usedToday ?? 0);
      setIsEditing(false);
      toast.success("Maximaal dagbudget bijgewerkt");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Instelling kon niet worden opgeslagen.");
    } finally {
      setIsSaving(false);
    }
  }

  const usedPercent = maxDailyBudget ? Math.min((usedToday / maxDailyBudget) * 100, 100) : 0;

  return (
    <article className="panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow"><ShieldCheck className="size-3.5" />Budgetgrens</div>
          <h2 className="mt-2">Maximaal dagbudget (alle campagnes samen)</h2>
        </div>
      </div>
      {isEditing ? (
        <div className="mt-4 flex items-center gap-2">
          <span className="daily-spend-prefix">€</span>
          <input autoFocus className="content-input" inputMode="decimal" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void save()} placeholder="350" />
          <button className="primary-button" onClick={save} disabled={isSaving}>{isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Opslaan</button>
          <button className="secondary-button" onClick={() => setIsEditing(false)}>Annuleren</button>
        </div>
      ) : (
        <div className="mt-4 flex items-end justify-between">
          <div><span className="text-2xl font-semibold text-white">{isLoading ? "…" : euro.format(usedToday)}</span><span className="ml-1 text-sm text-[#6f8798]">/ {isLoading ? "…" : euro.format(maxDailyBudget ?? 0)} per dag</span></div>
          <button className="secondary-button" onClick={() => { setDraft(maxDailyBudget ? String(maxDailyBudget) : ""); setIsEditing(true); }}><Pencil className="size-4" />Wijzigen</button>
        </div>
      )}
      {!isEditing && <Progress value={usedPercent} className="mt-3 h-2.5 bg-white/8 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-[#006192] [&_[data-slot=progress-indicator]]:to-[#42c3e7]" />}
      <p className="mt-3 text-xs leading-5 text-[#607b8d]">Dit is de harde grens die Meta per dag mag uitgeven over alle campagnes samen. Een nieuwe campagne of budgetverhoging past zich automatisch aan deze grens aan.</p>
    </article>
  );
}
