import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { actionsTaken, opportunities } from "@/db/schema";
import { ACTION_TYPES, type ActionType } from "@/lib/action-types";
import { errorResponse } from "@/lib/api-error";

/**
 * Records that a human picked one of the AI's recommended actions (section
 * 7's learning loop) for actions this platform doesn't itself generate
 * content or a campaign for -- ignore, monitor, pr_opportunity, sales_alert,
 * website_update. Content-generating actions get their actionsTaken row
 * automatically when the content piece is created (see generate-content).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { action?: string; note?: string };
    if (!ACTION_TYPES.includes(body.action as ActionType)) {
      return Response.json({ error: `action moet een van deze zijn: ${ACTION_TYPES.join(", ")}` }, { status: 400 });
    }

    const db = await getDb();
    const [opportunity] = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
    if (!opportunity) return Response.json({ error: "Opportunity niet gevonden" }, { status: 404 });

    const [row] = await db
      .insert(actionsTaken)
      .values({ opportunityId: id, action: body.action as ActionType, status: "chosen", note: body.note?.trim() || null, createdAt: new Date().toISOString() })
      .returning();

    return Response.json({ actionTaken: row }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Actie kon niet worden vastgelegd");
  }
}
