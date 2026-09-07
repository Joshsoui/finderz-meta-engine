export type CreativeFormat = "1:1" | "1.91:1" | "9:16";

export const CREATIVE_DIMENSIONS: Record<CreativeFormat, { width: number; height: number; label: string }> = {
  "1:1": { width: 1080, height: 1080, label: "Feed 1080 × 1080" },
  "1.91:1": { width: 1200, height: 628, label: "Landscape 1200 × 628" },
  "9:16": { width: 1080, height: 1920, label: "Story 1080 × 1920" },
};

export type CreativeData = {
  /** Short, punchy hook question shown at the top of the ad (e.g. "Toe aan een nieuwe uitdaging?"). */
  headline: string;
  title: string;
  location: string;
  /** Exactly 3 USPs; the first is always a compact salary line (e.g. "Tot € 3.200 p/m"). */
  usps: [string, string, string];
  backgroundImage?: string;
  logoImage?: string;
};

const HEADLINE_FONT = '"Plus Jakarta Sans", Arial, sans-serif';
const CTA_TEXT = "SOLLICITEER NU";

async function ensureFontsLoaded() {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  try {
    await Promise.all([
      document.fonts.load(`800 48px ${HEADLINE_FONT}`),
      document.fonts.load(`700 32px ${HEADLINE_FONT}`),
      document.fonts.load(`600 24px ${HEADLINE_FONT}`),
    ]);
    await document.fonts.ready;
  } catch {
    // Plus Jakarta Sans could not be loaded; canvas text falls back to Arial.
  }
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Afbeelding kon niet worden geladen"));
    image.src = source;
  });
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}

function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.join(" ").length < text.trim().length && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/[.,;:]?$/, "…");
  }
  return lines;
}

function roundRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number | [number, number, number, number],
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.closePath();
}

function truncateToWidth(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && context.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1).trimEnd();
  }
  return `${trimmed}…`;
}

function drawFallbackBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#15384a");
  gradient.addColorStop(0.55, "#08131d");
  gradient.addColorStop(1, "#0b3044");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

async function drawLogo(context: CanvasRenderingContext2D, data: CreativeData, width: number, base: number) {
  const pad = Math.round(width * 0.05);
  const source = data.logoImage || "/finderzkeeperz-logo.png";
  try {
    const logo = await loadImage(source);
    const maxWidth = width * 0.24;
    const maxHeight = base * 0.045;
    const scale = Math.min(maxWidth / logo.naturalWidth, maxHeight / logo.naturalHeight);
    const drawWidth = logo.naturalWidth * scale;
    const drawHeight = logo.naturalHeight * scale;
    const logoX = width - pad - drawWidth;
    const logoY = pad;

    // Fully transparent background -- just a drop shadow (follows the logo's
    // own alpha silhouette, not a filled box or vignette) for a bit of lift.
    context.save();
    context.shadowColor = "rgba(0,8,14,0.6)";
    context.shadowBlur = Math.round(base * 0.015);
    context.shadowOffsetY = 1;
    context.drawImage(logo, logoX, logoY, drawWidth, drawHeight);
    context.restore();

    return pad + drawHeight + Math.round(base * 0.015);
  } catch {
    return pad;
  }
}

// --- Title banner: translucent blue ribbon, flush left, rounded only on the
// right, sized to its own text (not a fixed width) so it reads as a snug
// floating strip rather than a bar with dead space. ---

type BannerMetrics = { width: number; height: number; radius: number; titleSize: number; locationSize: number; vPad: number; gap: number };

function measureBanner(context: CanvasRenderingContext2D, data: CreativeData, width: number, pad: number, base: number): BannerMetrics {
  const titleSize = Math.round(Math.max(24, base * 0.048));
  const locationSize = Math.round(Math.max(16, base * 0.027));
  const vPad = Math.round(base * 0.026);
  const gap = Math.round(base * 0.01);

  // A couple of pixels of slack between the measured text width and the box
  // it's given: Math.round() on the box width can land a hair under the
  // measured width, which would otherwise make drawBannerAt() think the text
  // doesn't fit and trigger truncation (chopping several characters to make
  // room for an ellipsis glyph that was never actually needed).
  const safety = Math.max(2, Math.ceil(base * 0.005));
  const maxTextWidth = width * 0.8 - pad * 2;
  context.font = `800 ${titleSize}px ${HEADLINE_FONT}`;
  const titleWidth = Math.min(context.measureText(data.title).width + safety, maxTextWidth);
  context.font = `600 ${locationSize}px ${HEADLINE_FONT}`;
  const locationWidth = Math.min(context.measureText(data.location).width + safety, maxTextWidth);

  return {
    width: Math.round(Math.max(titleWidth, locationWidth) + pad * 2),
    height: vPad * 2 + titleSize + gap + locationSize,
    radius: Math.round(base * 0.028),
    titleSize,
    locationSize,
    vPad,
    gap,
  };
}

