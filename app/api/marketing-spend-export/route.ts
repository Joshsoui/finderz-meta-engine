import { and, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { accountSpendDailyLog, dailySpendLog, indeedSpendLog } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 400;

function dateRange(from: string, to: string): string[] {
  const [fromY, fromM, fromD] = from.split("-").map(Number);
  const [toY, toM, toD] = to.split("-").map(Number);
  const cursor = new Date(Date.UTC(fromY, fromM - 1, fromD));
  const end = new Date(Date.UTC(toY, toM - 1, toD));
  const dates: string[] = [];
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function euroCell(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

async function computeRows(from: string, to: string) {
  const days = dateRange(from, to);
  const db = await getDb();
  const [accountRows, manualRows, indeedRows] = await Promise.all([
    db.select().from(accountSpendDailyLog).where(and(gte(accountSpendDailyLog.date, from), lte(accountSpendDailyLog.date, to))),
    db.select().from(dailySpendLog).where(and(gte(dailySpendLog.date, from), lte(dailySpendLog.date, to))),
    db.select({ date: indeedSpendLog.date, amountCents: indeedSpendLog.amountCents }).from(indeedSpendLog).where(and(gte(indeedSpendLog.date, from), lte(indeedSpendLog.date, to))),
  ]);

  // accountSpendDailyLog (whole ad account, once Meta is connected) is the
  // more complete figure where it exists for a day; dailySpendLog (manual
  // entry, or the platform-only automatic figure) fills in the rest.
  const accountByDate = new Map(accountRows.map((row) => [row.date, row.amountCents]));
  const manualByDate = new Map(manualRows.map((row) => [row.date, row.amountCents]));
  const indeedByDate = new Map<string, number>();
  for (const row of indeedRows) indeedByDate.set(row.date, (indeedByDate.get(row.date) ?? 0) + row.amountCents);

  const rows = days.map((date) => {
    const metaCents = accountByDate.get(date) ?? manualByDate.get(date) ?? 0;
    const indeedCents = indeedByDate.get(date) ?? 0;
    return { date, metaCents, indeedCents };
  });

  const metaTotalCents = rows.reduce((sum, row) => sum + row.metaCents, 0);
  const indeedTotalCents = rows.reduce((sum, row) => sum + row.indeedCents, 0);
  return { rows, metaTotalCents, indeedTotalCents };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    const format = url.searchParams.get("format") ?? "csv";
    if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || from > to) {
      return Response.json({ error: "Geef een geldige 'from' en 'to' datum op (YYYY-MM-DD), from voor of gelijk aan to" }, { status: 400 });
    }

    const dayCount = dateRange(from, to).length;
    if (dayCount > MAX_RANGE_DAYS) {
      return Response.json({ error: `Periode is te lang (max ${MAX_RANGE_DAYS} dagen)` }, { status: 400 });
    }

    const { rows, metaTotalCents, indeedTotalCents } = await computeRows(from, to);

    if (format === "json") {
      return Response.json({
        from,
        to,
        days: rows.length,
        meta: metaTotalCents / 100,
        indeed: indeedTotalCents / 100,
        total: (metaTotalCents + indeedTotalCents) / 100,
      });
    }

    const lines = ["Datum;Meta (EUR);Indeed (EUR);Totaal (EUR)"];
    for (const row of rows) lines.push(`${row.date};${euroCell(row.metaCents)};${euroCell(row.indeedCents)};${euroCell(row.metaCents + row.indeedCents)}`);
    lines.push(`Totaal;${euroCell(metaTotalCents)};${euroCell(indeedTotalCents)};${euroCell(metaTotalCents + indeedTotalCents)}`);

    const csv = "﻿" + lines.join("\r\n") + "\r\n";
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="marketingspend_${from}_tot_${to}.csv"`,
      },
    });
  } catch (error) {
    return errorResponse(error, "Export kon niet worden gemaakt");
  }
}
