"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Clock3, ExternalLink, LoaderCircle, Megaphone, RefreshCw, Sparkles, ThumbsDown, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { NewCampaignSheet } from "@/components/new-campaign-sheet";
import { CHANNEL_LABEL, type ChannelContent, type ContentChannel } from "@/lib/content-channels";
import { ACTION_LABEL, ACTION_TO_CONTENT_CHANNEL, URGENCY_LABEL, type ActionType, type Urgency } from "@/lib/action-types";

type OpportunityDetail = {
  id: string;
  title: string;
  score: number;
  effectiveScore: number;
  relevanceScore: number;
  timelinessScore: number;
  audienceFitScore: number;
  regionalFitScore: number;
  commercialPotentialScore: number;
  contentPotentialScore: number;
  recruitmentPotentialScore: number;
  whyNow: string;
  urgency: Urgency;
  optimalActionBeforeAt: string | null;
  isAppropriate: boolean;
  guardrailReason: string | null;
  status: string;
};

type SignalDetail = { title: string; summary: string; source: string; sourceUrl: string | null; category: string };
type ContentPieceRow = { id: string; channel: ContentChannel; contentJson: string; status: string; sourceUrlsJson: string };
type MatchingVacancy = { id: string; title: string; location: string; salary: string; feeCents: number; description: string; otysVacancyId: string | null };
type ActionRecommendationRow = { id: number; action: ActionType; score: number; reasoning: string };
type ActionTakenRow = { id: number; action: ActionType; status: string };

const SUBSCORE_LABELS: Array<{ key: keyof OpportunityDetail; label: string }> = [
  { key: "relevanceScore", label: "Relevance" },
  { key: "timelinessScore", label: "Timeliness" },
  { key: "audienceFitScore", label: "Audience fit" },
  { key: "regionalFitScore", label: "Regional fit" },
  { key: "commercialPotentialScore", label: "Commercial potential" },
  { key: "contentPotentialScore", label: "Content potential" },
  { key: "recruitmentPotentialScore", label: "Recruitment potential" },
];

