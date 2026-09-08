"use client";

import { useState } from "react";
import { AlertTriangle, Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { type Campaign, type CampaignRow, rowToCampaign } from "@/lib/campaign-client";
import { MAX_BUDGET_SHARE } from "@/lib/campaign-engine";

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export type ImportCandidate = { metaCampaignId: string; name: string; effectiveStatus: string; spendCents: number; dailyBudgetCents?: number; leads?: number };

const DEFAULT_FEE = 7000;

function ImportCampaignForm({
  candidate, onClose, onImported,
}: {
  candidate: ImportCandidate;
  onClose: () => void;
  onImported: (campaign: Campaign) => void;
}) {
  const [title, setTitle] = useState(candidate.name);
  const [location, setLocation] = useState("");
  const [salary, setSalary] = useState("");
  const [description, setDescription] = useState("");
  const [fee, setFee] = useState(String(DEFAULT_FEE));
  // Pre-suggest a duration so our derived daily pacing starts out matching
  // what's actually configured on Meta, instead of a generic guess -- an
  // imported campaign already has a real daily_budget, and this platform's
  // own budget-scale-up automation later reasons from campaignDurationDays,
  // not from Meta's real figure, so starting them aligned matters.
  const [durationDays, setDurationDays] = useState(() => {
    if (!candidate.dailyBudgetCents) return "30";
    const suggested = Math.round((DEFAULT_FEE * MAX_BUDGET_SHARE * 100) / candidate.dailyBudgetCents);
    return String(Math.min(Math.max(suggested, 1), 365));
  });
  const [isSaving, setIsSaving] = useState(false);

  const feeNumber = Math.max(Number(fee) || 0, 0);
  const proposedBudget = feeNumber * MAX_BUDGET_SHARE;
  const spendSoFar = candidate.spendCents / 100;
  const overBudget = spendSoFar > proposedBudget && proposedBudget > 0;
  const realDailyBudget = candidate.dailyBudgetCents !== undefined ? candidate.dailyBudgetCents / 100 : undefined;
  const derivedDailyBudget = Math.max(Number(durationDays) || 1, 1) > 0 ? proposedBudget / Math.max(Number(durationDays) || 1, 1) : 0;
  const dailyBudgetMismatch = realDailyBudget !== undefined && realDailyBudget > 0 && Math.abs(derivedDailyBudget - realDailyBudget) / realDailyBudget > 0.1;

  async function importCampaign() {
    if (!title.trim() || !location.trim() || feeNumber <= 0) {
      toast.error("Vul functie, locatie en fee in.");
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          location: location.trim(),
          salary: salary.trim(),
          // Purely for our own reference (never sent to Meta), so unlike a
          // freshly-created campaign this shouldn't block the import.
          description: description.trim() || title.trim(),
          fee: feeNumber,
          durationDays: Math.max(Number(durationDays) || 30, 1),
          metaCampaignId: candidate.metaCampaignId,
          importedEffectiveStatus: candidate.effectiveStatus,
          importedSpentCents: candidate.spendCents,
          importedLeads: candidate.leads,
        }),
      });
      const payload = await response.json() as { campaign?: CampaignRow; error?: string };
      if (!response.ok || !payload.campaign) throw new Error(payload.error || "Campagne kon niet worden geïmporteerd.");
      onImported(rowToCampaign(payload.campaign));
      toast.success("Campagne geïmporteerd — automatische regels draaien er nu op");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Campagne kon niet worden geïmporteerd.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <SheetHeader className="border-b border-white/10 px-6 py-6">
        <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-[#0f8db7]/15 text-[#5bc0df]">
          <Download className="size-5" />
        </div>
        <SheetTitle className="text-xl text-white">Campagne overnemen</SheetTitle>
        <SheetDescription className="text-[#91aabb]">
          Deze campagne blijft precies zoals hij nu op Meta staat — ik ga &apos;m alleen ook hier bewaken: budgetbewaking, en budget opschalen (met jouw goedkeuring) zodra dat kan.
        </SheetDescription>
      </SheetHeader>
      <div className="scrollbar-gutter-stable scrollbar-thin flex-1 space-y-5 overflow-y-auto px-6 py-6">
        <div className="rounded-xl border border-[#1f6185] bg-[#11415e] p-4 text-sm">
          <div className="flex items-center justify-between"><span className="text-[#91aabb]">Al uitgegeven op Meta <span className="text-xs text-[#607b8d]">(totaal, niet per dag)</span></span><strong className="text-white">{euro.format(spendSoFar)}</strong></div>
          {realDailyBudget !== undefined && (
            <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2"><span className="text-[#91aabb]">Huidig dagbudget op Meta</span><strong className="text-white">{euro.format(realDailyBudget)}</strong></div>
          )}
        </div>
        <label className="field-label">Functietitel
          <input className="field-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field-label">Locatie
            <input className="field-input" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="bijv. Amsterdam" />
          </label>
          <label className="field-label">Salaris <span className="font-normal text-[#607b8d]">optioneel</span>
            <input className="field-input" value={salary} onChange={(event) => setSalary(event.target.value)} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field-label">Fee
            <input className="field-input" inputMode="numeric" value={fee} onChange={(event) => setFee(event.target.value)} />
          </label>
          <label className="field-label">Verwachte looptijd (dagen)
            <input className="field-input" inputMode="numeric" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} />
          </label>
        </div>
        <div className="budget-preview">
          <div><span>Budgetgrens (20% van fee)</span><strong>{euro.format(proposedBudget)}</strong></div>
          <span className="rule-pill">20% van fee</span>
        </div>
        <p className="text-xs leading-5 text-[#607b8d]">
          Op basis hiervan reken ik straks met een dagbudget van circa {euro.format(derivedDailyBudget)} — pas de looptijd aan om dit dichter bij het huidige dagbudget op Meta te krijgen.
        </p>
        {dailyBudgetMismatch && (
          <div className="flex items-start gap-3 rounded-xl border border-[#8a5a1f] bg-[#3a2a10] p-4 text-sm text-[#f0c896]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>Dit wijkt behoorlijk af van het huidige dagbudget op Meta ({euro.format(realDailyBudget ?? 0)}). Pas de looptijd of fee aan als je niet wilt dat het dagbudget bij een volgende actie plotseling verandert.</span>
          </div>
        )}
        {overBudget && (
          <div className="flex items-start gap-3 rounded-xl border border-[#8a5a1f] bg-[#3a2a10] p-4 text-sm text-[#f0c896]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>Deze campagne heeft al meer uitgegeven ({euro.format(spendSoFar)}) dan deze budgetgrens toestaat. Zonder aanpassing pauzeer ik &apos;m meteen bij de eerstvolgende check — verhoog de fee hierboven als dat niet de bedoeling is.</span>
          </div>
        )}
        <label className="field-label">Vacatureomschrijving <span className="font-normal text-[#607b8d]">optioneel · voor eigen referentie, wordt niet naar Meta gestuurd</span>
          <textarea className="field-input min-h-24 resize-none leading-6" value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
      </div>
      <div className="border-t border-white/10 p-6">
        <button className="primary-button w-full justify-center disabled:cursor-wait disabled:opacity-60" onClick={importCampaign} disabled={isSaving}>
          {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
          {isSaving ? "Bezig met overnemen…" : "Campagne overnemen"}
        </button>
      </div>
    </>
  );
}

export function ImportCampaignSheet({
  candidate, onClose, onImported,
}: {
  candidate: ImportCandidate | null;
  onClose: () => void;
  onImported: (campaign: Campaign) => void;
}) {
  return (
    <Sheet open={Boolean(candidate)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full border-[#23526f] bg-[#0e324e] p-0 text-white sm:max-w-xl">
        {/* Keyed on the campaign id so switching candidates while the sheet stays mounted resets the form instead of carrying over the previous pick's values. */}
        {candidate && <ImportCampaignForm key={candidate.metaCampaignId} candidate={candidate} onClose={onClose} onImported={onImported} />}
      </SheetContent>
    </Sheet>
  );
}
