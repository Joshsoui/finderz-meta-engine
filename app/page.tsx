"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, BarChart3, BrainCircuit,
  CheckCircle2, CircleDollarSign, Clock3, Download, Gauge, ImageIcon,
  Megaphone, MousePointerClick, Pause, Pencil, Play,
  RefreshCw, Search, ShieldCheck, Sparkles, Target, Upload,
  TrendingUp, Users, Zap, LoaderCircle,
} from "lucide-react";
import { AppShell, FinderzMark } from "@/components/app-shell";
import { CreativePreview } from "@/components/creative-preview";
import { NewCampaignSheet } from "@/components/new-campaign-sheet";
import { deriveDailyBudgetCents } from "@/lib/campaign-engine";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
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

type HistoryPoint = { recordedAt: string; cpl: number | null };

type PlacementBreakdown = { platform: string; position: string; spend: number; impressions: number; clicks: number; leads: number };

// Meta's own labels for publisher_platform / platform_position; not every
// value is documented, so anything not listed here just shows the raw value
// from Meta rather than guessing at a translation.
const PLATFORM_LABEL: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", audience_network: "Audience Network", messenger: "Messenger" };
const POSITION_LABEL: Record<string, string> = {
  feed: "Feed", story: "Stories", reels: "Reels", facebook_reels: "Reels",
  video_feeds: "Video feed", marketplace: "Marketplace", right_hand_column: "Zijbalk",
  search: "Zoeken", instream_banner: "In-stream", stream: "Feed", explore: "Verkennen", explore_home: "Verkennen",
};

