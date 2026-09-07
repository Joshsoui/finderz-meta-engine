"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight, BarChart3, BrainCircuit,
  CheckCircle2, ChevronRight, CircleDollarSign, Clock3, Download, Gauge, ImageIcon,
  Megaphone, MousePointerClick, Pause, Play,
  RefreshCw, Search, ShieldCheck, Sparkles, Target, Upload,
  TrendingUp, Users, Zap, LoaderCircle,
} from "lucide-react";
import { AppShell, FinderzMark } from "@/components/app-shell";
import { NewCampaignSheet } from "@/components/new-campaign-sheet";
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
  CREATIVE_DIMENSIONS, downloadCreative, type CreativeFormat,
} from "@/lib/creative-renderer";

const activityFeed: Array<{ time: string; tone: string; title: string; detail: string }> = [];

const euro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function CreativePreview({ campaign, format }: { campaign: Campaign; format: CreativeFormat }) {
  const ratio = format === "1:1" ? "1 / 1" : format === "1.91:1" ? "1.91 / 1" : "9 / 16";
  return (
    <div className="creative-shell" style={{ aspectRatio: ratio }}>
      <div
        className={"creative-bg" + (campaign.backgroundImage ? "" : " creative-bg-fallback")}
        style={campaign.backgroundImage ? { backgroundImage: `url(${campaign.backgroundImage})` } : undefined}
      />
      <div className="creative-top-scrim" />
      <div className="creative-content">
        <div className="creative-logo">
          <div className="creative-logo-badge">
            {campaign.logoImage ? <img src={campaign.logoImage} alt="Finderz Keeperz" /> : <FinderzMark />}
          </div>
        </div>
        <h3 className="creative-headline">{campaign.headline}</h3>
        <div className="creative-bottom">
          <div className="creative-title-banner">
            <div className="creative-title-banner-job">{campaign.title}</div>
            <div className="creative-title-banner-location">{campaign.location}</div>
          </div>
          <div className="creative-usp-panel">
            {campaign.usps.map((usp) => (
              <div className="creative-usp-row" key={usp}>
                <span className="creative-usp-icon"><ChevronRight className="size-3" /></span>
                <span>{usp}</span>
              </div>
            ))}
          </div>
          <div className="creative-cta-pill">SOLLICITEER NU</div>
        </div>
      </div>
    </div>
  );
}