const deadlineFormat = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function renderChannelContent(content: ChannelContent) {
  switch (content.channel) {
    case "linkedin":
    case "facebook":
      return (
        <>
          <p className="whitespace-pre-wrap text-sm text-white">{content.post}</p>
          <p className="mt-2 text-xs font-semibold text-[#5bc0df]">CTA: {content.cta}</p>
        </>
      );
    case "instagram":
      return (
        <>
          <p className="text-sm font-semibold text-white">{content.hook}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[#c4d1d9]">{content.caption}</p>
          <p className="mt-2 text-xs text-[#91aabb]">Visueel concept: {content.visualConcept}</p>
          {content.reelConcept && <p className="mt-1 text-xs text-[#91aabb]">Reel-concept: {content.reelConcept}</p>}
        </>
      );
    case "instagram_story":
      return (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {content.frames.map((frame, index) => (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3" key={index}>
                <p className="text-xs font-semibold text-[#607b8d]">Frame {index + 1}</p>
                <p className="mt-1 text-sm text-white">{frame.text}</p>
                <p className="mt-1 text-xs text-[#91aabb]">{frame.visualConcept}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs font-semibold text-[#5bc0df]">CTA: {content.cta}</p>
        </>
      );
    case "reel":
      return (
        <>
          <p className="text-sm font-semibold text-white">{content.hook}</p>
          <div className="mt-2 space-y-1.5">
            {content.script.map((scene, index) => (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-xs" key={index}>
                <span className="font-semibold text-[#607b8d]">Scene {index + 1}</span> <span className="text-white">{scene.scene}</span>
                <p className="mt-1 text-[#91aabb]">{scene.visual}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm text-[#c4d1d9]">{content.caption}</p>
          <p className="mt-2 text-xs font-semibold text-[#5bc0df]">CTA: {content.cta}</p>
        </>
      );
    case "meta_ad":
      return (
        <>
          <p className="text-sm font-semibold text-white">{content.headline}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[#c4d1d9]">{content.primaryText}</p>
          <p className="mt-1 text-xs text-[#91aabb]">{content.description}</p>
          <p className="mt-2 text-xs text-[#91aabb]">Beeldconcept: {content.creativeConcept}</p>
          <p className="mt-1 text-xs text-[#91aabb]">Doelgroep: {content.audienceSuggestion}</p>
          <p className="mt-2 text-xs font-semibold text-[#5bc0df]">CTA: {content.cta}</p>
        </>
      );
    case "blog":
      return (
        <>
          <p className="text-sm font-semibold text-white">{content.title}</p>
          <p className="mt-1 text-sm italic text-[#c4d1d9]">{content.intro}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[#c4d1d9]">{content.body}</p>
          <p className="mt-2 text-xs font-semibold text-[#5bc0df]">CTA: {content.cta}</p>
        </>
      );
    case "landing_page":
      return (
        <>
          <p className="text-sm font-semibold text-white">{content.headline}</p>
          <p className="mt-1 text-sm text-[#c4d1d9]">{content.subheadline}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[#c4d1d9]">{content.body}</p>
          <p className="mt-2 text-xs font-semibold text-[#5bc0df]">CTA: {content.cta}</p>
        </>
      );
    case "email_campaign":
      return (
        <>
          <p className="text-sm font-semibold text-white">Onderwerp: {content.subject}</p>
          <p className="mt-1 text-xs italic text-[#91aabb]">{content.preheader}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[#c4d1d9]">{content.body}</p>
          <p className="mt-2 text-xs font-semibold text-[#5bc0df]">CTA: {content.cta}</p>
        </>
      );
    case "werkinnoordholland":
      return (
        <>
          <p className="text-sm font-semibold text-white">{content.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[#c4d1d9]">{content.body}</p>
          <p className="mt-2 text-xs font-semibold text-[#5bc0df]">CTA: {content.cta}</p>
        </>
      );
    default:
      return null;
  }
}

const DISMISS_REASONS = [
  { value: "irrelevant", label: "Irrelevant" },
  { value: "wrong_audience", label: "Verkeerde doelgroep" },
  { value: "too_commercial", label: "Te commercieel" },
  { value: "not_interesting", label: "Niet interessant" },
  { value: "wrong_timing", label: "Verkeerde timing" },
  { value: "other", label: "Anders" },
];

function OpportunityDetailBody({ opportunityId, onClose, onChanged }: { opportunityId: string; onClose: () => void; onChanged: () => void }) {
  const [opportunity, setOpportunity] = useState<OpportunityDetail | null>(null);
  const [signal, setSignal] = useState<SignalDetail | null>(null);
  const [contentPieces, setContentPieces] = useState<ContentPieceRow[]>([]);
  const [actionRecommendations, setActionRecommendations] = useState<ActionRecommendationRow[]>([]);
  const [actionsTaken, setActionsTaken] = useState<ActionTakenRow[]>([]);
  const [matchingVacancies, setMatchingVacancies] = useState<MatchingVacancy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<ActionType | null>(null);
  const [busyPieceId, setBusyPieceId] = useState<string | null>(null);
  const [showDismissReasons, setShowDismissReasons] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/opportunities/${opportunityId}`);
      const payload = await response.json() as {
        opportunity?: OpportunityDetail; signal?: SignalDetail; contentPieces?: ContentPieceRow[];
        actionRecommendations?: ActionRecommendationRow[]; actionsTaken?: ActionTakenRow[]; matchingVacancies?: MatchingVacancy[]; error?: string;
      };
      if (!response.ok || !payload.opportunity) throw new Error(payload.error || "Opportunity kon niet worden geladen.");
      setOpportunity(payload.opportunity);
      setSignal(payload.signal ?? null);
      setContentPieces(payload.contentPieces ?? []);
      setActionRecommendations(payload.actionRecommendations ?? []);
      setActionsTaken(payload.actionsTaken ?? []);
      setMatchingVacancies(payload.matchingVacancies ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Opportunity kon niet worden geladen.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId]);

  async function generateContent(action: ActionType, channel: ContentChannel) {
    setBusyAction(action);
    try {
      const response = await fetch(`/api/opportunities/${opportunityId}/generate-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Content genereren is niet gelukt.");
      toast.success(`Content voor ${CHANNEL_LABEL[channel]} gegenereerd`);
      await load();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Content genereren is niet gelukt.");
    } finally {
      setBusyAction(null);
    }
  }

  async function chooseAction(action: ActionType) {
    setBusyAction(action);
    try {
      const response = await fetch(`/api/opportunities/${opportunityId}/choose-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Actie kon niet worden vastgelegd.");
      toast.success(`"${ACTION_LABEL[action]}" gekozen`);
      await load();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Actie kon niet worden vastgelegd.");
    } finally {
      setBusyAction(null);
    }
  }

  async function actOnPiece(pieceId: string, action: "approve" | "dismiss" | "regenerate") {
    setBusyPieceId(pieceId);
    try {
      const response = await fetch(`/api/content-pieces/${pieceId}/${action}`, { method: "POST" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Actie is niet gelukt.");
      await load();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Actie is niet gelukt.");
    } finally {
      setBusyPieceId(null);
    }
  }

  async function dismissOpportunity(reason?: string) {
    try {
      const response = await fetch(`/api/opportunities/${opportunityId}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw new Error("Afwijzen is niet gelukt.");
      toast.success("Opportunity afgewezen");
      onChanged();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Afwijzen is niet gelukt.");
    }
  }

  if (isLoading || !opportunity) {
    return <div className="flex flex-1 items-center justify-center"><LoaderCircle className="size-6 animate-spin text-[#5bc0df]" /></div>;
  }

  const generatedChannels = new Set(contentPieces.map((piece) => piece.channel));
  const chosenActions = new Set(actionsTaken.map((row) => row.action));
  const primaryVacancy = matchingVacancies[0];
  const metaAdPiece = contentPieces.find((piece) => piece.channel === "meta_ad");
  const sortedRecommendations = actionRecommendations.slice().sort((a, b) => b.score - a.score);
  const isDecayed = opportunity.effectiveScore < opportunity.score;

  return (
    <>
      <SheetHeader className="border-b border-white/10 px-6 py-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#0f8db7]/15 px-2.5 py-1 text-sm font-bold text-[#5bc0df]">
            {opportunity.effectiveScore}{isDecayed && <span className="ml-1 font-normal text-[#6f8798]">(was {opportunity.score})</span>}
          </span>
          <span className="status status-live"><span />{URGENCY_LABEL[opportunity.urgency]}</span>
          {opportunity.optimalActionBeforeAt && (
            <span className="inline-flex items-center gap-1 text-xs text-[#91aabb]"><Clock3 className="size-3.5" />actie zinvol tot {deadlineFormat.format(new Date(opportunity.optimalActionBeforeAt))}</span>
          )}
          {!opportunity.isAppropriate && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#3a1417] px-2.5 py-1 text-xs font-semibold text-[#f2a1a5]">
              <AlertTriangle className="size-3.5" />Geblokkeerd door guardrail
            </span>
          )}
        </div>
        <SheetTitle className="text-xl text-white">{opportunity.title}</SheetTitle>
        {signal && (
          <SheetDescription className="text-[#91aabb]">
            Bron: {signal.source}
            {signal.sourceUrl && (
              <a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1 text-[#5bc0df] hover:underline">
                bekijk artikel<ExternalLink className="size-3" />
              </a>
            )}
          </SheetDescription>
        )}
      </SheetHeader>

      <div className="scrollbar-gutter-stable scrollbar-thin flex-1 space-y-6 overflow-y-auto px-6 py-6">
        {!opportunity.isAppropriate && (
          <div className="rounded-xl border border-[#5a2a2c] bg-[#3a1417] p-4 text-sm leading-6 text-[#f2a1a5]">
            {opportunity.guardrailReason || "Deze opportunity is niet geschikt bevonden om actie op te ondernemen."}
          </div>
        )}

        <div>
          <p className="content-label">WHY NOW</p>
          <p className="mt-1 text-sm leading-6 text-[#c4d1d9]">{opportunity.whyNow}</p>
        </div>

        <div>
          <p className="content-label">Deelscores</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SUBSCORE_LABELS.map(({ key, label }) => (
              <div className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm" key={key}>
                <span className="text-[#91aabb]">{label}</span>
                <strong className="text-white">{opportunity[key] as number}</strong>
              </div>
            ))}
          </div>
        </div>

        {matchingVacancies.length > 0 && (
          <div>
            <p className="content-label">Matching vacancies</p>
            <div className="space-y-2">
              {matchingVacancies.map((vacancy) => (
                <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white" key={vacancy.id}>
                  {vacancy.title} <span className="text-[#91aabb]">· {vacancy.location}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {opportunity.isAppropriate && (
          <div>
            <p className="content-label">Recommended action <span className="font-normal text-[#607b8d]">-- geen social post is de default, dit is een keuze, niet een automatisme</span></p>
            <div className="space-y-2">
              {sortedRecommendations.map((recommendation, index) => {
                const channel = ACTION_TO_CONTENT_CHANNEL[recommendation.action] as ContentChannel | undefined;
                const isGenerated = channel ? generatedChannels.has(channel) : false;
                const isChosen = chosenActions.has(recommendation.action);
                return (
                  <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3" key={recommendation.action}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {index === 0 && <span className="rounded-full bg-[#0f8db7]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#5bc0df]">Top keuze</span>}
                        <strong className="text-sm text-white">{ACTION_LABEL[recommendation.action]}</strong>
                        <span className="text-xs font-bold text-[#5bc0df]">{recommendation.score}</span>
                        {isChosen && <span className="inline-flex items-center gap-1 text-xs text-[#7fd99c]"><CheckCircle2 className="size-3.5" />gekozen</span>}
                      </div>
                      {recommendation.action !== "ignore" && (
                        channel ? (
                          <button className="secondary-button !py-1.5 !text-xs disabled:cursor-wait disabled:opacity-60" onClick={() => void generateContent(recommendation.action, channel)} disabled={busyAction !== null}>
                            {busyAction === recommendation.action ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                            {isGenerated ? "Opnieuw genereren" : "Genereer content"}
                          </button>
                        ) : (
                          <button className="secondary-button !py-1.5 !text-xs disabled:cursor-wait disabled:opacity-60" onClick={() => void chooseAction(recommendation.action)} disabled={busyAction !== null || isChosen}>
                            {busyAction === recommendation.action ? <LoaderCircle className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                            {isChosen ? "Gekozen" : "Kies deze actie"}
                          </button>
                        )
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-[#91aabb]">{recommendation.reasoning}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {contentPieces.length > 0 && (
          <div className="space-y-3">
            <p className="content-label">Gegenereerde content</p>
            {contentPieces.map((piece) => {
              const content = JSON.parse(piece.contentJson) as ChannelContent;
              return (
                <div className="rounded-xl border border-white/10 bg-[#0e324e] p-4" key={piece.id}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-[#5bc0df]">{CHANNEL_LABEL[piece.channel]}</span>
                    <span className={"status " + (piece.status === "dismissed" ? "status-paused" : piece.status === "review" ? "status-attention" : "status-live")}>
                      <span />{piece.status === "review" ? "Ter review" : piece.status === "approved" ? "Goedgekeurd" : piece.status === "ready_to_publish" ? "Klaar om te publiceren" : "Afgewezen"}
                    </span>
                  </div>
                  {renderChannelContent(content)}
                  {piece.status !== "dismissed" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {piece.status === "review" && (
                        <button className="secondary-button !border-[#3f9d5f] !text-[#7fd99c]" disabled={busyPieceId === piece.id} onClick={() => void actOnPiece(piece.id, "approve")}>
                          <CheckCircle2 className="size-4" />Approve
                        </button>
                      )}
                      <button className="secondary-button" disabled={busyPieceId === piece.id} onClick={() => void actOnPiece(piece.id, "regenerate")}>
                        <RefreshCw className="size-4" />Regenerate
                      </button>
                      <button className="secondary-button" disabled={busyPieceId === piece.id} onClick={() => void actOnPiece(piece.id, "dismiss")}>
                        <Trash2 className="size-4" />Dismiss
                      </button>
                      {piece.channel === "meta_ad" && piece.status !== "review" && primaryVacancy && (
                        <NewCampaignSheet
                          onCreate={() => { toast.success("Meta-campagne aangemaakt vanuit deze opportunity"); onChanged(); }}
                          initialValues={{
                            title: primaryVacancy.title,
                            location: primaryVacancy.location,
                            salary: primaryVacancy.salary,
                            description: primaryVacancy.description,
                            fee: primaryVacancy.feeCents ? String(primaryVacancy.feeCents / 100) : undefined,
                            otysVacancyId: primaryVacancy.otysVacancyId ?? undefined,
                          }}
                          trigger={<button className="primary-button"><Megaphone className="size-4" />Genereer Meta-campagne</button>}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {metaAdPiece && metaAdPiece.status !== "review" && !primaryVacancy && (
          <p className="text-xs text-[#7f97a8]">Geen gekoppelde vacature gevonden om een Meta-campagne op te baseren -- koppel eerst een matchende vacature.</p>
        )}
      </div>

      <div className="border-t border-white/10 p-6">
        {showDismissReasons ? (
          <div className="space-y-2">
            <p className="text-xs text-[#91aabb]">Waarom wijs je dit af? (optioneel)</p>
            <div className="flex flex-wrap gap-2">
              {DISMISS_REASONS.map((reason) => (
                <button key={reason.value} className="secondary-button" onClick={() => void dismissOpportunity(reason.value)}>{reason.label}</button>
              ))}
              <button className="secondary-button" onClick={() => void dismissOpportunity()}>Geen reden</button>
            </div>
          </div>
        ) : (
          <button className="danger-button w-full justify-center" onClick={() => setShowDismissReasons(true)} disabled={opportunity.status === "dismissed"}>
            <ThumbsDown className="size-4" />Opportunity afwijzen
          </button>
        )}
      </div>
    </>
  );
}

export function OpportunityDetailSheet({
  opportunityId, onClose, onChanged,
}: {
  opportunityId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Sheet open={opportunityId !== null} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full border-[#23526f] bg-[#0e324e] p-0 text-white sm:max-w-2xl">
        {opportunityId && <OpportunityDetailBody key={opportunityId} opportunityId={opportunityId} onClose={onClose} onChanged={onChanged} />}
      </SheetContent>
    </Sheet>
  );
}
