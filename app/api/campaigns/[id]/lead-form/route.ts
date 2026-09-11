import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";
import { createCustomLeadForm, fetchLeadForm, getMetaCredentials, type LeadFormQuestion } from "@/lib/meta-client";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const credentials = getMetaCredentials();
    if (!credentials) return Response.json({ form: null, connected: false });

    const db = await getDb();
    const [campaign] = await db.select({ metaLeadFormId: campaigns.metaLeadFormId }).from(campaigns).where(eq(campaigns.id, id)).limit(1);
    if (!campaign?.metaLeadFormId) return Response.json({ form: null, connected: true });

    const form = await fetchLeadForm(campaign.metaLeadFormId);
    return Response.json({ form, connected: true });
  } catch (error) {
    return errorResponse(error, "Leadformulier kon niet worden opgehaald");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!getMetaCredentials()) return Response.json({ error: "Meta is not configured" }, { status: 400 });

    const body = (await request.json()) as { questions?: LeadFormQuestion[] };
    if (!Array.isArray(body.questions) || body.questions.length === 0) {
      return Response.json({ error: "Geef minstens één vraag op" }, { status: 400 });
    }

    const db = await getDb();
    const [campaign] = await db.select({ title: campaigns.title, otysVacancyId: campaigns.otysVacancyId }).from(campaigns).where(eq(campaigns.id, id)).limit(1);
    if (!campaign) return Response.json({ error: "Campagne niet gevonden" }, { status: 404 });

    const form = await createCustomLeadForm(campaign.title, body.questions, campaign.otysVacancyId ?? undefined);
    return Response.json({ form });
  } catch (error) {
    return errorResponse(error, "Nieuw leadformulier kon niet worden aangemaakt");
  }
}