function PlacementTable({ placements, connected }: { placements: PlacementBreakdown[]; connected: boolean }) {
  if (!connected) {
    return (
      <div className="panel">
        <div className="panel-header"><p className="text-sm font-semibold text-white">Resultaat per plaatsing</p></div>
        <p className="px-5 pb-5 text-sm text-[#7f97a8]">Beschikbaar zodra deze campagne aan Meta gekoppeld is — dan zie ik hier of Feed, Stories of Reels de beste leads oplevert.</p>
      </div>
    );
  }
  const sorted = placements.slice().sort((a, b) => b.spend - a.spend);
  return (
    <div className="panel">
      <div className="panel-header"><p className="text-sm font-semibold text-white">Resultaat per plaatsing</p><p className="mt-1 text-xs text-[#607b8d]">Waar de leads vandaan komen — zo weet ik waar ik het budget op moet richten</p></div>
      {sorted.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-[#7f97a8]">Nog geen data per plaatsing — komt zodra deze campagne wat langer draait.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>Plaatsing</TableHead><TableHead>Uitgegeven</TableHead><TableHead>Leads</TableHead><TableHead>Kosten/lead</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row, index) => (
              <TableRow key={`${row.platform}-${row.position}-${index}`}>
                <TableCell>{PLATFORM_LABEL[row.platform] ?? row.platform} · {POSITION_LABEL[row.position] ?? row.position}</TableCell>
                <TableCell>{euro.format(row.spend)}</TableCell>
                <TableCell>{row.leads}</TableCell>
                <TableCell>{row.leads > 0 ? euro.format(row.spend / row.leads) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
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

type DailySpendEntry = { date: string; amountCents: number };

function formatDayLabel(date: string, today: string) {
  if (date === today) return "Vandaag";
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" }).format(new Date(year, month - 1, day));
}

function DailySpendCard({ isAutomatic, totalSpend }: { isAutomatic: boolean; totalSpend: number }) {
  const [today, setToday] = useState("");
  const [entries, setEntries] = useState<DailySpendEntry[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/daily-spend");
        const payload = await response.json() as { today?: string; entries?: DailySpendEntry[]; error?: string };
        if (!response.ok || !payload.today) throw new Error(payload.error || "Dagtotaal kon niet worden geladen.");
        if (cancelled) return;
        setToday(payload.today);
        setEntries(payload.entries ?? []);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Dagtotaal kon niet worden geladen.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const todayEntry = entries.find((entry) => entry.date === today);
  const weekTotal = entries.slice(0, 7).reduce((sum, entry) => sum + entry.amountCents, 0) / 100;

  function startEditing() {
    setDraft(todayEntry ? String(todayEntry.amountCents / 100).replace(".", ",") : "");
    setIsEditing(true);
  }

  async function saveToday() {
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
      const payload = await response.json() as { entry?: DailySpendEntry; error?: string };
      if (!response.ok || !payload.entry) throw new Error(payload.error || "Dagtotaal kon niet worden opgeslagen.");
      const saved = payload.entry;
      setEntries((current) => [saved, ...current.filter((entry) => entry.date !== saved.date)].sort((a, b) => b.date.localeCompare(a.date)));
      setIsEditing(false);
      toast.success("Dagtotaal bijgewerkt");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dagtotaal kon niet worden opgeslagen.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="daily-spend-card">
      <div className="daily-spend-main">
        <div className="eyebrow"><CircleDollarSign className="size-3.5" />Vandaag besteed · campagnes via dit platform</div>
        {isEditing ? (
          <div className="daily-spend-edit">
            <span className="daily-spend-prefix">€</span>
            <input
              autoFocus
              className="daily-spend-input"
              inputMode="decimal"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void saveToday()}
              placeholder="0"
            />
            <button className="primary-button" onClick={saveToday} disabled={isSaving}>{isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Opslaan</button>
            <button className="secondary-button" onClick={() => setIsEditing(false)}>Annuleren</button>
          </div>
        ) : (
          <div className="daily-spend-display">
            <span className="daily-spend-amount">{isLoading ? "…" : euro.format((todayEntry?.amountCents ?? 0) / 100)}</span>
            {isAutomatic ? (
              <span className="live-pulse"><span />Automatisch via Meta</span>
            ) : (
              <button className="secondary-button" onClick={startEditing}><Pencil className="size-4" />{todayEntry ? "Bewerken" : "Invullen"}</button>
            )}
          </div>
        )}
        <p className="daily-spend-hint">
          {isAutomatic
            ? "Wordt elke 15 minuten automatisch bijgewerkt met de echte spend uit Meta -- geen handmatige invoer meer nodig."
            : "Vul hier dagelijks het totaal in dat je in Meta Ads Manager ziet — dan hoeft dit niet meer los in een sheet."}
        </p>
      </div>
      <div className="daily-spend-week">
        <span className="daily-spend-week-label">Laatste 7 dagen</span>
        <strong className="daily-spend-week-total">{euro.format(weekTotal)}</strong>
        <div className="daily-spend-days">
          {entries.slice(0, 7).map((entry) => (
            <div className="daily-spend-day" key={entry.date}>
              <span>{formatDayLabel(entry.date, today)}</span>
              <strong>{euro.format(entry.amountCents / 100)}</strong>
            </div>
          ))}
          {!isLoading && entries.length === 0 && <p className="daily-spend-empty">Nog geen dagen ingevuld.</p>}
        </div>
      </div>
      <div className="daily-spend-week">
        <span className="daily-spend-week-label">Totaal · campagnes via dit platform</span>
        <strong className="daily-spend-week-total">{euro.format(totalSpend)}</strong>
      </div>
    </section>
  );
}

type AccountSpendSummary = { connected: boolean; today?: number; last7d?: number; lifetime?: number; updatedAt?: string | null };

function AccountSpendCard() {
  const [summary, setSummary] = useState<AccountSpendSummary>({ connected: false });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/meta/account-spend");
        const payload = await response.json() as AccountSpendSummary & { error?: string };
        if (response.ok && !cancelled) setSummary(payload);
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

  return (
    <section className="daily-spend-card">
      <div className="daily-spend-main">
        <div className="eyebrow"><Gauge className="size-3.5" />Heel het Meta-advertentieaccount</div>
        {!summary.connected ? (
          <>
            <div className="daily-spend-display"><span className="daily-spend-amount">—</span></div>
            <p className="daily-spend-hint">Beschikbaar zodra Meta gekoppeld is. Dit laat straks het complete accountbeeld zien, óók campagnes die niet via dit platform zijn gemaakt.</p>
          </>
        ) : (
          <>
            <div className="daily-spend-display">
              <span className="daily-spend-amount">{isLoading ? "…" : euro.format(summary.today ?? 0)}</span>
              <span className="live-pulse"><span />Hele account</span>
            </div>
            <p className="daily-spend-hint">Vandaag besteed op het volledige advertentieaccount — inclusief campagnes die niet via dit platform lopen.</p>
          </>
        )}
      </div>
      <div className="daily-spend-week">
        <span className="daily-spend-week-label">Laatste 7 dagen</span>
        <strong className="daily-spend-week-total">{summary.connected ? euro.format(summary.last7d ?? 0) : "—"}</strong>
      </div>
      <div className="daily-spend-week">
        <span className="daily-spend-week-label">Totaal (levensduur account)</span>
        <strong className="daily-spend-week-total">{summary.connected ? euro.format(summary.lifetime ?? 0) : "—"}</strong>
      </div>
    </section>
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

function PortfolioBudgetCard() {
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
  const [isLoading, setIsLoading] = useState(true);
  const [creativeFormat, setCreativeFormat] = useState<CreativeFormat>("1:1");
  const [isGeneratingBackground, setIsGeneratingBackground] = useState(false);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [recentActions, setRecentActions] = useState<OptimizationAction[]>([]);
  const [campaignHistory, setCampaignHistory] = useState<HistoryPoint[]>([]);
  const [placements, setPlacements] = useState<PlacementBreakdown[]>([]);
  const [placementsConnected, setPlacementsConnected] = useState(false);
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
          setPlacements([]);
          setPlacementsConnected(false);
        }
        return;
      }
      try {
        const response = await fetch(`/api/campaigns/${selected.id}/placements`);
        const payload = await response.json() as { placements?: PlacementBreakdown[]; connected?: boolean; error?: string };
        if (response.ok && !cancelled) {
          setPlacements(payload.placements ?? []);
          setPlacementsConnected(Boolean(payload.connected));
        }
      } catch {
        // The performance tab still works without a placement breakdown; fail quietly.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  function addCampaign(campaign: Campaign) {
    setCampaigns((current) => [campaign, ...current]);
    setSelectedId(campaign.id);
  }

  async function persistSelected(fields: Record<string, unknown>) {
    if (!selected || Object.keys(fields).length === 0) return;
    try {
      const response = await fetch(`/api/campaigns/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const payload = await response.json() as { campaign?: CampaignRow; error?: string };
      if (!response.ok || !payload.campaign) throw new Error(payload.error || "Wijziging kon niet worden opgeslagen.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Wijziging kon niet worden opgeslagen.");
    }
  }

  function patchSelected(update: Partial<Campaign>) {
    if (!selected) return;
    setCampaigns((current) => current.map((campaign) => campaign.id === selected.id ? { ...campaign, ...update } : campaign));
  }

  function updateSelected(update: Partial<Campaign>, message: string) {
    patchSelected(update);
    toast.success(message);
    void persistSelected(toApiFields(update));
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

  if (!selected) {
    return (
      <AppShell active="overzicht" title="Campagnes" headerActions={<NewCampaignSheet onCreate={addCampaign} />}>
        <div className="flex flex-col items-center justify-center gap-5 px-6 py-24 text-center text-white">
          <FinderzMark />
          <h1 className="text-xl font-semibold">Nog geen campagnes</h1>
          <p className="max-w-sm text-sm text-[#91aabb]">Maak je eerste campagne aan, of haal vacatures binnen via de <Link href="/pipeline" className="text-[#5bc0df] underline">pipeline</Link>.</p>
          <NewCampaignSheet onCreate={addCampaign} />
        </div>
      </AppShell>
    );
  }

  const budgetUsed = selected.maxBudget ? Math.min((selected.spend / selected.maxBudget) * 100, 100) : 0;
  const cpl = selected.leads ? selected.spend / selected.leads : 0;
  const ctr = selected.impressions ? (selected.clicks / selected.impressions) * 100 : 0;

  return (
    <AppShell
      active="overzicht"
      title="Campagnes"
      subtitle="Vrijdag 5 september · laatste analyse 2 min geleden"
      headerActions={<NewCampaignSheet onCreate={addCampaign} />}
    >
          <DailySpendCard isAutomatic={metaStatus.mode === "connected"} totalSpend={totals.spend} />

          <AccountSpendCard />

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

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.62fr)_380px]">
            <div className="space-y-6">
              <article className="panel overflow-hidden">
                <div className="panel-header">
                  <div><div className="eyebrow"><Activity className="size-3.5" />Live overzicht</div><h2>Campagnes</h2></div>
                  <div className="relative hidden sm:block"><Search className="absolute left-3 top-2.5 size-4 text-[#607b8d]" /><input className="h-9 w-56 rounded-lg border border-white/10 bg-[#0d2b45] pl-9 pr-3 text-sm text-white outline-none placeholder:text-[#506a7c] focus:border-[#278cb0]" placeholder="Zoek campagne" /></div>
                </div>
                <Table>
                  <TableHeader><TableRow className="border-white/8 hover:bg-transparent">
                    <TableHead className="px-5 table-heading">Vacature</TableHead><TableHead className="table-heading">Status</TableHead><TableHead className="table-heading">Uitgegeven</TableHead><TableHead className="table-heading">Leads</TableHead><TableHead className="table-heading">Kosten/lead</TableHead><TableHead className="pr-5 text-right table-heading">Budget</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{campaigns.map((campaign) => {
                    const rowCpl = campaign.leads ? campaign.spend / campaign.leads : 0;
                    const used = campaign.maxBudget ? Math.round((campaign.spend / campaign.maxBudget) * 100) : 0;
                    return (
                      <TableRow key={campaign.id} className={"cursor-pointer border-white/8 hover:bg-[#14405c] " + (campaign.id === selected.id ? "bg-[#133d58]" : "")} onClick={() => setSelectedId(campaign.id)}>
                        <TableCell className="px-5 py-4"><div className="font-semibold text-white">{campaign.title}</div><div className="mt-1 text-xs text-[#6f8798]">{campaign.location}</div></TableCell>
                        <TableCell><span className={"status status-" + campaign.status}><span />{statusLabel(campaign.status)}</span></TableCell>
                        <TableCell className="font-medium text-[#c4d1d9]">{euro.format(campaign.spend)}</TableCell>
                        <TableCell className="font-medium text-[#c4d1d9]">{campaign.leads}</TableCell>
                        <TableCell className="font-medium text-white">{rowCpl ? euro.format(rowCpl) : "—"}</TableCell>
                        <TableCell className="pr-5"><div className="ml-auto w-24"><div className="mb-1.5 flex justify-between text-[11px] text-[#6f8798]"><span>{used}%</span><span>{euro.format(campaign.maxBudget)}</span></div><Progress value={Math.min(used, 100)} className="h-1.5 bg-white/8 [&_[data-slot=progress-indicator]]:bg-[#1987ad]" /></div></TableCell>
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
                        <label className="mt-5 block text-xs text-[#91aabb]">Verwachte looptijd (dagen)
                          <input
                            className="content-input mt-1"
                            inputMode="numeric"
                            value={selected.campaignDurationDays}
                            onChange={(event) => patchSelected({ campaignDurationDays: Math.max(1, Number(event.target.value) || 1) })}
                            onBlur={() => void persistSelected({ campaignDurationDays: selected.campaignDurationDays })}
                          />
                        </label>
                        <p className="mt-2 text-xs leading-5 text-[#607b8d]">Meta krijgt hiervan een dagbudget van circa {euro.format(deriveDailyBudgetCents(Math.round(selected.maxBudget * 100), selected.campaignDurationDays) / 100)}. Een campagne die je bewust langer laat draaien, moet hier een hoger aantal dagen hebben staan.</p>
                      </div>
                    </div>
                    <div className="mt-6">
                      <PlacementTable placements={placements} connected={placementsConnected} />
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

            <aside className="space-y-6">
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
    </AppShell>
  );
}
