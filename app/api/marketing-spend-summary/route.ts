import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accountSpendSummary, dailySpendLog, indeedSpendLog } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";
import { amsterdamDateDaysAgo, amsterdamToday } from "@/lib/dates";
import { getMetaCredentials } from "@/lib/meta-client";

/**
 * Combines Meta and Indeed spend into one grand-total figure (today / last 7
 * days / lifetime), plus the same numbers split by channel -- reads only
 * from tables already synced elsewhere (accountSpendSummary, dailySpendLog,
 * indeedSpendLog), never calls Meta itself.
 */
export async function GET() {
  try {
    const db = await getDb();
    const today = amsterdamToday();
    const weekStart = amsterdamDateDaysAgo(6);

    let metaTodayCents = 0;
    let metaWeekCents = 0;
    let metaLifetimeCents = 0;
    let metaSource: "account" | "manual" = "manual";

    if (getMetaCredentials()) {
      const [accountRow] = await db.select().from(accountSpendSummary).where(eq(accountSpendSummary.id, "meta")).limit(1);
      if (accountRow) {
        metaTodayCents = accountRow.todayCents;
        metaWeekCents = accountRow.last7dCents;
        metaLifetimeCents = accountRow.lifetimeCents;
        metaSource = "account";
      }
    }

    if (metaSource === "manual") {
      const rows = await db.select().from(dailySpendLog).orderBy(desc(dailySpendLog.date)).limit(14);
      metaTodayCents = rows.find((row) => row.date === today)?.amountCents ?? 0;
      metaWeekCents = rows.filter((row) => row.date >= weekStart).reduce((sum, row) => sum + row.amountCents, 0);
      const [{ total }] = await db.select({ total: sql<number>`coalesce(sum(${dailySpendLog.amountCents}), 0)` }).from(dailySpendLog);
      metaLifetimeCents = total;
    }

    const indeedRows = await db.select({ date: indeedSpendLog.date, amountCents: indeedSpendLog.amountCents }).from(indeedSpendLog);
    const indeedTodayCents = indeedRows.filter((row) => row.date === today).reduce((sum, row) => sum + row.amountCents, 0);
    const indeedWeekCents = indeedRows.filter((row) => row.date >= weekStart).reduce((sum, row) => sum + row.amountCents, 0);
    const indeedLifetimeCents = indeedRows.reduce((sum, row) => sum + row.amountCents, 0);

    return Response.json({
      today: { meta: metaTodayCents / 100, indeed: indeedTodayCents / 100, total: (metaTodayCents + indeedTodayCents) / 100 },
      last7d: { meta: metaWeekCents / 100, indeed: indeedWeekCents / 100, total: (metaWeekCents + indeedWeekCents) / 100 },
      lifetime: { meta: metaLifetimeCents / 100, indeed: indeedLifetimeCents / 100, total: (metaLifetimeCents + indeedLifetimeCents) / 100 },
      metaSource,
    });
  } catch (error) {
    return errorResponse(error, "Totale marketingspend kon niet worden opgehaald");
  }
}