function TrendChart() {
  const points = "2,89 48,75 94,78 140,57 186,61 232,38 278,45 324,28 370,33 416,18 462,23 508,12";
  return (
    <div className="trend-chart" aria-label="Kosten per lead over twaalf dagen">
      <div className="trend-grid" />
      <svg viewBox="0 0 510 110" role="img" aria-hidden="true">
        <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1aa6d1" stopOpacity="0.3" /><stop offset="100%" stopColor="#1aa6d1" stopOpacity="0" /></linearGradient></defs>
        <path d={"M " + points.replaceAll(" ", " L ") + " L 508,110 L 2,110 Z"} fill="url(#area)" />
        <polyline points={points} fill="none" stroke="#35b7df" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="508" cy="12" r="5" fill="#0e324e" stroke="#72d1ec" strokeWidth="3" />
      </svg>
      <div className="mt-2 flex justify-between text-xs text-[#6f8798]"><span>25 aug</span><span>28 aug</span><span>31 aug</span><span>3 sep</span><span>5 sep</span></div>
    </div>
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
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [creativeFormat, setCreativeFormat] = useState<CreativeFormat>("1:1");
  const [isGeneratingBackground, setIsGeneratingBackground] = useState(false);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
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

  async function exportCreative() {
    if (!selected) return;
    try {
      await downloadCreative(selected, creativeFormat);
      toast.success(`${CREATIVE_DIMENSIONS[creativeFormat].label} gedownload`);
    } catch {
      toast.error("De advertentie kon niet worden geëxporteerd.");
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
      <AppShell active="overzicht" title="Meta Campaign Control" headerActions={<NewCampaignSheet onCreate={addCampaign} />}>
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
      title="Meta Campaign Control"
      subtitle="Vrijdag 5 september · laatste analyse 2 min geleden"
      headerActions={<NewCampaignSheet onCreate={addCampaign} />}
    >
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Actieve campagnes", value: String(campaigns.filter((campaign) => campaign.status === "live").length), sub: campaigns.length + " campagnes totaal", icon: Megaphone },
              { label: "Totale spend", value: euro.format(totals.spend), sub: "over alle campagnes", icon: CircleDollarSign },
              { label: "Nieuwe leads", value: String(totals.leads), sub: "over alle campagnes", icon: Users },
              { label: "Gemiddelde CPL", value: euro.format(totals.cpl), sub: totals.ctr.toFixed(2).replace(".", ",") + "% gem. CTR", icon: Target },
            ].map((metric) => (
              <article className="metric-card" key={metric.label}>
                <div className="flex items-start justify-between"><div><p className="text-sm font-medium text-[#7f97a8]">{metric.label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-white">{metric.value}</p></div><div className="metric-icon"><metric.icon className="size-[18px]" /></div></div>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-[#668194]"><TrendingUp className="size-3.5 text-[#35b7df]" />{metric.sub}</p>
              </article>
            ))}
          </section>

          <section className="panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="eyebrow"><CircleDollarSign className="size-3.5" />Portfolio</div>
                <h2 className="mt-2">Spend &amp; winst over alle campagnes</h2>
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
                    <TableHead className="px-5 table-heading">Vacature</TableHead><TableHead className="table-heading">Status</TableHead><TableHead className="table-heading">Spend</TableHead><TableHead className="table-heading">Leads</TableHead><TableHead className="table-heading">CPL</TableHead><TableHead className="pr-5 text-right table-heading">Budget</TableHead>
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
                  <TabsList variant="line" className="scrollbar-none w-full justify-start gap-6 overflow-x-auto border-b border-white/8 px-5">
                    {["performance", "creative", "automation"].map((value, index) => <TabsTrigger key={value} value={value} className="h-11 flex-none px-0 text-[#7891a2] data-[state=active]:text-white after:bg-[#35b7df]">{["Prestaties", "Creative", "Automatisering"][index]}</TabsTrigger>)}
                  </TabsList>
                  <TabsContent value="performance" className="p-5">
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,.7fr)]">
                      <div>
                        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                          <div><p className="text-sm text-[#718a9c]">Kosten per lead</p><div className="mt-1 flex items-baseline gap-3"><span className="text-3xl font-semibold text-white">{cpl ? euro.format(cpl) : "—"}</span>{cpl > 0 && <span className="text-sm font-semibold text-[#4fc6e9]">{Math.round((1 - cpl / selected.targetCpl) * 100)}% vs. doel</span>}</div></div>
                          <div className="flex gap-5 text-right"><div><span className="block text-xs text-[#607b8d]">CTR</span><strong className="text-sm text-white">{ctr.toFixed(2).replace(".", ",")}%</strong></div><div><span className="block text-xs text-[#607b8d]">Klikken</span><strong className="text-sm text-white">{selected.clicks}</strong></div></div>
                        </div>
                        <TrendChart />
                      </div>
                      <div className="rounded-xl border border-white/8 bg-[#0e324e] p-5">
                        <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-white">Budgetkader</p><p className="mt-1 text-xs text-[#607b8d]">Maximaal 20% van fee</p></div><ShieldCheck className="size-5 text-[#35b7df]" /></div>
                        <div className="mt-6 flex items-end justify-between"><div><span className="text-2xl font-semibold text-white">{euro.format(selected.spend)}</span><span className="ml-1 text-sm text-[#6f8798]">/ {euro.format(selected.maxBudget)}</span></div><span className="text-sm font-bold text-[#73cbe5]">{Math.round(budgetUsed)}%</span></div>
                        <Progress value={budgetUsed} className="mt-3 h-2.5 bg-white/8 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-[#006192] [&_[data-slot=progress-indicator]]:to-[#42c3e7]" />
                        <div className="mt-5 grid grid-cols-2 gap-3"><div className="budget-stat"><span>Fee</span><strong>{euro.format(selected.fee)}</strong></div><div className="budget-stat"><span>Resterend</span><strong>{euro.format(Math.max(selected.maxBudget - selected.spend, 0))}</strong></div></div>
                      </div>
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
                        { icon: Target, title: "CPL-bewaking", text: "Pauzeert wanneer CPL langer dan 24 uur boven 1,5× het doel ligt." },
                        { icon: ImageIcon, title: "Creative refresh", text: "Maakt een nieuwe variant bij frequentie boven 2,8 of dalende CTR." },
                        { icon: TrendingUp, title: "Gecontroleerd schalen", text: "Verhoogt budget met maximaal 15% bij drie of meer kwalitatieve leads." },
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
                {selected.status !== "completed" && (
                  <button className="primary-button mt-4 w-full justify-center" onClick={() => {
                    if (selected.status === "paused") updateSelected({ status: "draft", recommendation: "Campagne staat klaar voor een nieuwe creative en teksthoek." }, "Campagne teruggezet naar concept");
                    else if (selected.status === "draft") updateSelected({ status: "live", recommendation: "Campagne is gestart. De eerste evaluatie volgt na voldoende bereik." }, "Campagne gestart in sandbox");
                    else updateSelected({ maxBudget: Math.round(selected.maxBudget * 1.15) }, "Aanbevolen optimalisatie toegepast");
                  }}>
                    {selected.status === "paused" ? <RefreshCw className="size-4" /> : selected.status === "draft" ? <Play className="size-4" /> : <ArrowUpRight className="size-4" />}{selected.nextAction}
                  </button>
                )}
                {selected.status !== "paused" && selected.status !== "completed" && <button className="danger-button mt-2 w-full justify-center" onClick={() => updateSelected({ status: "paused", nextAction: "Herbouw campagne" }, "Campagne gepauzeerd")}><Pause className="size-4" />Campagne pauzeren</button>}
                {selected.status !== "completed" && (
                  <button
                    className="secondary-button mt-2 w-full justify-center"
                    onClick={() => updateSelected({ status: "completed", recommendation: "Plaatsing bevestigd. Deze campagne telt mee in de bevestigde winst.", nextAction: "Bekijk resultaten" }, "Campagne gemarkeerd als afgerond")}
                  >
                    <CheckCircle2 className="size-4" />Markeer als afgerond (plaatsing bevestigd)
                  </button>
                )}
              </article>

              <article className="panel p-5">
                <div className="flex items-center justify-between"><div><div className="eyebrow"><Clock3 className="size-3.5" />24/7 monitoring</div><h2 className="mt-2">Recente acties</h2></div><span className="live-pulse"><span />Live</span></div>
                <div className="mt-5 space-y-5">{activityFeed.map((item) => <div className="activity-item" key={item.title}><div className={"activity-dot activity-" + item.tone} /><div className="min-w-0"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-semibold text-[#d7e2e8]">{item.title}</p><span className="shrink-0 text-[11px] text-[#526f82]">{item.time}</span></div><p className="mt-1 text-xs leading-5 text-[#6f8798]">{item.detail}</p></div></div>)}</div>
                <button className="secondary-button mt-5 w-full justify-center" onClick={() => toast.info("Alle beslisregels zijn actief in de sandbox.")}><BarChart3 className="size-4" />Bekijk beslisregels</button>
              </article>

              <article className="panel overflow-hidden">
                <div className="border-b border-white/8 p-5"><div className="flex items-center justify-between"><div><div className="eyebrow"><MousePointerClick className="size-3.5" />Meta-koppeling</div><h2 className="mt-2">Accountstatus</h2></div><AlertTriangle className="size-5 text-[#df9826]" /></div></div>
                <div className="space-y-3 p-5"><div className="connection-row"><span>Advertentieaccount</span><strong>Nog koppelen</strong></div><div className="connection-row"><span>Lead Forms</span><strong>Nog koppelen</strong></div><div className="connection-row"><span>Automatische acties</span><strong>Sandbox</strong></div></div>
              </article>
            </aside>
          </section>
    </AppShell>
  );
}
