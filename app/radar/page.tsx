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

type ProviderStatus = { key: string; label: string; configured: boolean; missingConfigHint?: string };

type StatusFilter = "all" | "new" | "analyzed" | "irrelevant";

const dateFormat = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const STATUS_LABEL: Record<SignalRow["status"], { label: string; className: string }> = {
  new: { label: "Nieuw -- wacht op AI-analyse", className: "status-attention" },
  analyzed: { label: "Geanalyseerd", className: "status-live" },
  irrelevant: { label: "Niet relevant", className: "status-paused" },
};

export default function RadarPage() {
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);

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
    <AppShell active="radar" title="Radar" subtitle="Externe signalen die relevant kunnen zijn voor Finderz Keeperz">
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
              <p className="mt-1 text-xs text-[#7f97a8]">{provider.configured ? "Actief" : provider.missingConfigHint || "Nog niet geconfigureerd"}</p>
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
        <div className="border-b border-white/8 px-5 py-3">
          <div className="format-switch">
            <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>Alle</button>
            <button className={statusFilter === "new" ? "active" : ""} onClick={() => setStatusFilter("new")}>Nieuw</button>
            <button className={statusFilter === "analyzed" ? "active" : ""} onClick={() => setStatusFilter("analyzed")}>Geanalyseerd</button>
            <button className={statusFilter === "irrelevant" ? "active" : ""} onClick={() => setStatusFilter("irrelevant")}>Niet relevant</button>
          </div>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
        ) : signals.length === 0 ? (
          <p className="py-16 text-center text-sm text-[#7f97a8]">Nog geen signalen gevonden. Klik op &quot;Scan nu&quot; om de Radar te laten zoeken.</p>
        ) : (
          <div className="divide-y divide-white/8">
            {signals.map((signal) => (
              <div className="px-5 py-4" key={signal.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={"status " + STATUS_LABEL[signal.status].className}><span />{STATUS_LABEL[signal.status].label}</span>
                  <span className="text-xs font-bold uppercase tracking-wide text-[#607b8d]">{signal.category.replace("_", " ")}</span>
                  {!signal.passedCheapFilter && <span className="text-xs text-[#6f8798]">· gefilterd (geen AI-analyse)</span>}
                </div>
                <p className="mt-1 font-semibold text-white">{signal.title}</p>
                <p className="mt-1 text-sm text-[#91aabb]">{signal.summary}</p>
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
        )}
      </article>
    </AppShell>
  );
}
