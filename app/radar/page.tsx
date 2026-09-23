"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, LoaderCircle, Radar as RadarIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";

type SignalRow = {
  id: string;
  provider: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  detectedAt: string;
  category: string;
  passedCheapFilter: boolean;
  status: "new" | "analyzed" | "irrelevant";
};

type ProviderStatus = {
  key: string;
  label: string;
  scanFrequencyMinutes: number;
  configured: boolean;
  missingConfigHint?: string;
  lastRunAt: string | null;
  lastRunScanned: number;
  lastRunInserted: number;
  lastError: string | null;
};

function formatFrequency(minutes: number): string {
  if (minutes < 60) return `elke ${minutes} min`;
  if (minutes < 24 * 60) return `elke ${Math.round(minutes / 60)} uur`;
  return `elke ${Math.round(minutes / (24 * 60))} dag${minutes > 24 * 60 ? "en" : ""}`;
}

type StatusFilter = "all" | "new" | "analyzed" | "irrelevant";

const dateFormat = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" });
const PAGE_SIZE = 25;

/** Google News summaries are usually just the title again (often with the " - Source" suffix stripped and a source name tacked back on differently) -- comparing on words only, ignoring punctuation, catches that even when the two strings aren't byte-identical. Showing both then just repeats a line per card without adding information. */
function isRedundantSummary(title: string, summary: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedTitle = normalize(title);
  const normalizedSummary = normalize(summary);
  if (!normalizedSummary || !normalizedTitle) return true;
  return normalizedSummary === normalizedTitle || normalizedTitle.startsWith(normalizedSummary) || normalizedSummary.startsWith(normalizedTitle);
}

const STATUS_LABEL: Record<SignalRow["status"], { label: string; className: string }> = {
  new: { label: "Nieuw -- wacht op AI-analyse", className: "status-attention" },
  analyzed: { label: "Geanalyseerd", className: "status-live" },
  irrelevant: { label: "Niet relevant", className: "status-paused" },
};

