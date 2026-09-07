import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { pipelineVacancies } from "@/db/schema";
import { errorResponse } from "@/lib/api-error";

type ManualVacancyInput = {
  title?: string;
  location?: string;
  employmentType?: string;
  salary?: string;
  description?: string;
  fee?: number;
};

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.select().from(pipelineVacancies).orderBy(desc(pipelineVacancies.updatedAt)).limit(200);
    return Response.json({ vacancies: rows });
  } catch (error) {
    return errorResponse(error, "Pipeline unavailable");
  }
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as ManualVacancyInput;
    if (!input.title?.trim() || !input.description?.trim()) {
      return Response.json({ error: "Titel en omschrijving zijn verplicht" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const db = await getDb();
    const [vacancy] = await db.insert(pipelineVacancies).values({
      id: crypto.randomUUID(),
      source: "manual",
      sourceUrl: null,
      title: input.title.trim(),
      location: input.location?.trim() || "",
      employmentType: input.employmentType?.trim() || "",
      salary: input.salary?.trim() || "",
      description: input.description.trim(),
      feeCents: Number.isFinite(input.fee) && Number(input.fee) > 0 ? Math.round(Number(input.fee) * 100) : null,
      status: "new",
      firstSeenAt: now,
      updatedAt: now,
    }).returning();

    return Response.json({ vacancy }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Vacature kon niet worden toegevoegd");
  }
}
