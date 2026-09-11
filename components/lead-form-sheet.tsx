"use client";

import { useState } from "react";
import { LoaderCircle, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

type StandardQuestionType = "FULL_NAME" | "EMAIL" | "PHONE" | "CITY" | "COMPANY_NAME" | "JOB_TITLE";
type LeadFormQuestion = { type: StandardQuestionType } | { type: "CUSTOM"; key: string; label: string };

const STANDARD_QUESTIONS: Array<{ type: StandardQuestionType; label: string }> = [
  { type: "FULL_NAME", label: "Volledige naam" },
  { type: "EMAIL", label: "E-mailadres" },
  { type: "PHONE", label: "Telefoonnummer" },
  { type: "CITY", label: "Woonplaats" },
  { type: "COMPANY_NAME", label: "Bedrijfsnaam" },
  { type: "JOB_TITLE", label: "Functietitel" },
];

function slugify(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "vraag";
}

function LeadFormBuilder({
  campaignId, campaignTitle, onClose, onCreated,
}: {
  campaignId: string;
  campaignTitle: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [selectedStandard, setSelectedStandard] = useState<Set<StandardQuestionType>>(new Set(["FULL_NAME", "EMAIL", "PHONE"]));
  const [customQuestions, setCustomQuestions] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [createdForm, setCreatedForm] = useState<{ id: string; name: string } | null>(null);

  function toggleStandard(type: StandardQuestionType) {
    setSelectedStandard((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  async function createForm() {
    const questions: LeadFormQuestion[] = [
      ...STANDARD_QUESTIONS.filter((question) => selectedStandard.has(question.type)).map((question) => ({ type: question.type })),
      ...customQuestions.filter((label) => label.trim()).map((label, index) => ({ type: "CUSTOM" as const, key: `${slugify(label)}_${index}`, label: label.trim() })),
    ];
    if (questions.length === 0) {
      toast.error("Kies minstens één vraag.");
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/lead-form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions }),
      });
      const payload = await response.json() as { form?: { id: string; name: string }; error?: string };
      if (!response.ok || !payload.form) throw new Error(payload.error || "Leadformulier kon niet worden aangemaakt.");
      setCreatedForm(payload.form);
      onCreated();
      toast.success("Nieuw leadformulier aangemaakt");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Leadformulier kon niet worden aangemaakt.");
    } finally {
      setIsSaving(false);
    }
  }

  if (createdForm) {
    return (
      <>
        <SheetHeader className="border-b border-white/10 px-6 py-6">
          <SheetTitle className="text-xl text-white">Leadformulier aangemaakt</SheetTitle>
          <SheetDescription className="text-[#91aabb]">&quot;{createdForm.name}&quot; staat nu klaar bij Meta.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 px-6 py-6">
          <div className="rounded-xl border border-[#206389] bg-[#13425e] p-4 text-sm leading-6 text-[#bbced9]">
            Dit formulier is nog niet aan een advertentie gekoppeld — Meta staat niet toe om het formulier van een bestaande, lopende advertentie te wisselen. Maak in Meta Ads Manager een nieuwe advertentie (of dupliceer de huidige) en kies daar dit formulier, dan gaan nieuwe sollicitaties via de nieuwe vragen binnen.
          </div>
        </div>
        <div className="border-t border-white/10 p-6">
          <button className="primary-button w-full justify-center" onClick={onClose}>Sluiten</button>
        </div>
      </>
    );
  }

  return (
    <>
      <SheetHeader className="border-b border-white/10 px-6 py-6">
        <SheetTitle className="text-xl text-white">Nieuw leadformulier</SheetTitle>
        <SheetDescription className="text-[#91aabb]">
          Voor {campaignTitle}. Meta laat een bestaand formulier niet bewerken — dit maakt een nieuw formulier aan met de vragen die je hieronder kiest.
        </SheetDescription>
      </SheetHeader>
      <div className="scrollbar-gutter-stable scrollbar-thin flex-1 space-y-5 overflow-y-auto px-6 py-6">
        <div>
          <p className="content-label">Standaardvragen</p>
          <div className="space-y-2">
            {STANDARD_QUESTIONS.map((question) => (
              <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm text-white" key={question.type}>
                <input type="checkbox" className="size-4" checked={selectedStandard.has(question.type)} onChange={() => toggleStandard(question.type)} />
                {question.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="content-label">Aangepaste vragen <span className="font-normal text-[#607b8d]">optioneel · open antwoord</span></p>
          <div className="space-y-2">
            {customQuestions.map((value, index) => (
              <div className="flex items-center gap-2" key={index}>
                <input
                  className="field-input"
                  placeholder="Bijv. Heb je een rijbewijs B?"
                  value={value}
                  onChange={(event) => setCustomQuestions((current) => current.map((question, i) => (i === index ? event.target.value : question)))}
                />
                <button className="secondary-button !px-2.5" onClick={() => setCustomQuestions((current) => current.filter((_, i) => i !== index))}><Trash2 className="size-4" /></button>
              </div>
            ))}
            <button className="secondary-button" onClick={() => setCustomQuestions((current) => [...current, ""])}><Plus className="size-4" />Vraag toevoegen</button>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 p-6">
        <button className="primary-button w-full justify-center disabled:cursor-wait disabled:opacity-60" onClick={createForm} disabled={isSaving}>
          {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {isSaving ? "Bezig met aanmaken…" : "Leadformulier aanmaken"}
        </button>
      </div>
    </>
  );
}

export function LeadFormSheet({
  open, campaignId, campaignTitle, onClose, onCreated,
}: {
  open: boolean;
  campaignId: string;
  campaignTitle: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full border-[#23526f] bg-[#0e324e] p-0 text-white sm:max-w-xl">
        {/* Keyed on the campaign id so reopening for a different campaign resets the form instead of carrying over the previous pick's values. */}
        {open && <LeadFormBuilder key={campaignId} campaignId={campaignId} campaignTitle={campaignTitle} onClose={onClose} onCreated={onCreated} />}
      </SheetContent>
    </Sheet>
  );
}
