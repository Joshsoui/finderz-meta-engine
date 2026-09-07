import { getDb } from "@/db";
import { pipelineVacancies } from "@/db/schema";
import { PIPELINE_SOURCES, scrapeSource } from "@/lib/pipeline-scraper";

export async function refreshPipeline(): Promise<{ scanned: number; upserted: number; errors: string[] }> {
  const db = await getDb();
  const errors: string[] = [];
  let scanned = 0;
  let upserted = 0;

  for (const source of PIPELINE_SOURCES) {
    try {
      const vacancies = await scrapeSource(source);
      scanned += vacancies.length;
      for (const vacancy of vacancies) {
        const now = new Date().toISOString();
        await db.insert(pipelineVacancies).values({
          id: vacancy.id,
          source: vacancy.source,
          sourceUrl: vacancy.sourceUrl,
          title: vacancy.title,
          location: vacancy.location,
          employmentType: vacancy.employmentType,
          salary: vacancy.salary,
          description: vacancy.description,
          status: "new",
          firstSeenAt: now,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: pipelineVacancies.id,
          set: {
            title: vacancy.title,
            location: vacancy.location,
            employmentType: vacancy.employmentType,
            salary: vacancy.salary,
            description: vacancy.description,
            updatedAt: now,
          },
        });
        upserted += 1;
      }
    } catch (error) {
      errors.push(`${source}: ${error instanceof Error ? error.message : "onbekende fout"}`);
    }
  }

  return { scanned, upserted, errors };
}
