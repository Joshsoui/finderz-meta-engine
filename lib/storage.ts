export async function uploadMedia(key: string, data: ArrayBuffer, contentType: string): Promise<string> {
  const { env } = await import("cloudflare:workers");
  if (!env.MEDIA) {
    throw new Error(
      "Cloudflare R2 binding `MEDIA` is unavailable. Add the `r2_buckets` entry to wrangler.jsonc before uploading media."
    );
  }

  await env.MEDIA.put(key, data, { httpMetadata: { contentType } });
  return `/media/${key}`;
}
