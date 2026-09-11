"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, BarChart3, BrainCircuit,
  CheckCircle2, CircleDollarSign, Clock3, Download, Gauge, ImageIcon,
  ListChecks, Megaphone, MousePointerClick, Pause, Pencil, Play, Plus,
  RefreshCw, Search, ShieldCheck, Sparkles, Target, Trash2, Upload,
  TrendingUp, Users, Zap, LoaderCircle,
} from "lucide-react";
import { AppShell, FinderzMark } from "@/components/app-shell";
import { CreativePreview } from "@/components/creative-preview";
import { type ImportCandidate, ImportCampaignSheet } from "@/components/import-campaign-sheet";
import { LeadFormSheet } from "@/components/lead-form-sheet";
import { NewCampaignSheet } from "@/components/new-campaign-sheet";
import { PortfolioBudgetCard } from "@/components/portfolio-budget-card";
import { deriveDailyBudgetCents } from "@/lib/campaign-engine";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  type Campaign, type CampaignRow, rowToCampaign, statusLabel,
} from "@/lib/campaign-client";
import {
  CREATIVE_DIMENSIONS, downloadCreative, renderCreative, type CreativeFormat,
} from "@/lib/creative-renderer";
import { useMetaStatus } from "@/lib/use-meta-status";

type OptimizationAction = {
  id: number;
  rule: string;
  severity: "info" | "attention" | "critical";
  recommendation: string;
  status?: "pending" | "applied" | "dismissed";
  budgetChangePercent?: number | null;
  createdAt: string;
  campaignId?: string;
  campaignTitle: string;
};

// Stoplicht: rood = urgent, oranje = bijna, groen = gezond -- gebruikt overal
// waar een automatiseringsactie of -suggestie wordt getoond, zodat iemand
// zonder marketingachtergrond in één oogopslag ziet wat aandacht nodig heeft.
const SEVERITY_STOPLICHT: Record<OptimizationAction["severity"], { statusClass: string; label: string }> = {
  critical: { statusClass: "status-paused", label: "Urgent" },
  attention: { statusClass: "status-attention", label: "Bijna" },
  info: { statusClass: "status-good", label: "Gezond" },
};

const ACTIVITY_RULE_LABEL: Record<string, string> = {
  budget_ceiling: "Budgetplafond bereikt",
  no_leads_after_spend: "Geen leads ondanks bereik",
  cpl_above_limit: "Leads te duur",
  creative_fatigue: "Campagne aan vervanging toe",
  low_lead_quality: "Te veel onbruikbare leads",
  healthy_cpl: "Budget verhoogd",
  ad_rejected: "Campagne afgekeurd door Meta",
  periodic_creative_check: "Check of beeld/tekst nog fris is",
};

const ACTIVITY_TONE: Record<OptimizationAction["severity"], string> = { info: "green", attention: "amber", critical: "red" };

