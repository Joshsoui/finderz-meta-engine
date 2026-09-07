import { uploadMedia } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const { dataUrl } = (await request.json()) as { dataUrl?: string };
    const match = dataUrl?.match(/^data:image\/png;base64,(.+)$/);
    if (!match) return Response.json({ error: "A base64 PNG data URL is required" }, { status: 400 });

    const [, base64] = match;
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    if (bytes.byteLength > 8_000_000) {
      return Response.json({ error: "Image must be 8 MB or smaller" }, { status: 400 });
    }

    const key = `creatives/${crypto.randomUUID()}.png`;
    const url = await uploadMedia(key, bytes.buffer, "image/png");
    return Response.json({ url });
  } catch {
    return Response.json({ error: "Invalid upload" }, { status: 400 });
  }
}