export default function RadarPage() {
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);

  // Reset pagination when a filter changes -- adjusted during render (not in
  // an effect) per React's guidance for state derived from a prop/state change.
  const filterKey = `${statusFilter}|${providerFilter}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setVisibleCount(PAGE_SIZE);
  }

  async function load() {
    setIsLoading(true);
    try {
      const [signalsResponse, providersResponse] = await Promise.all([
        fetch(statusFilter === "all" ? "/api/radar/signals" : `/api/radar/signals?status=${statusFilter}`),
        fetch("/api/radar/providers"),
      ]);
      const signalsPayload = await signalsResponse.json() as { signals?: SignalRow[]; error?: string };
      const providersPayload = await providersResponse.json() as { providers?: ProviderStatus[]; error?: string };
      if (!signalsResponse.ok || !signalsPayload.signals) throw new Error(signalsPayload.error || "Signals konden niet worden geladen.");
      setSignals(signalsPayload.signals);
      if (providersResponse.ok && providersPayload.providers) setProviders(providersPayload.providers);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Radar kon niet worden geladen.");
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
      const payload = await response.json() as { scan?: { scanned: number; inserted: number }; error?: string };
      if (!response.ok) throw new Error(payload.error || "Radar-scan is mislukt.");
      toast.success(payload.scan ? `Scan klaar -- ${payload.scan.scanned} gevonden, ${payload.scan.inserted} nieuw` : "Scan klaar");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Radar-scan is mislukt.");
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <AppShell active="radar" title="Radar" subtitle="Always-on monitoring -- controleert automatisch en periodiek externe bronnen, 24/7">
      <article className="panel overflow-hidden">
        <div className="panel-header">
          <div>
            <div className="eyebrow"><RadarIcon className="size-3.5" />Signal providers</div>
            <h2>Actieve bronnen</h2>
          </div>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {providers.map((provider) => (
            <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4" key={provider.key}>
              <div className="flex items-center gap-2">
                {provider.configured ? <CheckCircle2 className="size-4 text-[#4ade80]" /> : <AlertCircle className="size-4 text-[#df9826]" />}
                <span className="text-sm font-semibold text-white">{provider.label}</span>
              </div>
              <p className="mt-1 text-xs text-[#7f97a8]">
                {provider.configured ? `Actief · ${formatFrequency(provider.scanFrequencyMinutes)}` : provider.missingConfigHint || "Nog niet geconfigureerd"}
              </p>
              {provider.configured && (
                <p className="mt-1 text-xs text-[#607b8d]">
                  {provider.lastRunAt
                    ? `Laatst gedraaid: ${dateFormat.format(new Date(provider.lastRunAt))} (${provider.lastRunScanned} gevonden, ${provider.lastRunInserted} nieuw)`
                    : "Nog niet gedraaid -- wacht op de eerste cron-tick of klik Scan nu"}
                </p>
              )}
              {provider.lastError && <p className="mt-1 text-xs text-[#f2a1a5]">Laatste fout: {provider.lastError}</p>}
            </div>
          ))}
        </div>
      </article>

      <article className="panel overflow-hidden">
        <div className="panel-header">
          <div>
            <div className="eyebrow"><RadarIcon className="size-3.5" />Live overzicht</div>
            <h2>Gedetecteerde signalen</h2>
          </div>
          <button className="primary-button disabled:cursor-wait disabled:opacity-60" onClick={() => void scanNow()} disabled={isScanning}>
            {isScanning ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {isScanning ? "Bezig met scannen…" : "Scan nu"}
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-3">
          <div className="format-switch">
            <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>Alle</button>
            <button className={statusFilter === "new" ? "active" : ""} onClick={() => setStatusFilter("new")}>Nieuw</button>
            <button className={statusFilter === "analyzed" ? "active" : ""} onClick={() => setStatusFilter("analyzed")}>Geanalyseerd</button>
            <button className={statusFilter === "irrelevant" ? "active" : ""} onClick={() => setStatusFilter("irrelevant")}>Niet relevant</button>
          </div>
          {providers.length > 0 && (
            <div className="format-switch">
              <button className={providerFilter === "all" ? "active" : ""} onClick={() => setProviderFilter("all")}>Alle bronnen</button>
              {providers.map((provider) => (
                <button key={provider.key} className={providerFilter === provider.key ? "active" : ""} onClick={() => setProviderFilter(provider.key)}>{provider.label}</button>
              ))}
            </div>
          )}
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
        ) : signals.length === 0 ? (
          <p className="py-16 text-center text-sm text-[#7f97a8]">Nog geen signalen gevonden. Klik op &quot;Scan nu&quot; om de Radar te laten zoeken.</p>
        ) : (() => {
          const filtered = providerFilter === "all" ? signals : signals.filter((signal) => signal.provider === providerFilter);
          if (filtered.length === 0) {
            return <p className="py-16 text-center text-sm text-[#7f97a8]">Geen signalen voor deze combinatie van filters.</p>;
          }
          const visible = filtered.slice(0, visibleCount);
          const groups: Array<{ day: string; items: SignalRow[] }> = [];
          for (const signal of visible) {
            const day = dayFormat.format(new Date(signal.detectedAt));
            const lastGroup = groups[groups.length - 1];
            if (lastGroup && lastGroup.day === day) lastGroup.items.push(signal);
            else groups.push({ day, items: [signal] });
          }
          return (
            <>
              {groups.map((group) => (
                <div key={group.day}>
                  <div className="bg-white/[0.03] px-5 py-2 text-xs font-bold uppercase tracking-wide text-[#607b8d]">{group.day}</div>
                  <div className="divide-y divide-white/8">
                    {group.items.map((signal) => (
                      <div className="px-5 py-4" key={signal.id}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={"status " + STATUS_LABEL[signal.status].className}><span />{STATUS_LABEL[signal.status].label}</span>
                          <span className="text-xs font-bold uppercase tracking-wide text-[#607b8d]">{signal.category.replace("_", " ")}</span>
                          {!signal.passedCheapFilter && <span className="text-xs text-[#6f8798]">· gefilterd (geen AI-analyse)</span>}
                        </div>
                        <p className="mt-1 font-semibold text-white">{signal.title}</p>
                        {!isRedundantSummary(signal.title, signal.summary) && <p className="mt-1 text-sm text-[#91aabb]">{signal.summary}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#6f8798]">
                          <span>{signal.source}</span>
                          <span>· {dateFormat.format(new Date(signal.detectedAt))}</span>
                          {signal.sourceUrl && (
                            <a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#5bc0df] hover:underline">
                              bron<ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {filtered.length > visibleCount && (
                <div className="flex justify-center border-t border-white/8 p-4">
                  <button className="secondary-button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                    Toon meer ({filtered.length - visibleCount} resterend)
                  </button>
                </div>
              )}
            </>
          );
        })()}
      </article>
    </AppShell>
  );
}
