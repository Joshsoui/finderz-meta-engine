/** sourceUrl is the natural dedupe key (same article re-fetched across scans); falls back to a hash of provider+title+publishedAt for the rare signal with no URL (e.g. a computed CBS trend signal). */
export async function buildDedupeKey(provider: string, title: string, sourceUrl: string | undefined, publishedAt: string | undefined): Promise<string> {
  if (sourceUrl) return sourceUrl;

  const raw = `${provider}::${title}::${publishedAt ?? ""}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `hash:${hex}`;
}
