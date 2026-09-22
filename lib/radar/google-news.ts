import * as cheerio from "cheerio";
import type { NormalizedSignal } from "@/lib/radar/types";

const USER_AGENT = "FinderzMetaEngine-RadarBot/1.0 (+https://www.finderzkeeperz.nl)";

/**
 * Google News RSS needs no API key and covers most of the MVP signal
 * categories (nieuws, arbeidsmarktnieuws, recruitmentnieuws, werkgeversnieuws,
 * ontslag/reorganisatie, nieuwe vestigingen, personeelstekorten,
 * salarisontwikkelingen, wet- en regelgeving) well when queried with the
 * right search terms -- verified against the real endpoint before writing
 * this. `query` should already include any region/industry qualifiers.
 */
export async function fetchGoogleNewsRss(query: string, category: string, regions: string[]): Promise<NormalizedSignal[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=nl&gl=NL&ceid=NL:nl`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Google News RSS request failed (${response.status})`);

  const xml = await response.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const signals: NormalizedSignal[] = [];
  $("item").each((_, element) => {
    const item = $(element);
    const title = item.find("title").first().text().trim();
    const link = item.find("link").first().text().trim();
    const pubDate = item.find("pubDate").first().text().trim();
    const sourceName = item.find("source").first().text().trim() || "Google Nieuws";
    // Google's <description> is an HTML snippet (an <a> wrapping the title, sometimes with a font tag) -- strip tags for a plain-text summary.
    const descriptionHtml = item.find("description").first().text();
    const summary = cheerio.load(descriptionHtml).text().trim() || title;

    if (!title || !link) return;
    const parsedDate = pubDate ? new Date(pubDate) : null;
    signals.push({
      title,
      summary,
      source: sourceName,
      sourceUrl: link,
      publishedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : undefined,
      category,
      regions,
      companies: [],
      industries: [],
      jobCategories: [],
      keywords: [query],
      rawData: { query },
    });
  });

  return signals;
}
