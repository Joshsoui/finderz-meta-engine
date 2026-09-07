import { uploadMedia } from "@/lib/storage";

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export async function POST(request: Request) {
  try {
    const { dataUrl } = (await request.json()) as { dataUrl?: string };
    const match = dataUrl?.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return Response.json({ error: "A base64 image data URL is required" }, { status: 400 });

    const [, mimeType, base64] = match;
    const extension = ALLOWED_TYPES[mimeType];
    if (!extension) return Response.json({ error: "Use a PNG, JPG, WebP or SVG image" }, { status: 400 });

    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    if (bytes.byteLength > 2_000_000) {
      return Response.json({ error: "Image must be 2 MB or smaller" }, { status: 400 });
    }

    const key = `logos/${crypto.randomUUID()}.${extension}`;
    const url = await uploadMedia(key, bytes.buffer, mimeType);
    return Response.json({ url });
  } catch {
    return Response.json({ error: "Invalid upload" }, { status: 400 });
  }
}
