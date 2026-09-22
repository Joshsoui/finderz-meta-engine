import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { signals } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

const STATUS_VALUES = ["new", "analyzed", "irrelevant"] as const;

export async function GET(request: Request) {
  try {
    const statusParam = new URL(request.url).searchParams.get("status");
    const status = STATUS_VALUES.includes(statusParam as typeof STATUS_VALUES[number]) ? (statusParam as typeof STATUS_VALUES[number]) : undefined;

    const db = await getDb();
    const rows = await db
      .select()
      .from(signals)
      .where(status ? eq(signals.status, status) : undefined)
      .orderBy(desc(signals.detectedAt))
      .limit(150);

    return Response.json({ signals: rows });
  } catch (error) {
    return errorResponse(error, "Signals unavailable");
  }
}