function drawBannerAt(context: CanvasRenderingContext2D, data: CreativeData, pad: number, metrics: BannerMetrics, top: number) {
  context.fillStyle = "rgba(13,111,163,0.88)";
  roundRectPath(context, 0, top, metrics.width, metrics.height, [0, metrics.radius, metrics.radius, 0]);
  context.fill();

  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillStyle = "#ffffff";
  const textWidth = metrics.width - pad * 2;
  context.font = `800 ${metrics.titleSize}px ${HEADLINE_FONT}`;
  context.fillText(truncateToWidth(context, data.title, textWidth), pad, top + metrics.vPad, textWidth);

  context.font = `600 ${metrics.locationSize}px ${HEADLINE_FONT}`;
  context.fillText(
    truncateToWidth(context, data.location, textWidth),
    pad,
    top + metrics.vPad + metrics.titleSize + metrics.gap,
    textWidth,
  );
}

// --- USP chips: one identical card per USP, each sized to its own text,
// stacked vertically and right-aligned -- no special treatment for any one
// of them. ---

type Chip = { width: number; height: number; pad: number; value: string; valueSize: number };

function measureChip(context: CanvasRenderingContext2D, text: string, base: number, maxTextWidth: number): Chip {
  const pad = Math.round(base * 0.02);
  const valueSize = Math.round(Math.max(18, base * 0.03));
  context.font = `800 ${valueSize}px ${HEADLINE_FONT}`;
  const value = truncateToWidth(context, text.trim().replace(/\s+/g, " "), maxTextWidth);
  const valueWidth = context.measureText(value).width;
  return { width: Math.round(valueWidth + pad * 2), height: pad * 2 + valueSize, pad, value, valueSize };
}

// Finderz Keeperz brand colors: groenblauw #67999C and diepblauw #006192.
const CHIP_COLORS = ["rgba(103,153,156,0.92)", "rgba(0,97,146,0.92)", "rgba(103,153,156,0.92)"];

function drawChip(context: CanvasRenderingContext2D, chip: Chip, base: number, x: number, y: number, color: string) {
  context.fillStyle = color;
  roundRectPath(context, x, y, chip.width, chip.height, Math.round(base * 0.018));
  context.fill();

  context.textAlign = "left";
  context.textBaseline = "top";
  context.shadowColor = "rgba(0,8,14,0.35)";
  context.shadowBlur = Math.round(base * 0.006);
  context.shadowOffsetY = 1;
  context.fillStyle = "#ffffff";
  context.font = `800 ${chip.valueSize}px ${HEADLINE_FONT}`;
  context.fillText(chip.value, x + chip.pad, y + chip.pad);
  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
}

type ChipsBlockMetrics = { chips: Chip[]; totalHeight: number; rowGap: number };

function measureChipsBlock(context: CanvasRenderingContext2D, data: CreativeData, width: number, pad: number, base: number): ChipsBlockMetrics {
  const maxTextWidth = (width - pad * 2) * 0.62;
  const chips = data.usps.map((usp) => measureChip(context, usp, base, maxTextWidth));
  const rowGap = Math.round(base * 0.014);
  const totalHeight = chips.reduce((sum, chip) => sum + chip.height, 0) + rowGap * (chips.length - 1);
  return { chips, totalHeight, rowGap };
}

function drawChipsBlockAt(context: CanvasRenderingContext2D, metrics: ChipsBlockMetrics, base: number, width: number, pad: number, top: number) {
  let y = top;
  metrics.chips.forEach((chip, index) => {
    drawChip(context, chip, base, width - pad - chip.width, y, CHIP_COLORS[index % CHIP_COLORS.length]);
    y += chip.height + metrics.rowGap;
  });
}

// --- CTA pill: small, translucent, left-aligned (not centered), sized snugly
// around its own text. ---

type CtaMetrics = { width: number; height: number; fontSize: number };

function measureCta(context: CanvasRenderingContext2D, base: number): CtaMetrics {
  const fontSize = Math.round(Math.max(14, base * 0.021));
  context.font = `800 ${fontSize}px ${HEADLINE_FONT}`;
  const textWidth = context.measureText(CTA_TEXT).width;
  const hPad = Math.round(base * 0.028);
  const vPad = Math.round(base * 0.013);
  return { width: textWidth + hPad * 2, height: fontSize + vPad * 2, fontSize };
}

