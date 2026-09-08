import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { indeedSpendLog } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

function amsterdamToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.select().from(indeedSpendLog).orderBy(desc(indeedSpendLog.date)).limit(14);
    const [{ total }] = await db.select({ total: sql<number>`coalesce(sum(${indeedSpendLog.amountCents}), 0)` }).from(indeedSpendLog);
    return Response.json({ today: amsterdamToday(), entries: rows, totalAmountCents: total });
  } catch (error) {
    return errorResponse(error, "Indeed spend unavailable");
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { date?: string; amount?: number };
    const date = body.date && DATE_PATTERN.test(body.date) ? body.date : amsterdamToday();
    if (!Number.isFinite(body.amount) || Number(body.amount) < 0) {
      return Response.json({ error: "amount must be a non-negative number" }, { status: 400 });
    }

    const db = await getDb();
    const [entry] = await db
      .insert(indeedSpendLog)
      .values({ date, amountCents: Math.round(Number(body.amount) * 100), updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: indeedSpendLog.date,
        set: { amountCents: Math.round(Number(body.amount) * 100), updatedAt: new Date().toISOString() },
      })
      .returning();
    return Response.json({ entry });
  } catch (error) {
    return errorResponse(error, "Indeed spend could not be saved");
  }
}
