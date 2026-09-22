import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { opportunities, opportunityFeedback } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

const REASON_VALUES = ["irrelevant", "wrong_audience", "too_commercial", "not_interesting", "wrong_timing", "other"] as const;

/** Dismiss an opportunity, optionally with a reason -- stored as feedback for later learning (section 8/10), never just deleted. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { reason?: string; note?: string };
    const reason = REASON_VALUES.includes(body.reason as typeof REASON_VALUES[number]) ? (body.reason as typeof REASON_VALUES[number]) : undefined;

    const db = await getDb();
    const [opportunity] = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
    if (!opportunity) return Response.json({ error: "Opportunity niet gevonden" }, { status: 404 });

    const now = new Date().toISOString();
    const [updated] = await db.update(opportunities).set({ status: "dismissed", updatedAt: now }).where(eq(opportunities.id, id)).returning();
    await db.insert(opportunityFeedback).values({ opportunityId: id, action: "dismissed", reason, note: body.note?.trim() || null, createdAt: now });

    return Response.json({ opportunity: updated });
  } catch (error) {
    return errorResponse(error, "Opportunity kon niet worden afgewezen");
  }
}