const activityDateFormat = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const euro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const headerDateFormat = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" });

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatRelativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "net";
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "dag" : "dagen"} geleden`;
}

type HistoryPoint = { recordedAt: string; cpl: number | null };

type CampaignAd = { id: string; name: string; status: string; effectiveStatus: string; thumbnailUrl?: string; spend: number; leads: number };

type LeadFormQuestion = { type: string; key?: string; label?: string };
type LeadFormDetails = { id: string; name: string; status: string; questions: LeadFormQuestion[]; locale?: string };

const STANDARD_QUESTION_LABEL: Record<string, string> = {
  FULL_NAME: "Volledige naam", EMAIL: "E-mailadres", PHONE: "Telefoonnummer",
  CITY: "Woonplaats", COMPANY_NAME: "Bedrijfsnaam", JOB_TITLE: "Functietitel",
};

/**
 * Which specific ad is running inside this campaign, with a creative
 * preview -- we don't control which *placement* (Feed, Reels, Stories, ...)
 * an ad shows in, Meta's delivery system does, so a breakdown per ad is the
 * one that's actually actionable: which ad to pause, refresh, or duplicate.
 */
/**
 * How one ad's cost/lead compares to the best-performing sibling ad in the
 * same campaign -- "neutral" (not enough data to compare, or fewer than 2
 * ads with leads yet) rather than forcing a judgement on too little data.
 */
type AdPerformanceTier = "good" | "warning" | "poor";
type AdPerformanceInfo = { tier: AdPerformanceTier; label: string; dotClass: string; reason: string; recommendation: string };

const AD_PERFORMANCE_STYLE: Record<AdPerformanceTier, { label: string; dotClass: string }> = {
  good: { label: "Presteert goed", dotClass: "bg-[#4ade80]" },
  warning: { label: "Let op", dotClass: "bg-[#df9826]" },
  poor: { label: "Presteert slecht", dotClass: "bg-[#d65a61]" },
};

/**
 * How one active ad's cost/lead compares to the best-performing sibling ad
 * in the same campaign -- null (not shown) rather than forcing a judgement
 * when there aren't at least 2 active ads with leads yet to compare against.
 * Carries a plain-language reason so the badge isn't just a color someone
 * has to guess the meaning of -- it's the thing you'd read before deciding
 * whether to pause the ad right there in the same row.
 */
// Below this many leads, a CPL comparison is still mostly noise -- worth
// showing, but the recommendation should say so rather than sound as sure
// of itself as it would with a real sample size.
const AD_PERFORMANCE_CONFIDENT_LEADS = 5;

function getAdPerformanceInfo(ad: CampaignAd, activeAds: CampaignAd[]): AdPerformanceInfo | null {
  const comparable = activeAds.filter((other) => other.leads > 0);
  if (comparable.length < 2) return null;
  const bestCpl = Math.min(...comparable.map((other) => other.spend / other.leads));
  const lowConfidence = ad.leads < AD_PERFORMANCE_CONFIDENT_LEADS;
  const confidenceNote = lowConfidence ? ` Nog maar ${ad.leads} lead${ad.leads === 1 ? "" : "s"} binnen voor deze advertentie -- neem dit nog niet als zekerheid.` : "";

  if (ad.leads === 0) {
    if (ad.spend <= bestCpl * 2) return null;
    return {
      tier: "poor",
      ...AD_PERFORMANCE_STYLE.poor,
      reason: `Al ${euro.format(ad.spend)} uitgegeven zonder een lead, terwijl de best presterende advertentie in deze campagne op ${euro.format(bestCpl)} per lead zit.`,
      recommendation: `Advies: pauzeer deze advertentie. Het budget van de campagne gaat dan automatisch naar de advertentie(s) die wel leads opleveren.`,
    };
  }

  const cpl = ad.spend / ad.leads;
  const diffPercent = Math.round(((cpl - bestCpl) / bestCpl) * 100);
  if (cpl <= bestCpl * 1.25) {
    return {
      tier: "good",
      ...AD_PERFORMANCE_STYLE.good,
      reason: `Beste (of bijna beste) kosten per lead van deze campagne: ${euro.format(cpl)} per lead.`,
      recommendation: "Geen actie nodig.",
    };
  }
  if (cpl <= bestCpl * 2) {
    return {
      tier: "warning",
      ...AD_PERFORMANCE_STYLE.warning,
      reason: `Kosten per lead (${euro.format(cpl)}) liggen ${diffPercent}% hoger dan de best presterende advertentie in deze campagne (${euro.format(bestCpl)}).`,
      recommendation: `Advies: nog niet pauzeren, wel in de gaten houden. Blijft dit zo (of wordt het erger), dan is pauzeren de volgende stap.${confidenceNote}`,
    };
  }
  return {
    tier: "poor",
    ...AD_PERFORMANCE_STYLE.poor,
    reason: `Kosten per lead (${euro.format(cpl)}) liggen ${diffPercent}% hoger dan de best presterende advertentie in deze campagne (${euro.format(bestCpl)}).`,
    recommendation: `Advies: pauzeer deze advertentie${lowConfidence ? " (maar wacht dit desgewenst nog even af, zie hieronder)" : ""}. Het budget gaat dan automatisch naar de beter presterende advertentie(s).${confidenceNote}`,
  };
}

function AdBreakdownTable({ ads, connected, campaignId, onAdStatusChanged }: {
  ads: CampaignAd[];
  connected: boolean;
  campaignId: string;
  onAdStatusChanged: (adId: string, effectiveStatus: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
  const [pausingId, setPausingId] = useState<string | null>(null);

  async function toggleAdStatus(ad: CampaignAd) {
    const nextStatus = ad.effectiveStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setPausingId(ad.id);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/ads/${ad.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Advertentiestatus kon niet worden gewijzigd.");
      onAdStatusChanged(ad.id, nextStatus);
      toast.success(nextStatus === "PAUSED" ? "Advertentie gepauzeerd" : "Advertentie hervat");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Advertentiestatus kon niet worden gewijzigd.");
    } finally {
      setPausingId(null);
    }
  }

  if (!connected) {
    return (
      <div className="panel">
        <div className="panel-header"><p className="text-sm font-semibold text-white">Advertenties</p></div>
        <p className="px-5 pb-5 text-sm text-[#7f97a8]">Beschikbaar zodra deze campagne aan Meta gekoppeld is.</p>
      </div>
    );
  }
  const sorted = ads.slice().sort((a, b) => b.spend - a.spend);
  const activeAds = sorted.filter((ad) => ad.effectiveStatus === "ACTIVE");
  const activeCount = activeAds.length;
  const filtered = statusFilter === "active" ? activeAds : sorted;
  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <div><p className="text-sm font-semibold text-white">Advertenties</p><p className="mt-1 text-xs text-[#607b8d]">Welke advertentie draait, en hoe die het doet</p></div>
        {sorted.length > 0 && (
          <div className="format-switch shrink-0">
            <button className={statusFilter === "active" ? "active" : ""} onClick={() => setStatusFilter("active")}>Actief<span>{activeCount}</span></button>
            <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>Alle<span>{sorted.length}</span></button>
          </div>
        )}
      </div>
      {sorted.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-[#7f97a8]">Nog geen advertenties gevonden voor deze campagne.</p>
      ) : filtered.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-[#7f97a8]">Geen actieve advertenties.</p>
      ) : (
        <div className="divide-y divide-white/8">
          {filtered.map((ad) => {
            const stoplicht = AD_MANAGER_STATUS[ad.effectiveStatus] ?? { label: ad.effectiveStatus, statusClass: "status-attention" };
            const performance = ad.effectiveStatus === "ACTIVE" ? getAdPerformanceInfo(ad, activeAds) : null;
            return (
              <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5" key={ad.id}>
                <div className="flex min-w-0 items-center gap-3">
                  {ad.thumbnailUrl ? (
                    <img src={ad.thumbnailUrl} alt="" className="size-11 shrink-0 rounded-lg border border-white/10 object-cover" />
                  ) : (
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#607b8d]"><ImageIcon className="size-4" /></div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={"status " + stoplicht.statusClass}><span />{stoplicht.label}</span>
                      {performance && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-default items-center gap-1.5 text-xs font-semibold text-[#91aabb] underline decoration-dotted decoration-[#4a6478] underline-offset-2">
                              <span className={"size-2 shrink-0 rounded-full " + performance.dotClass} />{performance.label}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-72">
                            <p>{performance.reason}</p>
                            <p className="mt-1.5 font-semibold">{performance.recommendation}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-white">{ad.name}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-5 text-right text-sm">
                  <div><span className="block text-xs text-[#607b8d]">Uitgegeven</span><strong className="text-white">{euro.format(ad.spend)}</strong></div>
                  <div><span className="block text-xs text-[#607b8d]">Leads</span><strong className="text-white">{ad.leads}</strong></div>
                  <div><span className="block text-xs text-[#607b8d]">Kosten/lead</span><strong className="text-white">{ad.leads > 0 ? euro.format(ad.spend / ad.leads) : "—"}</strong></div>
                  {(ad.effectiveStatus === "ACTIVE" || ad.effectiveStatus === "PAUSED") && (
                    <button className="secondary-button" onClick={() => void toggleAdStatus(ad)} disabled={pausingId === ad.id}>
                      {pausingId === ad.id ? <LoaderCircle className="size-4 animate-spin" /> : ad.effectiveStatus === "ACTIVE" ? <Pause className="size-4" /> : <Play className="size-4" />}
                      {ad.effectiveStatus === "ACTIVE" ? "Pauzeer" : "Hervat"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * A recognizable mock of what a candidate actually sees on Meta -- the same
 * white-card, blue-button look as the real thing -- rather than a plain list
 * of field names. The whole point of building this in-platform is to need
 * Meta Ads Manager as little as possible, so it should look like "the form",
 * not like a settings list someone has to translate in their head.
 */
function LeadFormPreview({ form }: { form: LeadFormDetails }) {
  return (
    <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-2xl border border-black/10 bg-white text-[#1c1e21] shadow-xl">
      <div className="border-b border-black/10 px-4 py-3 text-center text-sm font-semibold">{form.name}</div>
      <div className="space-y-2.5 p-4">
        {form.questions.map((question, index) => (
          <div className="truncate rounded-lg border border-black/15 bg-[#f5f6f7] px-3 py-2.5 text-sm text-[#65676b]" key={index}>
            {question.type === "CUSTOM" ? question.label : STANDARD_QUESTION_LABEL[question.type] ?? question.type}
          </div>
        ))}
      </div>
      <div className="px-4 pb-4">
        <div className="rounded-lg bg-[#1877f2] py-2.5 text-center text-sm font-semibold text-white">Verzenden</div>
      </div>
    </div>
  );
}

const trendDateFormat = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });

function TrendChart({ history }: { history: HistoryPoint[] }) {
  const valid = history.filter((point): point is { recordedAt: string; cpl: number } => point.cpl !== null);

  if (valid.length < 2) {
    return (
      <div className="trend-chart flex items-center justify-center" aria-label="Kosten per lead">
        <p className="text-sm text-[#6f8798]">Nog onvoldoende meetpunten voor een trend. Komt vanzelf zodra de campagne langer draait.</p>
      </div>
    );
  }

  const width = 510;
  const height = 110;
  const cpls = valid.map((point) => point.cpl);
  const min = Math.min(...cpls);
  const max = Math.max(...cpls);
  const range = max - min || 1;
  const coords = valid.map((point, index) => {
    const x = 2 + (index / (valid.length - 1)) * (width - 4);
    const y = height - 4 - ((point.cpl - min) / range) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = coords[coords.length - 1].split(",");
  const labelIndexes = [0, Math.floor((valid.length - 1) / 2), valid.length - 1];

  return (
    <div className="trend-chart" aria-label="Kosten per lead over tijd">
      <div className="trend-grid" />
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true">
        <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1aa6d1" stopOpacity="0.3" /><stop offset="100%" stopColor="#1aa6d1" stopOpacity="0" /></linearGradient></defs>
        <path d={`M ${coords.join(" L ")} L ${width - 2},${height} L 2,${height} Z`} fill="url(#area)" />
        <polyline points={coords.join(" ")} fill="none" stroke="#35b7df" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r="5" fill="#0e324e" stroke="#72d1ec" strokeWidth="3" />
      </svg>
      <div className="mt-2 flex justify-between text-xs text-[#6f8798]">
        {labelIndexes.map((index) => <span key={index}>{trendDateFormat.format(new Date(valid[index].recordedAt))}</span>)}
      </div>
    </div>
  );
}

type AdManagerCampaign = { id: string; name: string; status: string; effectiveStatus: string; spend: number; leads: number; dailyBudgetCents?: number; lifetimeBudgetCents?: number };

const AD_MANAGER_STATUS: Record<string, { label: string; statusClass: string }> = {
  ACTIVE: { label: "Actief", statusClass: "status-good" },
  PAUSED: { label: "Gepauzeerd", statusClass: "status-draft" },
  ARCHIVED: { label: "Gearchiveerd", statusClass: "status-draft" },
  DELETED: { label: "Verwijderd", statusClass: "status-draft" },
  DISAPPROVED: { label: "Afgekeurd", statusClass: "status-paused" },
  PENDING_REVIEW: { label: "In beoordeling", statusClass: "status-attention" },
  WITH_ISSUES: { label: "Heeft een probleem", statusClass: "status-attention" },
  IN_PROCESS: { label: "Wordt verwerkt", statusClass: "status-attention" },
};

function AdManagerCampaignsCard({ importedIds, onImport }: { importedIds: Set<string>; onImport: (candidate: ImportCandidate) => void }) {
  const [connected, setConnected] = useState(false);
  const [campaigns, setCampaigns] = useState<AdManagerCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "active">("active");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/meta/all-campaigns");
        const payload = await response.json() as { connected?: boolean; campaigns?: AdManagerCampaign[]; error?: string };
        if (response.ok && !cancelled) {
          setConnected(Boolean(payload.connected));
          setCampaigns(payload.campaigns ?? []);
        }
      } catch {
        // The dashboard still works without this panel; fail quietly.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = campaigns.slice().sort((a, b) => {
    if (a.effectiveStatus === "ACTIVE" && b.effectiveStatus !== "ACTIVE") return -1;
    if (b.effectiveStatus === "ACTIVE" && a.effectiveStatus !== "ACTIVE") return 1;
    return b.spend - a.spend;
  });
  const activeCount = sorted.filter((campaign) => campaign.effectiveStatus === "ACTIVE").length;
  const filtered = statusFilter === "active" ? sorted.filter((campaign) => campaign.effectiveStatus === "ACTIVE") : sorted;

  return (
    <article className="panel overflow-hidden">
      <div className="panel-header">
        <div>
          <div className="eyebrow"><Megaphone className="size-3.5" />Rechtstreeks uit Meta</div>
          <h2>Campagnes in Ads Manager</h2>
          <p className="mt-1 text-xs text-[#607b8d]">Alles wat er in het hele advertentieaccount staat, óók wat niet via dit platform is gemaakt of wordt beheerd.</p>
        </div>
        {connected && sorted.length > 0 && (
          <div className="format-switch shrink-0">
            <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>Alle<span>{sorted.length}</span></button>
            <button className={statusFilter === "active" ? "active" : ""} onClick={() => setStatusFilter("active")}>Actief<span>{activeCount}</span></button>
          </div>
        )}
      </div>
      {!connected ? (
        <p className="px-5 py-10 text-sm text-[#7f97a8]">Beschikbaar zodra Meta gekoppeld is.</p>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-16 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
      ) : sorted.length === 0 ? (
        <p className="px-5 py-10 text-sm text-[#7f97a8]">Geen campagnes gevonden in dit advertentieaccount.</p>
      ) : filtered.length === 0 ? (
        <p className="px-5 py-10 text-sm text-[#7f97a8]">Geen actieve campagnes.</p>
      ) : (
        <div className="max-h-[26rem] divide-y divide-white/8 overflow-y-auto scrollbar-thin">
          {filtered.map((campaign) => {
            const stoplicht = AD_MANAGER_STATUS[campaign.effectiveStatus] ?? { label: campaign.effectiveStatus, statusClass: "status-attention" };
            return (
              <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5" key={campaign.id}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className={"status " + stoplicht.statusClass}><span />{stoplicht.label}</span>
                  <span className="truncate text-sm font-medium text-white">{campaign.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-5 text-right text-sm">
                  <div><span className="block text-xs text-[#607b8d]">Uitgegeven</span><strong className="text-white">{euro.format(campaign.spend)}</strong></div>
                  <div><span className="block text-xs text-[#607b8d]">Dagbudget</span><strong className="text-white">{campaign.dailyBudgetCents !== undefined ? euro.format(campaign.dailyBudgetCents / 100) : "—"}</strong></div>
                  <div><span className="block text-xs text-[#607b8d]">Leads</span><strong className="text-white">{campaign.leads}</strong></div>
                  {importedIds.has(campaign.id) ? (
                    <span className="rule-pill">Overgenomen</span>
                  ) : (
                    <button
                      className="secondary-button"
                      onClick={() => onImport({
                        metaCampaignId: campaign.id,
                        name: campaign.name,
                        effectiveStatus: campaign.effectiveStatus,
                        spendCents: Math.round(campaign.spend * 100),
                        dailyBudgetCents: campaign.dailyBudgetCents,
                        leads: campaign.leads,
                      })}
                    >
                      Importeer
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

type MarketingSpendSummary = {
  today: { meta: number; indeed: number; total: number };
  last7d: { meta: number; indeed: number; total: number };
  lifetime: { meta: number; indeed: number; total: number };
};

/**
 * Replaces three near-identical "spend" cards (combined total, platform-only,
 * whole Meta account) that used to sit stacked on the dashboard -- recruiters
 * kept mixing them up since each showed a similarly-sized number with only
 * small text telling them apart. One glance now: the combined total is the
 * only hero number; Meta/Indeed and the 7-day/lifetime figures are secondary
 * stat tiles; the platform-managed subset (a bookkeeping detail, not
 * something to act on daily) is a single small footnote line.
 */
function MarketingSpendCard({ isMetaAutomatic, platformTotalSpend, onSpendSaved }: { isMetaAutomatic: boolean; platformTotalSpend: number; onSpendSaved?: () => void }) {
  const [summary, setSummary] = useState<MarketingSpendSummary | null>(null);
  const [today, setToday] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [summaryResponse, spendResponse] = await Promise.all([
          fetch("/api/marketing-spend-summary"),
          fetch("/api/daily-spend"),
        ]);
        const summaryPayload = await summaryResponse.json() as MarketingSpendSummary & { error?: string };
        if (summaryResponse.ok && !cancelled) setSummary(summaryPayload);
        const spendPayload = await spendResponse.json() as { today?: string };
        if (spendResponse.ok && spendPayload.today && !cancelled) setToday(spendPayload.today);
      } catch {
        // The dashboard still works without this card; fail quietly.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function startEditingMeta() {
    setDraft(summary ? String(summary.today.meta).replace(".", ",") : "");
    setIsEditingMeta(true);
  }

  async function saveMetaToday() {
    const amount = Number(draft.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Vul een geldig bedrag in.");
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch("/api/daily-spend", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, amount }),
      });
      if (!response.ok) throw new Error("Dagtotaal kon niet worden opgeslagen.");
      setIsEditingMeta(false);
      toast.success("Dagtotaal bijgewerkt");
      onSpendSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dagtotaal kon niet worden opgeslagen.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="panel p-5">
      <div className="eyebrow"><CircleDollarSign className="size-3.5" />Marketingkosten</div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs text-[#7f97a8]">Vandaag besteed · Meta + Indeed</p>
          <span className="mt-1 block text-4xl font-bold tracking-tight text-white">{isLoading || !summary ? "…" : euro.format(summary.today.total)}</span>
        </div>
        <div className="flex gap-6 text-right">
          <div><span className="block text-xs text-[#6f8798]">Laatste 7 dagen</span><strong className="text-lg font-semibold text-white">{summary ? euro.format(summary.last7d.total) : "—"}</strong></div>
          <div><span className="block text-xs text-[#6f8798]">Totaal</span><strong className="text-lg font-semibold text-white">{summary ? euro.format(summary.lifetime.total) : "—"}</strong></div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="budget-stat">
          <div className="flex items-center justify-between"><span>Meta</span>{isMetaAutomatic && <span className="live-pulse"><span />Live</span>}</div>
          {isEditingMeta ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="daily-spend-prefix text-base">€</span>
              <input
                autoFocus
                className="daily-spend-input !w-20 !py-1 !text-base"
                inputMode="decimal"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void saveMetaToday()}
              />
              <button className="secondary-button !h-8 !px-2" onClick={saveMetaToday} disabled={isSaving}>{isSaving ? <LoaderCircle className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}</button>
              <button className="secondary-button !h-8 !px-2" onClick={() => setIsEditingMeta(false)}>Stop</button>
            </div>
          ) : (
            <div className="mt-1 flex items-end justify-between gap-2">
              <strong>{summary ? euro.format(summary.today.meta) : "—"}</strong>
              {!isMetaAutomatic && <button className="secondary-button !h-8 !px-2 !text-xs" onClick={startEditingMeta}><Pencil className="size-3.5" />Bewerken</button>}
            </div>
          )}
        </div>
        <div className="budget-stat"><span>Indeed</span><strong>{summary ? euro.format(summary.today.indeed) : "—"}</strong></div>
      </div>

      <p className="mt-4 text-xs leading-5 text-[#607b8d]">
        {isMetaAutomatic ? "Meta wordt elke 15 minuten automatisch bijgewerkt." : "Vul dagelijks in wat je in Meta Ads Manager ziet."} Waarvan via dit platform beheerd (totaal): {euro.format(platformTotalSpend)}.
      </p>
    </section>
  );
}

type DailyCampaignSpend = { id: string; name: string; channel: "meta" | "indeed"; todaySpendCents: number };

/**
 * Per-campaign version of the total on MarketingSpendCard -- which campaign
 * is spending what today, split by channel. Meta figures cover the whole ad
 * account (not just campaigns managed via this platform), read straight from
 * Meta's own per-campaign insights; Indeed figures come from the same
 * hand-entered (now auto-carried-forward) numbers shown on the Indeed card.
 */
function TodaySpendByCampaignCard() {
  const [rows, setRows] = useState<DailyCampaignSpend[]>([]);
  const [metaConnected, setMetaConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [metaResponse, indeedResponse] = await Promise.all([
          fetch("/api/meta/all-campaigns?preset=today"),
          fetch("/api/indeed-campaigns"),
        ]);
        const metaPayload = await metaResponse.json() as { connected?: boolean; campaigns?: Array<{ id: string; name: string; spend: number }> };
        const indeedPayload = await indeedResponse.json() as { campaigns?: Array<{ id: string; title: string; todaySpendCents: number }> };
        if (cancelled) return;
        setMetaConnected(Boolean(metaPayload.connected));
        const metaRows: DailyCampaignSpend[] = (metaPayload.campaigns ?? [])
          .filter((campaign) => campaign.spend > 0)
          .map((campaign) => ({ id: `meta-${campaign.id}`, name: campaign.name, channel: "meta", todaySpendCents: Math.round(campaign.spend * 100) }));
        const indeedRows: DailyCampaignSpend[] = (indeedPayload.campaigns ?? [])
          .filter((campaign) => campaign.todaySpendCents > 0)
          .map((campaign) => ({ id: `indeed-${campaign.id}`, name: campaign.title, channel: "indeed", todaySpendCents: campaign.todaySpendCents }));
        setRows([...metaRows, ...indeedRows]);
      } catch {
        // The dashboard still works without this card; fail quietly.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const metaRows = rows.filter((row) => row.channel === "meta").sort((a, b) => b.todaySpendCents - a.todaySpendCents);
  const indeedRows = rows.filter((row) => row.channel === "indeed").sort((a, b) => b.todaySpendCents - a.todaySpendCents);
  const totalCents = rows.reduce((sum, row) => sum + row.todaySpendCents, 0);

  return (
    <article className="panel overflow-hidden">
      <div className="panel-header">
        <div>
          <div className="eyebrow"><ListChecks className="size-3.5" />Vandaag per campagne</div>
          <h2>Waar gaat het budget vandaag naartoe</h2>
        </div>
        <div className="text-right"><span className="block text-xs text-[#607b8d]">Totaal vandaag</span><strong className="text-lg font-semibold text-white">{euro.format(totalCents / 100)}</strong></div>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <p className="px-5 py-10 text-sm text-[#7f97a8]">{metaConnected ? "Nog geen besteding vandaag." : "Beschikbaar zodra Meta gekoppeld is."}</p>
      ) : (
        <div className="divide-y divide-white/8">
          {metaRows.length > 0 && (
            <div className="px-5 py-4">
              <span className="table-heading">Meta</span>
              <div className="mt-2.5 space-y-2">
                {metaRows.map((row) => (
                  <div className="flex items-center justify-between gap-3 text-sm" key={row.id}>
                    <span className="truncate text-[#c4d1d9]">{row.name}</span>
                    <strong className="shrink-0 text-white">{euro.format(row.todaySpendCents / 100)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
          {indeedRows.length > 0 && (
            <div className="px-5 py-4">
              <span className="table-heading">Indeed</span>
              <div className="mt-2.5 space-y-2">
                {indeedRows.map((row) => (
                  <div className="flex items-center justify-between gap-3 text-sm" key={row.id}>
                    <span className="truncate text-[#c4d1d9]">{row.name}</span>
                    <strong className="shrink-0 text-white">{euro.format(row.todaySpendCents / 100)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

type IndeedCampaign = {
  id: string;
  title: string;
  status: "active" | "paused";
  todaySpendCents: number;
  weekSpendCents: number;
  totalSpendCents: number;
};

function IndeedSpendCard({ onSpendSaved }: { onSpendSaved?: () => void }) {
  const [today, setToday] = useState("");
  const [campaigns, setCampaigns] = useState<IndeedCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active">("active");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/indeed-campaigns");
        const payload = await response.json() as { today?: string; campaigns?: IndeedCampaign[]; error?: string };
        if (!response.ok || !payload.today) throw new Error(payload.error || "Indeed-campagnes konden niet worden geladen.");
        if (cancelled) return;
        setToday(payload.today);
        setCampaigns(payload.campaigns ?? []);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Indeed-campagnes konden niet worden geladen.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCount = campaigns.filter((campaign) => campaign.status === "active").length;
  const filtered = statusFilter === "active" ? campaigns.filter((campaign) => campaign.status === "active") : campaigns;
  const totals = filtered.reduce(
    (acc, campaign) => ({
      today: acc.today + campaign.todaySpendCents,
      week: acc.week + campaign.weekSpendCents,
      total: acc.total + campaign.totalSpendCents,
    }),
    { today: 0, week: 0, total: 0 },
  );

  function startEditing(campaign: IndeedCampaign) {
    setEditingId(campaign.id);
    setDraft(campaign.todaySpendCents > 0 ? String(campaign.todaySpendCents / 100).replace(".", ",") : "");
  }

  async function saveSpend(campaignId: string) {
    const amount = Number(draft.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Vul een geldig bedrag in.");
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(`/api/indeed-campaigns/${campaignId}/spend`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, amount }),
      });
      const payload = await response.json() as { entry?: { amountCents: number }; error?: string };
      if (!response.ok || !payload.entry) throw new Error(payload.error || "Indeed-spend kon niet worden opgeslagen.");
      const savedCents = payload.entry.amountCents;
      setCampaigns((current) => current.map((campaign) => {
        if (campaign.id !== campaignId) return campaign;
        const delta = savedCents - campaign.todaySpendCents;
        return { ...campaign, todaySpendCents: savedCents, weekSpendCents: campaign.weekSpendCents + delta, totalSpendCents: campaign.totalSpendCents + delta };
      }));
      setEditingId(null);
      toast.success("Indeed-spend bijgewerkt");
      onSpendSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Indeed-spend kon niet worden opgeslagen.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleStatus(campaign: IndeedCampaign) {
    const nextStatus = campaign.status === "active" ? "paused" : "active";
    try {
      const response = await fetch(`/api/indeed-campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await response.json() as { campaign?: { status: "active" | "paused" }; error?: string };
      if (!response.ok || !payload.campaign) throw new Error(payload.error || "Status kon niet worden gewijzigd.");
      setCampaigns((current) => current.map((item) => (item.id === campaign.id ? { ...item, status: payload.campaign!.status } : item)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Status kon niet worden gewijzigd.");
    }
  }

  async function addCampaign() {
    if (!newTitle.trim()) {
      toast.error("Vul een titel in.");
      return;
    }
    setIsCreating(true);
    try {
      const response = await fetch("/api/indeed-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      const payload = await response.json() as { campaign?: IndeedCampaign; error?: string };
      if (!response.ok || !payload.campaign) throw new Error(payload.error || "Indeed-campagne kon niet worden aangemaakt.");
      setCampaigns((current) => [...current, payload.campaign!]);
      setNewTitle("");
      setIsAdding(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Indeed-campagne kon niet worden aangemaakt.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <article className="panel overflow-hidden">
      <div className="panel-header">
        <div>
          <div className="eyebrow"><BarChart3 className="size-3.5" />Handmatig bijgehouden</div>
          <h2>Indeed-campagnes</h2>
          <p className="mt-1 text-xs text-[#607b8d]">Geen automatische koppeling (vraagt een partnertraject bij Indeed) — vul per campagne handmatig in, dan telt het mee in het totaal bovenaan.</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {campaigns.length > 0 && (
            <div className="format-switch">
              <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>Alle<span>{campaigns.length}</span></button>
              <button className={statusFilter === "active" ? "active" : ""} onClick={() => setStatusFilter("active")}>Actief<span>{activeCount}</span></button>
            </div>
          )}
          <button className="secondary-button" onClick={() => setIsAdding((value) => !value)}><Plus className="size-4" />Campagne</button>
        </div>
      </div>
      {isAdding && (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/8 px-5 py-4">
          <input
            className="content-input min-w-48 flex-1"
            placeholder="Titel, bijv. Technisch Medewerker Amsterdam"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void addCampaign()}
            autoFocus
          />
          <button className="primary-button" onClick={addCampaign} disabled={isCreating}>{isCreating ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Toevoegen</button>
          <button className="secondary-button" onClick={() => setIsAdding(false)}>Annuleren</button>
        </div>
      )}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
      ) : campaigns.length === 0 ? (
        <div className="px-5 py-10 text-sm text-[#7f97a8]">Nog geen Indeed-campagnes toegevoegd.</div>
      ) : filtered.length === 0 ? (
        <div className="px-5 py-10 text-sm text-[#7f97a8]">Geen actieve Indeed-campagnes.</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 border-b border-white/8 px-5 py-4 text-sm">
            <div><span className="block text-xs text-[#607b8d]">Vandaag · {statusFilter === "active" ? "actieve" : "alle"} Indeed-campagnes</span><strong className="text-lg text-white">{euro.format(totals.today / 100)}</strong></div>
            <div><span className="block text-xs text-[#607b8d]">Laatste 7 dagen</span><strong className="text-lg text-white">{euro.format(totals.week / 100)}</strong></div>
            <div><span className="block text-xs text-[#607b8d]">Totaal sinds bijhouden</span><strong className="text-lg text-white">{euro.format(totals.total / 100)}</strong></div>
          </div>
          <div className="divide-y divide-white/8">
            {filtered.map((campaign) => (
              <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4" key={campaign.id}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className={"status " + (campaign.status === "active" ? "status-good" : "status-draft")}><span />{campaign.status === "active" ? "Actief" : "Gepauzeerd"}</span>
                  <strong className="truncate text-sm text-white">{campaign.title}</strong>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-right text-xs text-[#607b8d]"><span className="block">Week: {euro.format(campaign.weekSpendCents / 100)}</span><span className="block">Totaal: {euro.format(campaign.totalSpendCents / 100)}</span></div>
                  {editingId === campaign.id ? (
                    <div className="daily-spend-edit">
                      <span className="daily-spend-prefix">€</span>
                      <input
                        autoFocus
                        className="daily-spend-input"
                        inputMode="decimal"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => event.key === "Enter" && void saveSpend(campaign.id)}
                        placeholder="0"
                      />
                      <button className="primary-button" onClick={() => void saveSpend(campaign.id)} disabled={isSaving}>{isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}</button>
                      <button className="secondary-button" onClick={() => setEditingId(null)}>Annuleren</button>
                    </div>
                  ) : (
                    <button className="secondary-button" onClick={() => startEditing(campaign)}><Pencil className="size-4" />Vandaag: {euro.format(campaign.todaySpendCents / 100)}</button>
                  )}
                  <button className="secondary-button" onClick={() => void toggleStatus(campaign)}>
                    {campaign.status === "active" ? <><Pause className="size-4" />Pauzeer</> : <><Play className="size-4" />Hervat</>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

function PendingActionsCard() {
  const [actions, setActions] = useState<OptimizationAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);

  async function fetchPending(): Promise<OptimizationAction[]> {
    const response = await fetch("/api/optimization-actions?status=pending");
    const payload = await response.json() as { actions?: OptimizationAction[]; error?: string };
    if (!response.ok || !payload.actions) throw new Error(payload.error || "Voorstellen konden niet worden geladen.");
    return payload.actions;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pending = await fetchPending();
        if (!cancelled) setActions(pending);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Voorstellen konden niet worden geladen.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handle(action: OptimizationAction, decision: "approve" | "dismiss") {
    setProcessingId(action.id);
    try {
      const response = await fetch(`/api/optimization-actions/${action.id}/${decision}`, { method: "POST" });
      const payload = await response.json() as { error?: string; cappedByPortfolioLimit?: boolean };
      if (!response.ok) throw new Error(payload.error || "Actie kon niet worden verwerkt.");
      setActions((current) => current.filter((item) => item.id !== action.id));
      if (decision === "approve") {
        toast.success(
          payload.cappedByPortfolioLimit
            ? "Budget verhoogd, maar begrensd door de dagbudget-grens"
            : "Budget verhoogd",
        );
      } else {
        toast.info("Voorstel afgewezen");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Actie kon niet worden verwerkt.");
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <article className="panel overflow-hidden">
      <div className="panel-header">
        <div><div className="eyebrow"><Zap className="size-3.5" />Wacht op jouw goedkeuring</div><h2>Uit te voeren acties</h2></div>
        {!isLoading && actions.length > 0 && <span className="rule-pill">{actions.length}</span>}
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
      ) : actions.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-10 text-sm text-[#7f97a8]"><CheckCircle2 className="size-5 text-[#4ade80]" />Niets om goed te keuren. Alles draait zoals het hoort.</div>
      ) : (
        <div className="divide-y divide-white/8">
          {actions.map((action) => {
            const stoplicht = SEVERITY_STOPLICHT[action.severity];
            return (
              <div className="flex flex-wrap items-start justify-between gap-4 p-5" key={action.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={"status " + stoplicht.statusClass}><span />{stoplicht.label}</span>
                    <strong className="text-sm text-white">{action.campaignTitle}</strong>
                    {Number.isFinite(action.budgetChangePercent) && <span className="rule-pill">+{action.budgetChangePercent}% budget</span>}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#c4d1d9]">{action.recommendation}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button className="secondary-button" disabled={processingId === action.id} onClick={() => void handle(action, "dismiss")}>Afwijzen</button>
                  <button className="primary-button" disabled={processingId === action.id} onClick={() => void handle(action, "approve")}>
                    {processingId === action.id ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Goedkeuren
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function toApiFields(update: Partial<Campaign>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (update.status !== undefined) fields.status = update.status;
  if (update.maxBudget !== undefined) fields.maxBudget = update.maxBudget;
  if (update.spend !== undefined) fields.spend = update.spend;
  if (update.primaryText !== undefined) fields.primaryText = update.primaryText;
  if (update.headline !== undefined) fields.headline = update.headline;
  if (update.adDescription !== undefined) fields.description = update.adDescription;
  if (update.usps !== undefined) fields.usps = update.usps;
  if (update.backgroundImage !== undefined) fields.backgroundImageUrl = update.backgroundImage;
  if (update.logoImage !== undefined) fields.logoImageUrl = update.logoImage;
  return fields;
}

export default function Home() {
  const metaStatus = useMetaStatus();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [tableStatusFilter, setTableStatusFilter] = useState<"active" | "all">("active");
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [creativeFormat, setCreativeFormat] = useState<CreativeFormat>("1:1");
  const [isGeneratingBackground, setIsGeneratingBackground] = useState(false);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [recentActions, setRecentActions] = useState<OptimizationAction[]>([]);
  const [campaignHistory, setCampaignHistory] = useState<HistoryPoint[]>([]);
  const [campaignAds, setCampaignAds] = useState<CampaignAd[]>([]);
  const [campaignAdsConnected, setCampaignAdsConnected] = useState(false);
  const [leadForm, setLeadForm] = useState<LeadFormDetails | null>(null);
  const [leadFormConnected, setLeadFormConnected] = useState(false);
  const [isNewLeadFormOpen, setIsNewLeadFormOpen] = useState(false);
  // Bumped whenever Meta or Indeed daily spend is saved, so the combined
  // MarketingSpendCard (which only fetches once on mount) refetches instead
  // of showing a stale total from before that edit.
  const [spendVersion, setSpendVersion] = useState(0);
  const [importCandidate, setImportCandidate] = useState<ImportCandidate | null>(null);
  const importedMetaCampaignIds = useMemo(
    () => new Set(campaigns.map((campaign) => campaign.metaCampaignId).filter((id): id is string => Boolean(id))),
    [campaigns],
  );
  const selected = campaigns.find((campaign) => campaign.id === selectedId);
  const totals = useMemo(() => {
    const spend = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
    const leads = campaigns.reduce((sum, campaign) => sum + campaign.leads, 0);
    const clicks = campaigns.reduce((sum, campaign) => sum + campaign.clicks, 0);
    const impressions = campaigns.reduce((sum, campaign) => sum + campaign.impressions, 0);
    const fee = campaigns.reduce((sum, campaign) => sum + campaign.fee, 0);
    const maxBudget = campaigns.reduce((sum, campaign) => sum + campaign.maxBudget, 0);
    const profit = fee - spend;
    const confirmed = campaigns.filter((campaign) => campaign.status === "completed");
    const confirmedProfit = confirmed.reduce((sum, campaign) => sum + (campaign.fee - campaign.spend), 0);
    return {
      spend, leads, fee, maxBudget, profit, confirmedProfit,
      confirmedCount: confirmed.length,
      cpl: leads ? spend / leads : 0,
      ctr: impressions ? (clicks / impressions) * 100 : 0,
      budgetUsed: maxBudget ? Math.min((spend / maxBudget) * 100, 100) : 0,
    };
  }, [campaigns]);

  const tableActiveCount = campaigns.filter((campaign) => campaign.status === "live").length;
  const filteredTableCampaigns = tableStatusFilter === "active"
    ? campaigns.filter((campaign) => campaign.status === "live")
    : campaigns;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/campaigns");
        const payload = await response.json() as { campaigns?: CampaignRow[]; error?: string };
        if (!response.ok || !payload.campaigns) throw new Error(payload.error || "Campagnes konden niet worden geladen.");
        if (cancelled) return;
        const mapped = payload.campaigns.map(rowToCampaign);
        setCampaigns(mapped);
        setSelectedId(mapped[0]?.id);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Campagnes konden niet worden geladen.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/optimization-actions");
        const payload = await response.json() as { actions?: OptimizationAction[]; error?: string };
        if (response.ok && payload.actions && !cancelled) setRecentActions(payload.actions.slice(0, 5));
      } catch {
        // The dashboard still works without this panel; fail quietly.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selected) {
        if (!cancelled) setCampaignHistory([]);
        return;
      }
      try {
        const response = await fetch(`/api/campaigns/${selected.id}/history`);
        const payload = await response.json() as { points?: HistoryPoint[]; error?: string };
        if (response.ok && payload.points && !cancelled) setCampaignHistory(payload.points);
      } catch {
        // The performance tab still works without a trend; fail quietly.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Depend on the id, not the whole `selected` object: `selected` is
    // re-derived via campaigns.find() on every render, so depending on it
    // directly would refetch history on every unrelated campaign edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selected) {
        if (!cancelled) {
          setCampaignAds([]);
          setCampaignAdsConnected(false);
        }
        return;
      }
      try {
        const response = await fetch(`/api/campaigns/${selected.id}/ads`);
        const payload = await response.json() as { ads?: CampaignAd[]; connected?: boolean; error?: string };
        if (response.ok && !cancelled) {
          setCampaignAds(payload.ads ?? []);
          setCampaignAdsConnected(Boolean(payload.connected));
        }
      } catch {
        // The performance tab still works without an ad breakdown; fail quietly.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  async function refetchLeadForm(campaignId: string) {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/lead-form`);
      const payload = await response.json() as { form?: LeadFormDetails | null; connected?: boolean; error?: string };
      if (response.ok) {
        setLeadForm(payload.form ?? null);
        setLeadFormConnected(Boolean(payload.connected));
      }
    } catch {
      // The performance tab still works without the lead form view; fail quietly.
    }
  }

  useEffect(() => {
    (async () => {
      if (!selected) {
        setLeadForm(null);
        setLeadFormConnected(false);
        return;
      }
      await refetchLeadForm(selected.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  function addCampaign(campaign: Campaign) {
    setCampaigns((current) => [campaign, ...current]);
    setSelectedId(campaign.id);
  }

  function patchCampaign(campaignId: string, update: Partial<Campaign>) {
    setCampaigns((current) => current.map((campaign) => (campaign.id === campaignId ? { ...campaign, ...update } : campaign)));
  }

  async function persistCampaign(campaignId: string, fields: Record<string, unknown>) {
    if (Object.keys(fields).length === 0) return;
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const payload = await response.json() as { campaign?: CampaignRow; dailyBudgetCappedByPortfolioLimit?: boolean; error?: string };
      if (!response.ok || !payload.campaign) throw new Error(payload.error || "Wijziging kon niet worden opgeslagen.");
      if ("campaignDurationDays" in fields) {
        // Meta may have gotten a smaller daily budget than requested (capped
        // by the portfolio-wide limit) -- re-sync so the field shows what's
        // actually running, not what was typed.
        const updated = rowToCampaign(payload.campaign);
        patchCampaign(campaignId, { campaignDurationDays: updated.campaignDurationDays });
        if (payload.dailyBudgetCappedByPortfolioLimit) {
          toast.warning("Dagbudget deels toegepast", { description: "Het maximale portfolio-dagbudget liet niet de volledige verhoging toe." });
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Wijziging kon niet worden opgeslagen.");
      throw error;
    }
  }

  async function persistSelected(fields: Record<string, unknown>) {
    if (!selected) return;
    await persistCampaign(selected.id, fields).catch(() => {});
  }

  function patchSelected(update: Partial<Campaign>) {
    if (!selected) return;
    patchCampaign(selected.id, update);
  }

  function updateSelected(update: Partial<Campaign>, message: string) {
    patchSelected(update);
    toast.success(message);
    void persistSelected(toApiFields(update));
  }

  function startEditingBudget(campaign: Campaign, event: React.MouseEvent) {
    event.stopPropagation();
    const currentDailyCents = deriveDailyBudgetCents(Math.round(campaign.maxBudget * 100), campaign.campaignDurationDays);
    setBudgetDraft(String(Math.round(currentDailyCents / 100)));
    setEditingBudgetId(campaign.id);
  }

  async function saveInlineBudget(campaign: Campaign) {
    const amount = Number(budgetDraft.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Vul een geldig dagbudget in.");
      return;
    }
    const dailyBudgetCents = Math.round(amount * 100);
    const newDuration = Math.max(1, Math.round((campaign.maxBudget * 100) / dailyBudgetCents));
    setIsSavingBudget(true);
    patchCampaign(campaign.id, { campaignDurationDays: newDuration });
    try {
      await persistCampaign(campaign.id, { campaignDurationDays: newDuration });
      toast.success(metaStatus.mode === "connected" ? "Dagbudget bijgewerkt in Meta" : "Dagbudget bijgewerkt");
      setEditingBudgetId(null);
    } catch {
      // Error already toasted by persistCampaign.
    } finally {
      setIsSavingBudget(false);
    }
  }

  async function deleteSelected() {
    if (!selected) return;
    if (!window.confirm(`"${selected.title}" definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/campaigns/${selected.id}`, { method: "DELETE" });
      const payload = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok || !payload.deleted) throw new Error(payload.error || "Campagne kon niet worden verwijderd.");
      setCampaigns((current) => {
        const remaining = current.filter((campaign) => campaign.id !== selected.id);
        setSelectedId(remaining[0]?.id);
        return remaining;
      });
      toast.success("Campagne verwijderd");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Campagne kon niet worden verwijderd.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function regenerateBackground() {
    if (!selected) return;
    setIsGeneratingBackground(true);
    try {
      const response = await fetch("/api/generate-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: selected.backgroundPrompt || `Realistische recruitmentfoto van een ${selected.title} tijdens het werk. Nederlandse werkomgeving, ruimte voor advertentietekst.`,
          title: selected.title,
          location: selected.location,
        }),
      });
      const payload = await response.json() as { image?: string; error?: string };
      if (!response.ok || !payload.image) throw new Error(payload.error || "Achtergrond genereren is niet gelukt.");
      patchSelected({ backgroundImage: payload.image });
      void persistSelected({ backgroundImageUrl: payload.image });
      toast.success("Nieuwe achtergrond gegenereerd");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Achtergrond genereren is niet gelukt.");
    } finally {
      setIsGeneratingBackground(false);
    }
  }

  async function regenerateCopy() {
    if (!selected) return;
    setIsGeneratingCopy(true);
    try {
      const response = await fetch("/api/analyze-vacancy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selected.title,
          location: selected.location,
          salary: selected.salary,
          description: selected.vacancyDescription || selected.primaryText,
          fee: selected.fee,
        }),
      });
      const payload = await response.json() as {
        analysis?: {
          copy: { primaryText: string; headline: string; description: string };
          usps: [string, string, string];
          creative: { backgroundPrompt: string };
        };
        error?: string;
      };
      if (!response.ok || !payload.analysis) throw new Error(payload.error || "Tekst genereren is niet gelukt.");
      patchSelected({
        primaryText: payload.analysis.copy.primaryText,
        headline: payload.analysis.copy.headline,
        adDescription: payload.analysis.copy.description,
        usps: payload.analysis.usps,
        backgroundPrompt: payload.analysis.creative.backgroundPrompt,
      });
      void persistSelected({
        primaryText: payload.analysis.copy.primaryText,
        headline: payload.analysis.copy.headline,
        description: payload.analysis.copy.description,
        usps: payload.analysis.usps,
      });
      toast.success("Nieuwe tekstvariant gegenereerd");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tekst genereren is niet gelukt.");
    } finally {
      setIsGeneratingCopy(false);
    }
  }

  async function publishCampaign() {
    if (!selected) return;
    setIsPublishing(true);
    try {
      // Meta needs the fully branded creative (logo, title banner, USPs,
      // CTA) in every placement shape -- Feed (1.91:1), square (1:1) and
      // Stories/Reels (9:16) -- never the bare AI background photo stretched
      // across all of them. Bake and upload all 3 once here, right as the
      // campaign goes live.
      const formats: CreativeFormat[] = ["1:1", "1.91:1", "9:16"];
      const images: Partial<Record<CreativeFormat, string>> = {};
      for (const format of formats) {
        const dataUrl = await renderCreative(selected, format);
        const uploadResponse = await fetch("/api/upload-creative", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });
        const uploadPayload = await uploadResponse.json() as { url?: string; error?: string };
        if (!uploadResponse.ok || !uploadPayload.url) throw new Error(uploadPayload.error || `Creative (${format}) kon niet worden geüpload.`);
        images[format] = uploadPayload.url;
      }

      patchSelected({ status: "live", recommendation: "De campagne is live! Ik hou de eerste resultaten voor je in de gaten en laat het weten zodra er iets te melden is." });
      await persistSelected({ status: "live", finalCreativeImagesJson: JSON.stringify(images) });
      toast.success("Campagne is live");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Campagne kon niet live gezet worden.");
    } finally {
      setIsPublishing(false);
    }
  }

  async function exportCreative() {
    if (!selected) return;
    try {
      await downloadCreative(selected, creativeFormat);
      toast.success(`${CREATIVE_DIMENSIONS[creativeFormat].label} gedownload`);
    } catch {
      toast.error("De campagne kon niet worden geëxporteerd.");
    }
  }

  async function replaceLogo(file?: File) {
    if (!file || !selected) return;
    if (!file.type.startsWith("image/") || file.size > 2_000_000) {
      toast.error("Gebruik een afbeelding van maximaal 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const response = await fetch("/api/upload-logo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: String(reader.result) }),
        });
        const payload = await response.json() as { url?: string; error?: string };
        if (!response.ok || !payload.url) throw new Error(payload.error || "Logo uploaden is niet gelukt.");
        patchSelected({ logoImage: payload.url });
        void persistSelected({ logoImageUrl: payload.url });
        toast.success("Logo bijgewerkt");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Logo uploaden is niet gelukt.");
      }
    };
    reader.readAsDataURL(file);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#113047] text-[#91aabb]">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  }

  const budgetUsed = selected?.maxBudget ? Math.min((selected.spend / selected.maxBudget) * 100, 100) : 0;
  const cpl = selected?.leads ? selected.spend / selected.leads : 0;
  const ctr = selected?.impressions ? (selected.clicks / selected.impressions) * 100 : 0;

  return (
    <AppShell
      active="overzicht"
      title="Campagnes"
      subtitle={
        capitalize(headerDateFormat.format(new Date()))
        + (metaStatus.mode === "connected" && metaStatus.lastSuccessAt ? ` · laatste analyse ${formatRelativeTime(metaStatus.lastSuccessAt)}` : "")
      }
      headerActions={<NewCampaignSheet onCreate={addCampaign} />}
    >
          <ImportCampaignSheet candidate={importCandidate} onClose={() => setImportCandidate(null)} onImported={addCampaign} />

          {selected && (
            <LeadFormSheet
              open={isNewLeadFormOpen}
              campaignId={selected.id}
              campaignTitle={selected.title}
              onClose={() => setIsNewLeadFormOpen(false)}
              onCreated={() => void refetchLeadForm(selected.id)}
            />
          )}

          <MarketingSpendCard key={spendVersion} isMetaAutomatic={metaStatus.mode === "connected"} platformTotalSpend={totals.spend} onSpendSaved={() => setSpendVersion((version) => version + 1)} />

          <TodaySpendByCampaignCard key={"breakdown-" + spendVersion} />

          <AdManagerCampaignsCard importedIds={importedMetaCampaignIds} onImport={setImportCandidate} />

          <IndeedSpendCard onSpendSaved={() => setSpendVersion((version) => version + 1)} />

          <PendingActionsCard />

          <PortfolioBudgetCard />

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Actieve campagnes", value: String(campaigns.filter((campaign) => campaign.status === "live").length), sub: campaigns.length + " campagnes totaal", icon: Megaphone, tone: "blue" },
              { label: "Totaal uitgegeven", value: euro.format(totals.spend), sub: "over alle campagnes", icon: CircleDollarSign, tone: "green" },
              { label: "Nieuwe leads", value: String(totals.leads), sub: "over alle campagnes", icon: Users, tone: "amber" },
              { label: "Gem. kosten per lead", value: euro.format(totals.cpl), sub: totals.ctr.toFixed(2).replace(".", ",") + "% klikratio", icon: Target, tone: "purple" },
            ].map((metric) => (
              <article className="metric-card" key={metric.label}>
                <div className="flex items-start justify-between"><div><p className="text-sm font-medium text-[#7f97a8]">{metric.label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-white">{metric.value}</p></div><div className={"metric-icon metric-icon-" + metric.tone}><metric.icon className="size-[18px]" /></div></div>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-[#668194]"><TrendingUp className="size-3.5 text-[#35b7df]" />{metric.sub}</p>
              </article>
            ))}
          </section>

          <section className="panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="eyebrow"><CircleDollarSign className="size-3.5" />Alle campagnes</div>
                <h2 className="mt-2">Uitgaven &amp; winst over alle campagnes</h2>
              </div>
              <ShieldCheck className="size-5 shrink-0 text-[#35b7df]" />
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,.6fr)]">
              <div>
                <div className="flex items-end justify-between">
                  <div>
                    <span className="text-2xl font-semibold text-white">{euro.format(totals.spend)}</span>
                    <span className="ml-1 text-sm text-[#6f8798]">/ {euro.format(totals.maxBudget)} max. budget</span>
                  </div>
                  <span className="text-sm font-bold text-[#73cbe5]">{Math.round(totals.budgetUsed)}%</span>
                </div>
                <Progress value={totals.budgetUsed} className="mt-3 h-2.5 bg-white/8 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-[#006192] [&_[data-slot=progress-indicator]]:to-[#42c3e7]" />
                <p className="mt-3 text-xs leading-5 text-[#607b8d]">Dit is de actuele stand over alle campagnes samen. &quot;Verwachte winst&quot; telt elke campagne mee op basis van de opgegeven fee; &quot;bevestigde winst&quot; telt alleen campagnes die op status &quot;Afgerond&quot; staan (plaatsing bevestigd). Een uitsplitsing per dag/week/maand/jaar komt zodra er live spenddata vanuit Meta binnenkomt.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="budget-stat"><span>Totale fee</span><strong>{euro.format(totals.fee)}</strong></div>
                <div className="budget-stat"><span>Bevestigde plaatsingen</span><strong>{totals.confirmedCount}</strong></div>
                <div className="budget-stat"><span>Verwachte winst (fee − spend)</span><strong style={{ color: totals.profit >= 0 ? "#5cc8e8" : "#d9787d" }}>{euro.format(totals.profit)}</strong></div>
                <div className="budget-stat"><span>Bevestigde winst</span><strong style={{ color: totals.confirmedProfit >= 0 ? "#5cc8e8" : "#d9787d" }}>{euro.format(totals.confirmedProfit)}</strong></div>
              </div>
            </div>
          </section>

          {!selected ? (
            <article className="panel flex flex-col items-center justify-center gap-4 px-6 py-16 text-center text-white">
              <FinderzMark />
              <h2 className="text-lg font-semibold">Nog geen campagnes</h2>
              <p className="max-w-sm text-sm text-[#91aabb]">Maak je eerste campagne aan, of haal vacatures binnen via de <Link href="/pipeline" className="text-[#5bc0df] underline">pipeline</Link>. De cijfers hierboven blijven ondertussen gewoon zichtbaar.</p>
              <NewCampaignSheet onCreate={addCampaign} />
            </article>
          ) : (
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.62fr)_380px]">
            <div className="min-w-0 space-y-6">
              <article className="panel overflow-hidden">
                <div className="panel-header">
                  <div><div className="eyebrow"><Activity className="size-3.5" />Live overzicht</div><h2>Campagnes</h2></div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="format-switch">
                      <button className={tableStatusFilter === "active" ? "active" : ""} onClick={() => setTableStatusFilter("active")}>Actief<span>{tableActiveCount}</span></button>
                      <button className={tableStatusFilter === "all" ? "active" : ""} onClick={() => setTableStatusFilter("all")}>Alle<span>{campaigns.length}</span></button>
                    </div>
                    <div className="relative hidden sm:block"><Search className="absolute left-3 top-2.5 size-4 text-[#607b8d]" /><input className="h-9 w-56 rounded-lg border border-white/10 bg-[#0d2b45] pl-9 pr-3 text-sm text-white outline-none placeholder:text-[#506a7c] focus:border-[#278cb0]" placeholder="Zoek campagne" /></div>
                  </div>
                </div>
                <Table>
                  <TableHeader><TableRow className="border-white/8 hover:bg-transparent">
                    <TableHead className="px-5 table-heading">Vacature</TableHead><TableHead className="table-heading">Status</TableHead><TableHead className="table-heading">Uitgegeven</TableHead><TableHead className="table-heading">Leads</TableHead><TableHead className="table-heading">Kosten/lead</TableHead><TableHead className="pr-5 text-right table-heading">Budget</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{filteredTableCampaigns.length === 0 ? (
                    <TableRow className="border-white/8 hover:bg-transparent"><TableCell colSpan={6} className="px-5 py-10 text-center text-sm text-[#7f97a8]">Geen actieve campagnes.</TableCell></TableRow>
                  ) : filteredTableCampaigns.map((campaign) => {
                    const rowCpl = campaign.leads ? campaign.spend / campaign.leads : 0;
                    const used = campaign.maxBudget ? Math.round((campaign.spend / campaign.maxBudget) * 100) : 0;
                    const canEditBudget = campaign.status === "live" || campaign.status === "attention";
                    return (
                      <TableRow key={campaign.id} className={"cursor-pointer border-white/8 hover:bg-[#14405c] " + (campaign.id === selected.id ? "bg-[#133d58]" : "")} onClick={() => setSelectedId(campaign.id)}>
                        <TableCell className="px-5 py-4"><div className="font-semibold text-white">{campaign.title}</div><div className="mt-1 text-xs text-[#6f8798]">{campaign.location}</div></TableCell>
                        <TableCell><span className={"status status-" + campaign.status}><span />{statusLabel(campaign.status)}</span></TableCell>
                        <TableCell className="font-medium text-[#c4d1d9]">{euro.format(campaign.spend)}</TableCell>
                        <TableCell className="font-medium text-[#c4d1d9]">{campaign.leads}</TableCell>
                        <TableCell className="font-medium text-white">{rowCpl ? euro.format(rowCpl) : "—"}</TableCell>
                        <TableCell className="pr-5">
                          <div className="ml-auto w-28">
                            <div className="mb-1.5 flex justify-between text-[11px] text-[#6f8798]"><span>{used}%</span><span>{euro.format(campaign.maxBudget)}</span></div>
                            <Progress value={Math.min(used, 100)} className="h-1.5 bg-white/8 [&_[data-slot=progress-indicator]]:bg-[#1987ad]" />
                            {canEditBudget && (
                              editingBudgetId === campaign.id ? (
                                <div className="mt-1.5 flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                                  <span className="text-[11px] text-[#6f8798]">€</span>
                                  <input
                                    autoFocus
                                    className="w-14 rounded-md border border-[#2f9fc4] bg-[#0d2d45] px-1.5 py-0.5 text-xs text-white outline-none"
                                    inputMode="numeric"
                                    value={budgetDraft}
                                    onChange={(event) => setBudgetDraft(event.target.value)}
                                    onKeyDown={(event) => event.key === "Enter" && void saveInlineBudget(campaign)}
                                  />
                                  <button className="text-[#5bc0df]" onClick={() => void saveInlineBudget(campaign)} disabled={isSavingBudget}>
                                    {isSavingBudget ? <LoaderCircle className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                                  </button>
                                  <button className="text-[#6f8798]" onClick={() => setEditingBudgetId(null)}>×</button>
                                </div>
                              ) : (
                                <button className="mt-1.5 flex w-full items-center justify-end gap-1 text-[11px] text-[#5bc0df] hover:underline" onClick={(event) => startEditingBudget(campaign, event)}>
                                  <Pencil className="size-3" />Dagbudget {euro.format(deriveDailyBudgetCents(Math.round(campaign.maxBudget * 100), campaign.campaignDurationDays) / 100)}
                                </button>
                              )
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}</TableBody>
                </Table>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div><div className="eyebrow"><Gauge className="size-3.5" />Geselecteerde campagne</div><h2>{selected.title}</h2><p className="mt-1 text-sm text-[#6f8798]">{selected.location}</p></div>
                  <span className={"status status-" + selected.status}><span />{statusLabel(selected.status)}</span>
                </div>
                <Tabs defaultValue="performance" className="gap-0">
                  <div className="section-tabs-wrap">
                    <TabsList variant="line" className="section-tabs scrollbar-none">
                      {[
                        { value: "performance", label: "Prestaties", icon: Activity },
                        { value: "creative", label: "Creative", icon: ImageIcon },
                        { value: "automation", label: "Automatisering", icon: Zap },
                      ].map(({ value, label, icon: Icon }) => (
                        <TabsTrigger key={value} value={value} className="section-tab"><Icon className="size-4" />{label}</TabsTrigger>
                      ))}
                    </TabsList>
                  </div>
                  <TabsContent value="performance" className="p-5">
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,.7fr)]">
                      <div>
                        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                          <div><p className="text-sm text-[#718a9c]">Kosten per lead</p><div className="mt-1 flex items-baseline gap-3"><span className="text-3xl font-semibold text-white">{cpl ? euro.format(cpl) : "—"}</span>{cpl > 0 && <span className="text-sm font-semibold text-[#4fc6e9]">{Math.round((1 - cpl / selected.targetCpl) * 100)}% vs. doel</span>}</div></div>
                          <div className="flex gap-5 text-right"><div><span className="block text-xs text-[#607b8d]">Klikratio</span><strong className="text-sm text-white">{ctr.toFixed(2).replace(".", ",")}%</strong></div><div><span className="block text-xs text-[#607b8d]">Klikken</span><strong className="text-sm text-white">{selected.clicks}</strong></div></div>
                        </div>
                        <TrendChart history={campaignHistory} />
                      </div>
                      <div className="rounded-xl border border-white/8 bg-[#0e324e] p-5">
                        <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-white">Budgetkader</p><p className="mt-1 text-xs text-[#607b8d]">Maximaal 20% van fee</p></div><ShieldCheck className="size-5 text-[#35b7df]" /></div>
                        <div className="mt-6 flex items-end justify-between"><div><span className="text-2xl font-semibold text-white">{euro.format(selected.spend)}</span><span className="ml-1 text-sm text-[#6f8798]">/ {euro.format(selected.maxBudget)}</span></div><span className="text-sm font-bold text-[#73cbe5]">{Math.round(budgetUsed)}%</span></div>
                        <Progress value={budgetUsed} className="mt-3 h-2.5 bg-white/8 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-[#006192] [&_[data-slot=progress-indicator]]:to-[#42c3e7]" />
                        <div className="mt-5 grid grid-cols-2 gap-3"><div className="budget-stat"><span>Fee</span><strong>{euro.format(selected.fee)}</strong></div><div className="budget-stat"><span>Resterend</span><strong>{euro.format(Math.max(selected.maxBudget - selected.spend, 0))}</strong></div></div>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                          <label className="block text-xs text-[#91aabb]">Verwachte looptijd (dagen)
                            <input
                              className="content-input mt-1"
                              inputMode="numeric"
                              value={selected.campaignDurationDays}
                              onChange={(event) => patchSelected({ campaignDurationDays: Math.max(1, Number(event.target.value) || 1) })}
                              onBlur={() => void persistSelected({ campaignDurationDays: selected.campaignDurationDays })}
                            />
                          </label>
                          <label className="block text-xs text-[#91aabb]">Dagbudget
                            <div className="relative mt-1">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#6f8798]">€</span>
                              <input
                                className="content-input"
                                style={{ paddingLeft: "1.75rem" }}
                                inputMode="numeric"
                                value={Math.round(deriveDailyBudgetCents(Math.round(selected.maxBudget * 100), selected.campaignDurationDays) / 100)}
                                onChange={(event) => {
                                  const dailyBudgetCents = Math.max(Number(event.target.value) || 0, 1) * 100;
                                  const newDuration = Math.max(1, Math.round((selected.maxBudget * 100) / dailyBudgetCents));
                                  patchSelected({ campaignDurationDays: newDuration });
                                }}
                                onBlur={() => void persistSelected({ campaignDurationDays: selected.campaignDurationDays })}
                              />
                            </div>
                          </label>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[#607b8d]">Deze twee horen bij elkaar: pas je de looptijd aan, dan verandert het dagbudget mee (en andersom) — het totaal blijft {euro.format(selected.maxBudget)}.</p>
                      </div>
                    </div>
                    <div className="mt-6">
                      <AdBreakdownTable
                        ads={campaignAds}
                        connected={campaignAdsConnected}
                        campaignId={selected.id}
                        onAdStatusChanged={(adId, effectiveStatus) => setCampaignAds((current) => current.map((ad) => (ad.id === adId ? { ...ad, status: effectiveStatus, effectiveStatus } : ad)))}
                      />
                    </div>
                    <div className="mt-6 panel overflow-hidden">
                      <div className="panel-header">
                        <div><p className="text-sm font-semibold text-white">Leadformulier</p><p className="mt-1 text-xs text-[#607b8d]">De vragen die een sollicitant te zien krijgt bij het invullen</p></div>
                        {leadFormConnected && (
                          <button className="secondary-button shrink-0" onClick={() => setIsNewLeadFormOpen(true)}><Plus className="size-4" />Nieuw leadformulier</button>
                        )}
                      </div>
                      {!leadFormConnected ? (
                        <p className="px-5 pb-5 text-sm text-[#7f97a8]">Beschikbaar zodra deze campagne aan Meta gekoppeld is.</p>
                      ) : !leadForm ? (
                        <p className="px-5 pb-5 text-sm text-[#7f97a8]">Nog geen leadformulier gevonden voor deze campagne.</p>
                      ) : (
                        <div className="px-5 pb-5">
                          <LeadFormPreview form={leadForm} />
                          <p className="mx-auto mt-4 max-w-[280px] text-center text-xs leading-5 text-[#607b8d]">Zo ziet een sollicitant dit formulier. Meta laat een eenmaal aangemaakt formulier niet meer bewerken — &quot;Nieuw leadformulier&quot; maakt een nieuw formulier aan, dat je daarna zelf aan een (nieuwe) advertentie koppelt in Meta Ads Manager.</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="creative" className="p-5">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                      <div className="format-switch" aria-label="Advertentieformaat">
                        {(Object.keys(CREATIVE_DIMENSIONS) as CreativeFormat[]).map((format) => (
                          <button key={format} className={creativeFormat === format ? "active" : ""} onClick={() => setCreativeFormat(format)}>
                            {format}<span>{CREATIVE_DIMENSIONS[format].label.split(" ")[0]}</span>
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <label className="secondary-button">
                          <Upload className="size-4" />Logo wijzigen
                          <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => replaceLogo(event.target.files?.[0])} />
                        </label>
                        <button className="primary-button" onClick={exportCreative}><Download className="size-4" />Download PNG</button>
                      </div>
                    </div>
                    <div className="grid gap-6 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
                      <div className="creative-stage">
                        <CreativePreview campaign={selected} format={creativeFormat} />
                        {!selected.backgroundImage && <div className="creative-notice"><ImageIcon className="size-4" />Nog geen AI-achtergrond</div>}
                      </div>
                      <div className="space-y-5">
                        <label><span className="content-label">Primaire tekst</span><textarea className="content-input min-h-28 resize-y" value={selected.primaryText} onChange={(event) => patchSelected({ primaryText: event.target.value })} onBlur={() => void persistSelected({ primaryText: selected.primaryText })} /></label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label><span className="content-label">Kop</span><input className="content-input" value={selected.headline} onChange={(event) => patchSelected({ headline: event.target.value })} onBlur={() => void persistSelected({ headline: selected.headline })} /></label>
                          <label><span className="content-label">Beschrijving</span><input className="content-input" value={selected.adDescription || "Bekijk de vacature"} onChange={(event) => patchSelected({ adDescription: event.target.value })} onBlur={() => void persistSelected({ description: selected.adDescription })} /></label>
                        </div>
                        <div><span className="content-label">USP-blokken</span><div className="grid gap-2">{selected.usps.map((usp, index) => <input key={index} className="content-input" value={usp} onChange={(event) => {
                          const usps = [...selected.usps] as [string, string, string];
                          usps[index] = event.target.value;
                          patchSelected({ usps });
                        }} onBlur={() => void persistSelected({ usps: selected.usps })} />)}</div></div>
                        <label><span className="content-label">OTYS vacature-ID <span className="font-normal text-[#607b8d]">optioneel · voor leadmatching</span></span><input className="content-input" placeholder="Plak hier de vacature-code uit OTYS" value={selected.otysVacancyId ?? ""} onChange={(event) => patchSelected({ otysVacancyId: event.target.value })} onBlur={() => void persistSelected({ otysVacancyId: selected.otysVacancyId ?? "" })} /></label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <button className="secondary-button justify-center disabled:cursor-wait disabled:opacity-60" onClick={regenerateCopy} disabled={isGeneratingCopy}>{isGeneratingCopy ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Nieuwe tekstvariant</button>
                          <button className="secondary-button justify-center disabled:cursor-wait disabled:opacity-60" onClick={regenerateBackground} disabled={isGeneratingBackground}>{isGeneratingBackground ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Nieuwe achtergrond</button>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="automation" className="p-5">
                    <div className="grid gap-3 md:grid-cols-3">
                      {[
                        { icon: Target, title: "Kostenbewaking", text: "Stopt de campagne als een lead te veel gaat kosten." },
                        { icon: ImageIcon, title: "Fris houden", text: "Waarschuwt zodra de doelgroep de campagne te vaak ziet of minder reageert, zodat je een nieuw beeld kunt laten maken." },
                        { icon: TrendingUp, title: "Budget opschalen (met jouw goedkeuring)", text: "Stelt voor het budget te verhogen zodra het goed gaat — jij keurt het goed voordat er meer wordt uitgegeven." },
                      ].map((rule) => <div className="automation-card" key={rule.title}><rule.icon className="size-5 text-[#4fc6e9]" /><h3>{rule.title}</h3><p>{rule.text}</p><span><span />Actief</span></div>)}
                    </div>
                  </TabsContent>
                </Tabs>
              </article>
            </div>

            <aside className="min-w-0 space-y-6">
              <article className="panel p-5">
                <div className="flex items-start justify-between gap-4"><div><div className="eyebrow"><BrainCircuit className="size-3.5" />Automatische analyse</div><h2 className="mt-2">Aanbevolen actie</h2></div><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#0f8db7]/15 text-[#5bc0df]"><Zap className="size-5" /></div></div>
                <div className="mt-5 rounded-xl border border-[#206389] bg-[#13425e] p-4"><p className="text-sm leading-6 text-[#bbced9]">{selected.recommendation}</p></div>
                {(selected.status === "draft" || selected.status === "paused") && (
                  <button className="primary-button mt-4 w-full justify-center disabled:cursor-wait disabled:opacity-60" disabled={isPublishing} onClick={() => {
                    if (selected.status === "paused") updateSelected({ status: "draft", recommendation: "Deze campagne staat weer klaar. Wil je eerst een nieuw beeld of nieuwe tekst, of mag ik 'm meteen weer starten?" }, "Terug naar concept gezet");
                    else void publishCampaign();
                  }}>
                    {isPublishing ? <LoaderCircle className="size-4 animate-spin" /> : selected.status === "paused" ? <RefreshCw className="size-4" /> : <Play className="size-4" />}
                    {isPublishing ? "Campagne wordt klaargezet…" : selected.nextAction}
                  </button>
                )}
                {selected.status !== "paused" && selected.status !== "completed" && <button className="danger-button mt-2 w-full justify-center" onClick={() => updateSelected({ status: "paused", recommendation: "Deze campagne staat stil. Zeg het maar zodra ik 'm weer mag opstarten.", nextAction: "Herstart deze campagne" }, "Campagne gestopt")}><Pause className="size-4" />Stop deze campagne</button>}
                {selected.status !== "completed" && (
                  <button
                    className="secondary-button mt-2 w-full justify-center"
                    onClick={() => updateSelected({ status: "completed", recommendation: "Deze vacature is ingevuld. Mooi resultaat!", nextAction: "Bekijk het resultaat" }, "Gemarkeerd als afgerond")}
                  >
                    <CheckCircle2 className="size-4" />Kandidaat gevonden, markeer als afgerond
                  </button>
                )}
                {selected.status !== "live" && (
                  <button className="danger-button mt-2 w-full justify-center" disabled={isDeleting} onClick={() => void deleteSelected()}>
                    {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}Verwijder deze campagne
                  </button>
                )}
              </article>

              <article className="panel p-5">
                <div className="flex items-center justify-between"><div><div className="eyebrow"><Clock3 className="size-3.5" />24/7 monitoring</div><h2 className="mt-2">Recente acties</h2></div><span className="live-pulse"><span />Live</span></div>
                {recentActions.length === 0 ? (
                  <p className="mt-5 text-sm text-[#7f97a8]">Nog geen automatische acties. Zodra een live campagne wordt geëvalueerd, verschijnen de resultaten hier.</p>
                ) : (
                  <div className="mt-5 space-y-5">{recentActions.map((item) => (
                    <div className="activity-item" key={item.id}>
                      <div className={"activity-dot activity-" + ACTIVITY_TONE[item.severity]} />
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-semibold text-[#d7e2e8]">{ACTIVITY_RULE_LABEL[item.rule] ?? item.rule}</p><span className="shrink-0 text-[11px] text-[#526f82]">{activityDateFormat.format(new Date(item.createdAt))}</span></div>
                        <p className="mt-1 text-xs leading-5 text-[#6f8798]">{item.campaignTitle} · {item.recommendation}</p>
                      </div>
                    </div>
                  ))}</div>
                )}
                <Link href="/automatisering" className="secondary-button mt-5 w-full justify-center"><BarChart3 className="size-4" />Bekijk beslisregels</Link>
              </article>

              <article className="panel overflow-hidden">
                <div className="border-b border-white/8 p-5"><div className="flex items-center justify-between"><div><div className="eyebrow"><MousePointerClick className="size-3.5" />Meta-koppeling</div><h2 className="mt-2">Accountstatus</h2></div>{!metaStatus.configured ? <AlertTriangle className="size-5 text-[#df9826]" /> : metaStatus.healthy ? <CheckCircle2 className="size-5 text-[#4ade80]" /> : <AlertTriangle className="size-5 text-[#e5595e]" />}</div></div>
                <div className="space-y-3 p-5">
                  <div className="connection-row"><span>Advertentieaccount</span><strong className={metaStatus.services.adsManager ? "text-[#7fd99c]" : undefined}>{metaStatus.services.adsManager ? "Gekoppeld" : "Nog koppelen"}</strong></div>
                  <div className="connection-row"><span>Lead Forms</span><strong className={metaStatus.services.leadForms ? "text-[#7fd99c]" : undefined}>{metaStatus.services.leadForms ? "Gekoppeld" : "Nog koppelen"}</strong></div>
                  <div className="connection-row"><span>Automatische acties</span><strong className={metaStatus.mode === "connected" ? "text-[#7fd99c]" : undefined}>{metaStatus.mode === "connected" ? "Live" : "Sandbox"}</strong></div>
                  {metaStatus.mode === "connected" && !metaStatus.healthy && (
                    <div className="connection-row"><span>Verbinding</span><strong className="text-[#f2a1a5]" title={metaStatus.lastErrorMessage ?? undefined}>Faalt herhaaldelijk</strong></div>
                  )}
                </div>
              </article>
            </aside>
          </section>
          )}
    </AppShell>
  );
}