function drawCtaAt(context: CanvasRenderingContext2D, pad: number, metrics: CtaMetrics, top: number) {
  context.fillStyle = "rgba(0,97,146,0.9)"; // Finderz Keeperz brand diepblauw #006192
  roundRectPath(context, pad, top, metrics.width, metrics.height, metrics.height / 2);
  context.fill();

  context.font = `800 ${metrics.fontSize}px ${HEADLINE_FONT}`;
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(CTA_TEXT, pad + metrics.width / 2, top + metrics.height / 2 + 1);
}

// --- Headline hook: large, editorial, no banner behind it ---

function drawHeadline(context: CanvasRenderingContext2D, data: CreativeData, width: number, pad: number, base: number, top: number, maxBottom: number) {
  let fontSize = Math.round(Math.max(32, base * 0.09));
  context.textAlign = "left";
  context.textBaseline = "top";
  const maxWidth = width - pad * 2;

  let lines: string[];
  let lineHeight: number;
  // Shrink the headline until two lines fit in the space above the bottom cluster.
  do {
    context.font = `800 ${fontSize}px ${HEADLINE_FONT}`;
    lines = wrapLines(context, data.headline, maxWidth, 2);
    lineHeight = Math.round(fontSize * 1.05);
    fontSize -= 2;
    // Keep shrinking while the 2 lines don't vertically fit, OR while wrapLines
    // had to drop words to stay within 2 lines (visible as a trailing "…") --
    // a large headline can technically "fit" 2 lines while silently truncating
    // the second one, which isn't an acceptable outcome for a short hook headline.
  } while ((top + lines.length * lineHeight > maxBottom || lines[lines.length - 1]?.endsWith("…")) && fontSize > 16);

  context.shadowColor = "rgba(0,8,14,0.55)";
  context.shadowBlur = Math.round(lineHeight * 0.35);
  context.shadowOffsetY = 2;
  context.fillStyle = "#ffffff";
  lines.forEach((line, index) => context.fillText(line, pad, top + index * lineHeight));
  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
}

export async function renderCreative(data: CreativeData, format: CreativeFormat) {
  const { width, height } = CREATIVE_DIMENSIONS[format];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas wordt niet ondersteund");

  await ensureFontsLoaded();

  if (data.backgroundImage) {
    try {
      drawCover(context, await loadImage(data.backgroundImage), width, height);
    } catch {
      drawFallbackBackground(context, width, height);
    }
  } else {
    drawFallbackBackground(context, width, height);
  }

  // A light, short scrim -- just enough contrast insurance for a bright photo
  // -- instead of a heavy full-width shaded band; the headline's own drop
  // shadow carries most of the legibility work so the photo stays visible.
  const topScrim = context.createLinearGradient(0, 0, 0, height * 0.22);
  topScrim.addColorStop(0, "rgba(0,10,18,0.32)");
  topScrim.addColorStop(1, "rgba(0,10,18,0)");
  context.fillStyle = topScrim;
  context.fillRect(0, 0, width, height * 0.22);

  const base = Math.min(width, height);
  const pad = Math.round(width * 0.055);
  const gap = Math.round(base * 0.022);
  const bottomMargin = Math.round(base * 0.045);

  // Measure the bottom cluster (CTA, USP chips, banner) first, then stack it
  // upward from the bottom edge so it always fits regardless of aspect ratio.
  const ctaMetrics = measureCta(context, base);
  const chipsMetrics = measureChipsBlock(context, data, width, pad, base);
  const bannerMetrics = measureBanner(context, data, width, pad, base);

  const ctaTop = height - bottomMargin - ctaMetrics.height;
  const chipsTop = ctaTop - gap - chipsMetrics.totalHeight;
  const bannerTop = chipsTop - gap - bannerMetrics.height;

  const logoBottom = await drawLogo(context, data, width, base);
  const headlineTop = Math.max(Math.round(height * 0.075), logoBottom + Math.round(base * 0.015));
  drawHeadline(context, data, width, pad, base, headlineTop, bannerTop - gap);

  drawBannerAt(context, data, pad, bannerMetrics, bannerTop);
  drawChipsBlockAt(context, chipsMetrics, base, width, pad, chipsTop);
  drawCtaAt(context, pad, ctaMetrics, ctaTop);

  return canvas.toDataURL("image/png");
}

export async function downloadCreative(data: CreativeData, format: CreativeFormat) {
  const dataUrl = await renderCreative(data, format);
  const anchor = document.createElement("a");
  const slug = data.title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  anchor.href = dataUrl;
  anchor.download = `${slug || "vacature"}-${format.replace(":", "x").replace(".", "-")}.png`;
  anchor.click();
}
