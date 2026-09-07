import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { dailySpendLog } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

function amsterdamToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.select().from(dailySpendLog).orderBy(desc(dailySpendLog.date)).limit(14);
    return Response.json({ today: amsterdamToday(), entries: rows });
  } catch (error) {
    return errorResponse(error, "Daily spend unavailable");
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
      .insert(dailySpendLog)
      .values({ date, amountCents: Math.round(Number(body.amount) * 100), updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: dailySpendLog.date,
        set: { amountCents: Math.round(Number(body.amount) * 100), updatedAt: new Date().toISOString() },
      })
      .returning();
    return Response.json({ entry });
  } catch (error) {
    return errorResponse(error, "Daily spend could not be saved");
  }
}
