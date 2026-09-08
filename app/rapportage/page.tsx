"use client";

import { useEffect, useState } from "react";
import { CalendarRange, Download, FileSpreadsheet, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

function amsterdamToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}

function amsterdamDateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(date);
}

function monthRange(monthsAgo: number): { from: string; to: string } {
  const today = amsterdamToday();
  const [todayYear, todayMonth] = today.split("-").map(Number);
  const target = new Date(Date.UTC(todayYear, todayMonth - 1 - monthsAgo, 1));
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth();
  const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to: to > today ? today : to };
}

const PRESETS = [
  { key: "7d", label: "Laatste 7 dagen", range: () => ({ from: amsterdamDateDaysAgo(6), to: amsterdamToday() }) },
  { key: "30d", label: "Laatste 30 dagen", range: () => ({ from: amsterdamDateDaysAgo(29), to: amsterdamToday() }) },
  { key: "this_month", label: "Deze maand", range: () => monthRange(0) },
  { key: "last_month", label: "Vorige maand", range: () => monthRange(1) },
] as const;

type PreviewSummary = { from: string; to: string; days: number; meta: number; indeed: number; total: number };

export default function RapportagePage() {
  const [activePreset, setActivePreset] = useState<string>("this_month");
  const [from, setFrom] = useState(() => monthRange(0).from);
  const [to, setTo] = useState(() => monthRange(0).to);
  const [preview, setPreview] = useState<PreviewSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function applyPreset(key: typeof PRESETS[number]["key"]) {
    const preset = PRESETS.find((item) => item.key === key);
    if (!preset) return;
    const range = preset.range();
    setActivePreset(key);
    setFrom(range.from);
    setTo(range.to);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!from || !to || from > to) {
        if (!cancelled) setPreview(null);
        return;
      }
      setIsLoading(true);
      try {
        const response = await fetch(`/api/marketing-spend-export?from=${from}&to=${to}&format=json`);
        const payload = await response.json() as PreviewSummary & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Overzicht kon niet worden geladen.");
        if (!cancelled) setPreview(payload);
      } catch (error) {
        if (!cancelled) {
          setPreview(null);
          toast.error(error instanceof Error ? error.message : "Overzicht kon niet worden geladen.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const isValidRange = Boolean(from && to && from <= to);

  return (
    <AppShell active="rapportage" title="Rapportage" subtitle="Export van marketingkosten per periode">
      <article className="panel overflow-hidden">
        <div className="panel-header">
          <div><div className="eyebrow"><FileSpreadsheet className="size-3.5" />Export</div><h2>Marketingkosten downloaden</h2></div>
        </div>
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                className={activePreset === preset.key ? "primary-button" : "secondary-button"}
                onClick={() => applyPreset(preset.key)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field-label">Van
              <input
                className="field-input"
                type="date"
                value={from}
                onChange={(event) => {
                  setActivePreset("");
                  setFrom(event.target.value);
                }}
              />
            </label>
            <label className="field-label">Tot en met
              <input
                className="field-input"
                type="date"
                value={to}
                onChange={(event) => {
                  setActivePreset("");
                  setTo(event.target.value);
                }}
              />
            </label>
          </div>

          {!isValidRange ? (
            <p className="text-sm text-[#d9787d]">Kies een geldige periode (&quot;van&quot; moet voor of gelijk aan &quot;tot&quot; liggen).</p>
          ) : (
            <div className="rounded-xl border border-white/8 bg-[#0e324e] p-5">
              <div className="flex items-center gap-2 text-xs text-[#607b8d]"><CalendarRange className="size-3.5" />{preview ? `${preview.days} dag(en) in deze periode` : "Bezig met laden…"}</div>
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
              ) : preview ? (
                <div className="mt-4 grid grid-cols-3 gap-4">
                  <div className="budget-stat"><span>Meta</span><strong className="text-lg text-white">{euro.format(preview.meta)}</strong></div>
                  <div className="budget-stat"><span>Indeed</span><strong className="text-lg text-white">{euro.format(preview.indeed)}</strong></div>
                  <div className="budget-stat"><span>Totaal</span><strong className="text-lg text-white">{euro.format(preview.total)}</strong></div>
                </div>
              ) : null}
            </div>
          )}

          <a
            className={"primary-button w-full justify-center " + (!isValidRange ? "pointer-events-none opacity-50" : "")}
            href={isValidRange ? `/api/marketing-spend-export?from=${from}&to=${to}` : undefined}
          >
            <Download className="size-4" />Download CSV
          </a>
          <p className="text-xs leading-5 text-[#607b8d]">
            De export bevat per dag het Meta-bedrag, het Indeed-bedrag en het totaal, plus een eindtotaal onderaan. Opent direct in Excel (ook met Nederlandse instellingen — komma als decimaalteken).
          </p>
        </div>
      </article>
    </AppShell>
  );
}
