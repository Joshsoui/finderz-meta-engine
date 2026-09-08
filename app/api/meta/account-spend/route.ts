import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accountSpendSummary } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";
import { getMetaCredentials } from "@/lib/meta-client";

export async function GET() {
  try {
    if (!getMetaCredentials()) return Response.json({ connected: false });

    const db = await getDb();
    const [row] = await db.select().from(accountSpendSummary).where(eq(accountSpendSummary.id, "meta")).limit(1);
    if (!row) return Response.json({ connected: true, today: 0, last7d: 0, lifetime: 0, updatedAt: null });

    return Response.json({
      connected: true,
      today: row.todayCents / 100,
      last7d: row.last7dCents / 100,
      lifetime: row.lifetimeCents / 100,
      updatedAt: row.updatedAt,
    });
  } catch (error) {
    return errorResponse(error, "Account-brede spend kon niet worden opgehaald");
  }
}
