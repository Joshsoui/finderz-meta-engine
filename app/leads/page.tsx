"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, ThumbsDown, ThumbsUp, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";

type Lead = {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  quality: "unrated" | "good" | "bad";
  receivedAt: string;
  campaignId: string;
  campaignTitle: string;
  campaignLocation: string;
};

const dateFormat = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);

  async function fetchLeads(): Promise<Lead[]> {
    const response = await fetch("/api/leads");
    const payload = await response.json() as { leads?: Lead[]; error?: string };
    if (!response.ok || !payload.leads) throw new Error(payload.error || "Leads konden niet worden geladen.");
    return payload.leads;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const leads = await fetchLeads();
        if (!cancelled) setLeads(leads);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Leads konden niet worden geladen.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function setQuality(lead: Lead, quality: Lead["quality"]) {
    setSavingId(lead.id);
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quality }),
      });
      const payload = await response.json() as { lead?: Lead; error?: string };
      if (!response.ok || !payload.lead) throw new Error(payload.error || "Kwaliteit kon niet worden opgeslagen.");
      setLeads((current) => current.map((item) => (item.id === lead.id ? payload.lead! : item)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kwaliteit kon niet worden opgeslagen.");
    } finally {
      setSavingId(null);
    }
  }

  const rated = leads.filter((lead) => lead.quality !== "unrated").length;

  return (
    <AppShell active="leads" title="Leads" subtitle="Alle leads uit je campagnes, markeer welke bruikbaar zijn">
      <article className="panel overflow-hidden">
        <div className="panel-header">
          <div>
            <div className="eyebrow"><Users className="size-3.5" />Overzicht</div>
            <h2>Ontvangen leads</h2>
          </div>
          {leads.length > 0 && <span className="text-xs text-[#7f97a8]">{rated} van {leads.length} beoordeeld</span>}
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-[#91aabb]"><LoaderCircle className="size-6 animate-spin" /></div>
        ) : leads.length === 0 ? (
          <p className="py-16 text-center text-sm text-[#7f97a8]">Nog geen leads binnengekomen. Zodra Meta is gekoppeld en een campagne live staat, verschijnen leads hier automatisch.</p>
        ) : (
          <div className="divide-y divide-white/8">
            {leads.map((lead) => (
              <div className="flex flex-wrap items-center justify-between gap-4 p-5" key={lead.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm text-white">{lead.fullName || "Onbekende naam"}</strong>
                    {lead.quality !== "unrated" && (
                      <span className={"status " + (lead.quality === "good" ? "status-live" : "status-paused")}>
                        <span />{lead.quality === "good" ? "Bruikbaar" : "Niet bruikbaar"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs break-words text-[#91aabb]">{lead.email || "geen e-mail"} · {lead.phone || "geen telefoon"}</p>
                  <p className="mt-2 text-xs text-[#6f8798]">{lead.campaignTitle} · {lead.campaignLocation} · {dateFormat.format(new Date(lead.receivedAt))}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    className={"secondary-button" + (lead.quality === "good" ? " !border-[#3f9d5f] !text-[#7fd99c]" : "")}
                    disabled={savingId === lead.id}
                    onClick={() => setQuality(lead, lead.quality === "good" ? "unrated" : "good")}
                  >
                    <ThumbsUp className="size-4" />Bruikbaar
                  </button>
                  <button
                    className={"secondary-button" + (lead.quality === "bad" ? " !border-[#d5565c] !text-[#d9787d]" : "")}
                    disabled={savingId === lead.id}
                    onClick={() => setQuality(lead, lead.quality === "bad" ? "unrated" : "bad")}
                  >
                    <ThumbsDown className="size-4" />Niet bruikbaar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </AppShell>
  );
}
