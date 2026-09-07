import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

export type PipelineSource = "finderzkeeperz" | "captainrecruit";

export const PIPELINE_SOURCES: PipelineSource[] = ["finderzkeeperz", "captainrecruit"];

const SITE_CONFIG: Record<PipelineSource, { listingUrl: string; base: string }> = {
  finderzkeeperz: { listingUrl: "https://www.finderzkeeperz.nl/vacatures/", base: "https://www.finderzkeeperz.nl" },
  captainrecruit: { listingUrl: "https://www.captainrecruit.nl/vacatures/", base: "https://www.captainrecruit.nl" },
};

const USER_AGENT = "FinderzMetaEngine-PipelineBot/1.0 (+https://www.finderzkeeperz.nl)";
const EMPLOYMENT_PATTERN = /fulltime|parttime|deeltijd|voltijd|\d+\s*uur/i;

export type ScrapedVacancy = {
  id: string;
  source: PipelineSource;
  sourceUrl: string;
  title: string;
  location: string;
  employmentType: string;
  description: string;
  salary: string;
};

function slugFromUrl(url: string): string {
  const match = url.match(/\/vacatures?\/([^/]+)\/?$/);
  return (match ? match[1] : url).replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
}

/** Reads location/employment/salary from either the labeled owp-label markup or the positional vacancy-meta list, since the two sites render this differently and even inconsistently between vacancies on the same site. */
function extractMeta($: CheerioAPI, container: Cheerio<AnyNode>): { location: string; employmentType: string; salary: string } {
  const result = { location: "", employmentType: "", salary: "" };

  container.find(".owp-label[title]").each((_, element) => {
    const label = $(element).attr("title")?.toLowerCase() ?? "";
    const text = $(element).text().trim();
    if (!text) return;
    if (label.includes("regio") || label.includes("locatie")) result.location ||= text;
    else if (label.includes("salaris")) result.salary ||= text;
    else if (label.includes("dienst") || label.includes("uren")) result.employmentType ||= text;
  });

  container.find("ul.vacancy-meta li").each((_, element) => {
    const text = $(element).text().trim();
    if (!text || /gepubliceerd op/i.test(text)) return;
    if (text.includes("€")) result.salary ||= text;
    else if (EMPLOYMENT_PATTERN.test(text)) result.employmentType ||= text;
    else result.location ||= text;
  });

  return result;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${url} gaf status ${response.status}`);
  return response.text();
}

async function fetchListing(source: PipelineSource): Promise<Array<{ title: string; sourceUrl: string; location: string; employmentType: string; salary: string }>> {
  const config = SITE_CONFIG[source];
  const html = await fetchHtml(config.listingUrl);
  const $ = cheerio.load(html);
  const items: Array<{ title: string; sourceUrl: string; location: string; employmentType: string; salary: string }> = [];

  $("article.vacature-blok").each((_, element) => {
    const article = $(element);
    const href = article.find("a[href]").first().attr("href");
    const title = article.find(".vacancy-title").first().text().trim();
    if (!href || !title) return;
    const sourceUrl = href.startsWith("http") ? href : new URL(href, config.base).toString();
    items.push({ title, sourceUrl, ...extractMeta($, article) });
  });

  return items;
}

async function fetchDescription(sourceUrl: string): Promise<string> {
  const html = await fetchHtml(sourceUrl);
  const $ = cheerio.load(html);

  const candidates = [
    ".owp-heading-textField_description .vacancy-item-text",
    ".description-content",
    ".vacancy-item-text",
  ];
  for (const selector of candidates) {
    const text = $(selector).first().text().replace(/\s+/g, " ").trim();
    if (text.length > 40) return text.slice(0, 4000);
  }
  return "";
}

export async function scrapeSource(source: PipelineSource): Promise<ScrapedVacancy[]> {
  const listing = await fetchListing(source);
  const results: ScrapedVacancy[] = [];

  for (const item of listing) {
    try {
      const description = await fetchDescription(item.sourceUrl);
      results.push({
        id: `${source}-${slugFromUrl(item.sourceUrl)}`,
        source,
        sourceUrl: item.sourceUrl,
        title: item.title,
        location: item.location,
        employmentType: item.employmentType,
        description,
        salary: item.salary,
      });
    } catch {
      // Skip vacancies whose detail page fails to load this run; the next scrape retries them.
    }
  }

  return results;
}
