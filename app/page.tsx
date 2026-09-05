"use client";

import { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight, BarChart3, BrainCircuit, Check,
  ChevronRight, CircleDollarSign, Clock3, Euro, Gauge, ImageIcon,
  LayoutDashboard, Megaphone, MousePointerClick, Pause, Play, Plus,
  RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Target,
  TrendingUp, Users, WandSparkles, Zap,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Toaster, toast } from "sonner";

type CampaignStatus = "live" | "attention" | "paused" | "draft";

type Campaign = {
  id: string;
  title: string;
  location: string;
  salary: string;
  status: CampaignStatus;
  fee: number;
  maxBudget: number;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  targetCpl: number;
  usps: [string, string, string];
  primaryText: string;
  headline: string;
  recommendation: string;
  nextAction: string;
};

const initialCampaigns: Campaign[] = [
  {
    id: "fk-1048",
    title: "Elektromonteur Infra",
    location: "IJmuiden",
    salary: "€ 3.500 – € 4.500",
    status: "live",
    fee: 8000,
    maxBudget: 1600,
    spend: 1048,
    impressions: 42860,
    clicks: 914,
    leads: 31,
    targetCpl: 50,
    usps: ["Tot € 4.500 bruto p/m", "25 vakantiedagen + 13 ADV", "Elektrische bus van de zaak"],
    primaryText: "Werk aan bruggen, sluizen en gemalen rond het Noordzeekanaal. Verdien tot € 4.500 bruto per maand en krijg direct een elektrische servicebus.",
    headline: "Elektromonteur Infra | IJmuiden",
    recommendation: "De campagne ligt 32% onder de doel-CPL. Schaal gecontroleerd met 15% zolang de frequentie onder 2,8 blijft.",
    nextAction: "Budget +15%",
  },
  {
    id: "fk-1052",
    title: "Productiemedewerker Dagdienst",
    location: "Alkmaar",
    salary: "Tot € 3.000",
    status: "attention",
    fee: 5500,
    maxBudget: 1100,
    spend: 712,
    impressions: 31920,
    clicks: 456,
    leads: 12,
    targetCpl: 45,
    usps: ["Salaris tot € 3.000", "Werken in dagdienst", "Uitzicht op vast contract"],
    primaryText: "Zoek je productiewerk in Alkmaar zonder ploegendienst? Start in een nuchter team en bouw aan een vaste toekomst.",
    headline: "Productiemedewerker Dagdienst",
    recommendation: "De CTR daalt en de frequentie loopt op. Zet een nieuwe achtergrondvariant naast de huidige winnaar.",
    nextAction: "Nieuwe creative",
  },
  {
    id: "fk-1055",
    title: "Customer Service Medewerker Logistiek",
    location: "Amsterdam Westpoort",
    salary: "Tot € 3.600",
    status: "paused",
    fee: 6500,
    maxBudget: 1300,
    spend: 424,
    impressions: 18740,
    clicks: 188,
    leads: 4,
    targetCpl: 55,
    usps: ["Tot € 3.600 bruto p/m", "Internationale logistiek", "Doorgroeimogelijkheden"],
    primaryText: "Combineer klantcontact met internationale logistiek in Amsterdam Westpoort. Een veelzijdige rol met ruimte om door te groeien.",
    headline: "Customer Service in de logistiek",
    recommendation: "De kosten per lead liggen bijna twee keer boven de doelstelling. Campagne gepauzeerd voor een nieuwe invalshoek.",
    nextAction: "Herbouw campagne",
  },
];

const activityFeed = [
  { time: "08:42", tone: "blue", title: "Budget gecontroleerd opgeschaald", detail: "Elektromonteur Infra · +15% dagbudget" },
  { time: "07:15", tone: "amber", title: "Creative fatigue gedetecteerd", detail: "Productiemedewerker · frequentie 2,74" },
  { time: "Gisteren", tone: "red", title: "Campagne automatisch gepauzeerd", detail: "Customer Service · CPL boven grens" },
];

const euro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function statusLabel(status: CampaignStatus) {
  if (status === "live") return "Presteert";
  if (status === "attention") return "Actie nodig";
  if (status === "paused") return "Gepauzeerd";
  return "Concept";
}

function FinderzMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="finderz-symbol" aria-hidden="true"><span>F</span></div>
      {!compact && (
        <div className="leading-none">
          <div className="text-[15px] font-black tracking-[0.18em] text-white">FINDERZ</div>
          <div className="mt-1 text-[11px] font-bold tracking-[0.28em] text-[#6fb3c0]">KEEPERZ</div>
        </div>
      )}
    </div>
  );
}

function NewCampaignSheet({ onCreate }: { onCreate: (campaign: Campaign) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Technisch Medewerker Buitendienst");
  const [location, setLocation] = useState("Noord-Holland");
  const [salary, setSalary] = useState("€ 3.200 – € 4.000");
  const [fee, setFee] = useState("7000");
  const [description, setDescription] = useState(
    "Werk zelfstandig op locatie, los technische storingen op en onderhoud installaties. Mbo 2 elektrotechniek, rijbewijs B en klantgerichte instelling."
  );

  function createCampaign() {
    const numericFee = Math.max(Number(fee) || 0, 0);
    if (!title.trim() || !location.trim() || numericFee <= 0) {
      toast.error("Vul minimaal de functie, locatie en fee in.");
      return;
    }
    const maxBudget = numericFee * 0.2;
    onCreate({
      id: "fk-" + String(Date.now()).slice(-5),
      title: title.trim(),
      location: location.trim(),
      salary: salary.trim() || "Salaris in overleg",
      status: "draft",
      fee: numericFee,
      maxBudget,
      spend: 0,
      impressions: 0,
      clicks: 0,
      leads: 0,
      targetCpl: Math.max(Math.round(maxBudget / 28), 25),
      usps: [salary.trim() || "Goed salaris", "Uitzicht op vast contract", "Persoonlijke begeleiding"],
      primaryText: "Toe aan een nieuwe stap als " + title.trim() + " in " + location.trim() + "? Bekijk wat deze functie jou biedt en laat eenvoudig je gegevens achter.",
      headline: title.trim() + " | " + location.trim(),
      recommendation: "Vacature geanalyseerd. Controleer de gegenereerde creative en teksten voordat de campagne naar Meta wordt gestuurd.",
      nextAction: "Controleer & publiceer",
    });
    setOpen(false);
    toast.success("Campagneconcept gegenereerd", {
      description: "Tekst, USP's, creative-opbouw en budgetkader staan klaar.",
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="primary-button"><Plus className="size-4" />Nieuwe campagne</button>
      </SheetTrigger>
      <SheetContent className="w-full border-[#18384c] bg-[#071927] p-0 text-white sm:max-w-xl">
        <SheetHeader className="border-b border-white/10 px-6 py-6">
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-[#0f8db7]/15 text-[#5bc0df]">
            <WandSparkles className="size-5" />
          </div>
          <SheetTitle className="text-xl text-white">Campagne genereren</SheetTitle>
          <SheetDescription className="text-[#91aabb]">
            De vacature wordt vertaald naar doelgroep, teksten, creative en een budgetplafond van 20% van de fee.
          </SheetDescription>
        </SheetHeader>
        <div className="scrollbar-gutter-stable scrollbar-thin flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <label className="field-label">Functietitel
            <input className="field-input" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field-label">Locatie
              <input className="field-input" value={location} onChange={(event) => setLocation(event.target.value)} />
            </label>
            <label className="field-label">Salaris
              <input className="field-input" value={salary} onChange={(event) => setSalary(event.target.value)} />
            </label>
          </div>
          <label className="field-label">Verwachte plaatsingsfee
            <div className="relative">
              <Euro className="absolute left-3 top-3.5 size-4 text-[#6f8798]" />
              <input className="field-input pl-9" inputMode="numeric" value={fee} onChange={(event) => setFee(event.target.value)} />
            </div>
          </label>
          <div className="budget-preview">
            <div><span>Maximaal advertentiebudget</span><strong>{euro.format((Number(fee) || 0) * 0.2)}</strong></div>
            <span className="rule-pill">20% van fee</span>
          </div>
          <label className="field-label">Vacatureomschrijving
            <textarea className="field-input min-h-32 resize-none leading-6" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <div className="rounded-xl border border-[#12445e] bg-[#0b2738] p-4">
            <div className="flex gap-3">
              <BrainCircuit className="mt-0.5 size-5 shrink-0 text-[#5bc0df]" />
              <div>
                <p className="text-sm font-semibold text-white">Analyse bij genereren</p>
                <p className="mt-1 text-sm leading-6 text-[#91aabb]">Doelgroep, propositie, drie USP&apos;s, teksten, beeldbriefing en KPI-grenzen worden automatisch opgesteld.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 p-6">
          <button className="primary-button w-full justify-center" onClick={createCampaign}>
            <Sparkles className="size-4" />Analyseer en genereer
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CreativePreview({ campaign }: { campaign: Campaign }) {
  return (
    <div className="creative-shell">
      <div className="creative-bg" />
      <div className="creative-shade" />
      <div className="creative-content">
        <FinderzMark />
        <div className="mt-auto">
          <div className="creative-location">{campaign.location}</div>
          <h3>{campaign.title}</h3>
          <div className="creative-usps">
            {campaign.usps.map((usp) => <span key={usp}><Check className="size-3.5" />{usp}</span>)}
          </div>
          <div className="creative-cta">Bekijk vacature<ChevronRight className="size-4" /></div>
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
        <circle cx="508" cy="12" r="5" fill="#071927" stroke="#72d1ec" strokeWidth="3" />
      </svg>
      <div className="mt-2 flex justify-between text-xs text-[#6f8798]"><span>25 aug</span><span>28 aug</span><span>31 aug</span><span>3 sep</span><span>5 sep</span></div>
    </div>
  );
}

export default function Home() {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [selectedId, setSelectedId] = useState(initialCampaigns[0].id);
  const selected = campaigns.find((campaign) => campaign.id === selectedId) ?? campaigns[0];
  const totals = useMemo(() => {
    const spend = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
    const leads = campaigns.reduce((sum, campaign) => sum + campaign.leads, 0);
    const clicks = campaigns.reduce((sum, campaign) => sum + campaign.clicks, 0);
    const impressions = campaigns.reduce((sum, campaign) => sum + campaign.impressions, 0);
    return { spend, leads, cpl: leads ? spend / leads : 0, ctr: impressions ? (clicks / impressions) * 100 : 0 };
  }, [campaigns]);

  function addCampaign(campaign: Campaign) {
    setCampaigns((current) => [campaign, ...current]);
    setSelectedId(campaign.id);
  }

  function updateSelected(update: Partial<Campaign>, message: string) {
    setCampaigns((current) => current.map((campaign) => campaign.id === selected.id ? { ...campaign, ...update } : campaign));
    toast.success(message);
  }

  const budgetUsed = selected.maxBudget ? Math.min((selected.spend / selected.maxBudget) * 100, 100) : 0;
  const cpl = selected.leads ? selected.spend / selected.leads : 0;
  const ctr = selected.impressions ? (selected.clicks / selected.impressions) * 100 : 0;

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-white/8 bg-[#06131f]">
        <SidebarHeader className="h-[74px] justify-center border-b border-white/8 px-5">
          <div className="group-data-[collapsible=icon]:hidden"><FinderzMark /></div>
          <div className="hidden group-data-[collapsible=icon]:block"><FinderzMark compact /></div>
        </SidebarHeader>
        <SidebarContent className="px-3 py-5">
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-[11px] font-bold uppercase tracking-[0.15em] text-[#506a7c] group-data-[collapsible=icon]:hidden">Meta Engine</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {[
                  { label: "Overzicht", icon: LayoutDashboard, active: true },
                  { label: "Campagnes", icon: Megaphone },
                  { label: "Creatives", icon: ImageIcon },
                  { label: "Optimalisaties", icon: BrainCircuit, badge: "3" },
                  { label: "Automatisering", icon: Zap },
                ].map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      isActive={item.active}
                      tooltip={item.label}
                      className="h-10 text-[#91aabb] data-[active=true]:bg-[#0c3045] data-[active=true]:text-white hover:bg-white/5 hover:text-white"
                      onClick={() => item.active ? undefined : toast.info(item.label + " is onderdeel van de volgende bouwslag.")}
                    >
                      <item.icon /><span>{item.label}</span>
                      {item.badge && <span className="ml-auto rounded-full bg-[#df9826]/15 px-2 py-0.5 text-xs font-bold text-[#f0ad3d]">{item.badge}</span>}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="mt-auto">
            <SidebarGroupLabel className="px-3 text-[11px] font-bold uppercase tracking-[0.15em] text-[#506a7c] group-data-[collapsible=icon]:hidden">Beheer</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu><SidebarMenuItem>
                <SidebarMenuButton tooltip="Instellingen" className="h-10 text-[#91aabb] hover:bg-white/5 hover:text-white" onClick={() => toast.info("Meta-koppeling wordt actief zodra de accountgegevens zijn toegevoegd.")}>
                  <Settings2 /><span>Instellingen</span>
                </SidebarMenuButton>
              </SidebarMenuItem></SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-white/8 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/[0.035] p-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#006192] text-xs font-bold text-white">JS</div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-semibold text-white">Joshua</p><p className="truncate text-xs text-[#6f8798]">Brand & Growth</p></div>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 bg-[#081722]">
        <header className="sticky top-0 z-30 flex h-[74px] items-center border-b border-white/8 bg-[#081722]/95 px-4 backdrop-blur md:px-7">
          <SidebarTrigger className="mr-3 text-[#91aabb] hover:bg-white/5 hover:text-white" />
          <div className="min-w-0"><h1 className="truncate text-lg font-semibold tracking-tight text-white">Meta Campaign Control</h1><p className="hidden text-xs text-[#6f8798] sm:block">Vrijdag 5 september · laatste analyse 2 min geleden</p></div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-[#1b4760] bg-[#0b2738] px-3 py-1.5 text-xs font-semibold text-[#82cbe1] sm:flex"><span className="size-1.5 rounded-full bg-[#35b7df] shadow-[0_0_8px_#35b7df]" />Sandbox actief</div>
            <NewCampaignSheet onCreate={addCampaign} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1560px] space-y-6 p-4 md:p-7">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Actieve campagnes", value: String(campaigns.filter((campaign) => campaign.status === "live").length), sub: campaigns.length + " campagnes totaal", icon: Megaphone },
              { label: "Spend deze maand", value: euro.format(totals.spend), sub: "binnen alle budgetgrenzen", icon: CircleDollarSign },
              { label: "Nieuwe leads", value: String(totals.leads), sub: "+18% versus vorige periode", icon: Users },
              { label: "Gemiddelde CPL", value: euro.format(totals.cpl), sub: totals.ctr.toFixed(2).replace(".", ",") + "% gem. CTR", icon: Target },
            ].map((metric) => (
              <article className="metric-card" key={metric.label}>
                <div className="flex items-start justify-between"><div><p className="text-sm font-medium text-[#7f97a8]">{metric.label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-white">{metric.value}</p></div><div className="metric-icon"><metric.icon className="size-[18px]" /></div></div>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-[#668194]"><TrendingUp className="size-3.5 text-[#35b7df]" />{metric.sub}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.62fr)_380px]">
            <div className="space-y-6">
              <article className="panel overflow-hidden">
                <div className="panel-header">
                  <div><div className="eyebrow"><Activity className="size-3.5" />Live overzicht</div><h2>Campagnes</h2></div>
                  <div className="relative hidden sm:block"><Search className="absolute left-3 top-2.5 size-4 text-[#607b8d]" /><input className="h-9 w-56 rounded-lg border border-white/10 bg-[#06131f] pl-9 pr-3 text-sm text-white outline-none placeholder:text-[#506a7c] focus:border-[#278cb0]" placeholder="Zoek campagne" /></div>
                </div>
                <Table>
                  <TableHeader><TableRow className="border-white/8 hover:bg-transparent">
                    <TableHead className="px-5 table-heading">Vacature</TableHead><TableHead className="table-heading">Status</TableHead><TableHead className="table-heading">Spend</TableHead><TableHead className="table-heading">Leads</TableHead><TableHead className="table-heading">CPL</TableHead><TableHead className="pr-5 text-right table-heading">Budget</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{campaigns.map((campaign) => {
                    const rowCpl = campaign.leads ? campaign.spend / campaign.leads : 0;
                    const used = campaign.maxBudget ? Math.round((campaign.spend / campaign.maxBudget) * 100) : 0;
                    return (
                      <TableRow key={campaign.id} className={"cursor-pointer border-white/8 hover:bg-[#0c2636] " + (campaign.id === selected.id ? "bg-[#0b2332]" : "")} onClick={() => setSelectedId(campaign.id)}>
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
                      <div className="rounded-xl border border-white/8 bg-[#071927] p-5">
                        <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-white">Budgetkader</p><p className="mt-1 text-xs text-[#607b8d]">Maximaal 20% van fee</p></div><ShieldCheck className="size-5 text-[#35b7df]" /></div>
                        <div className="mt-6 flex items-end justify-between"><div><span className="text-2xl font-semibold text-white">{euro.format(selected.spend)}</span><span className="ml-1 text-sm text-[#6f8798]">/ {euro.format(selected.maxBudget)}</span></div><span className="text-sm font-bold text-[#73cbe5]">{Math.round(budgetUsed)}%</span></div>
                        <Progress value={budgetUsed} className="mt-3 h-2.5 bg-white/8 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-[#006192] [&_[data-slot=progress-indicator]]:to-[#42c3e7]" />
                        <div className="mt-5 grid grid-cols-2 gap-3"><div className="budget-stat"><span>Fee</span><strong>{euro.format(selected.fee)}</strong></div><div className="budget-stat"><span>Resterend</span><strong>{euro.format(Math.max(selected.maxBudget - selected.spend, 0))}</strong></div></div>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="creative" className="p-5">
                    <div className="grid gap-6 lg:grid-cols-[310px_minmax(0,1fr)]">
                      <CreativePreview campaign={selected} />
                      <div className="space-y-5">
                        <div><span className="content-label">Primaire tekst</span><p className="content-box">{selected.primaryText}</p></div>
                        <div><span className="content-label">Kop</span><p className="content-box">{selected.headline}</p></div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <button className="secondary-button justify-center" onClick={() => toast.success("Nieuwe tekstvariant staat klaar.")}><Sparkles className="size-4" />Nieuwe tekstvariant</button>
                          <button className="secondary-button justify-center" onClick={() => toast.success("Nieuwe beeldbriefing gegenereerd.")}><RefreshCw className="size-4" />Nieuwe achtergrond</button>
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
                <div className="mt-5 rounded-xl border border-[#174864] bg-[#0b2738] p-4"><p className="text-sm leading-6 text-[#bbced9]">{selected.recommendation}</p></div>
                <button className="primary-button mt-4 w-full justify-center" onClick={() => {
                  if (selected.status === "paused") updateSelected({ status: "draft", recommendation: "Campagne staat klaar voor een nieuwe creative en teksthoek." }, "Campagne teruggezet naar concept");
                  else if (selected.status === "draft") updateSelected({ status: "live", recommendation: "Campagne is gestart. De eerste evaluatie volgt na voldoende bereik." }, "Campagne gestart in sandbox");
                  else updateSelected({ maxBudget: Math.round(selected.maxBudget * 1.15) }, "Aanbevolen optimalisatie toegepast");
                }}>
                  {selected.status === "paused" ? <RefreshCw className="size-4" /> : selected.status === "draft" ? <Play className="size-4" /> : <ArrowUpRight className="size-4" />}{selected.nextAction}
                </button>
                {selected.status !== "paused" && <button className="danger-button mt-2 w-full justify-center" onClick={() => updateSelected({ status: "paused", nextAction: "Herbouw campagne" }, "Campagne gepauzeerd")}><Pause className="size-4" />Campagne pauzeren</button>}
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
        </main>
      </SidebarInset>
      <Toaster theme="dark" richColors position="bottom-right" />
    </SidebarProvider>
  );
}
