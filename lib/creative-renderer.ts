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
const STAT_LABEL = "SALARIS";

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

    // Keep the logo's own transparent background (no visible badge), but back
    // it with a soft edgeless vignette so it stays legible even on light or
    // busy parts of the photo -- a drop shadow alone isn't enough contrast
    // insurance for the lighter teal half of the wordmark.
    const cx = logoX + drawWidth / 2;
    const cy = logoY + drawHeight / 2;
    const radius = Math.max(drawWidth, drawHeight) * 0.8;
    const vignette = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
    vignette.addColorStop(0, "rgba(0,8,14,0.4)");
    vignette.addColorStop(0.7, "rgba(0,8,14,0.15)");
    vignette.addColorStop(1, "rgba(0,8,14,0)");
    context.fillStyle = vignette;
    context.fillRect(logoX - radius, logoY - radius, drawWidth + radius * 2, drawHeight + radius * 2);

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
// right so it reads as a floating strip rather than a full-bleed bar. ---

type BannerMetrics = { width: number; height: number; radius: number; titleSize: number; locationSize: number; vPad: number; gap: number };

function measureBanner(width: number, pad: number, base: number): BannerMetrics {
  const titleSize = Math.round(Math.max(24, base * 0.048));
  const locationSize = Math.round(Math.max(16, base * 0.027));
  const vPad = Math.round(base * 0.028);
  const gap = Math.round(base * 0.01);
  return {
    width: Math.round(width * 0.84),
    height: vPad * 2 + titleSize + gap + locationSize,
    radius: Math.round(base * 0.03),
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

// --- Salary stat callout: a bold "SALARIS" card, right-aligned, replacing a
// bulleted USP list with one strong hook (the first USP is always salary). ---

type StatMetrics = { boxX: number; boxWidth: number; boxHeight: number; innerPad: number; labelSize: number; valueLines: string[]; valueSize: number; valueLineHeight: number };

function measureStatCallout(context: CanvasRenderingContext2D, data: CreativeData, width: number, pad: number, base: number): StatMetrics {
  const boxWidth = Math.round(width * 0.42);
  const boxX = width - pad - boxWidth;
  const innerPad = Math.round(base * 0.026);
  const labelSize = Math.round(Math.max(13, base * 0.021));
  const textWidth = boxWidth - innerPad * 2;
  const value = data.usps[0].trim().replace(/\s+/g, " ");

  let valueSize = Math.round(Math.max(24, base * 0.062));
  let valueLines: string[];
  let valueLineHeight: number;
  do {
    context.font = `800 ${valueSize}px ${HEADLINE_FONT}`;
    valueLines = wrapLines(context, value, textWidth, 2);
    valueLineHeight = Math.round(valueSize * 1.05);
    valueSize -= 2;
  } while (valueLines.some((line) => context.measureText(line).width > textWidth) && valueSize > 16);

  const labelGap = Math.round(base * 0.012);
  const boxHeight = innerPad * 2 + labelSize + labelGap + valueLines.length * valueLineHeight;

  return { boxX, boxWidth, boxHeight, innerPad, labelSize, valueLines, valueSize: valueSize + 2, valueLineHeight };
}

function drawStatCalloutAt(context: CanvasRenderingContext2D, metrics: StatMetrics, base: number, top: number) {
  context.fillStyle = "rgba(103,153,156,0.92)"; // Finderz Keeperz brand groenblauw #67999C
  roundRectPath(context, metrics.boxX, top, metrics.boxWidth, metrics.boxHeight, Math.round(base * 0.022));
  context.fill();

  const textX = metrics.boxX + metrics.innerPad;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillStyle = "#062434";
  context.font = `800 ${metrics.labelSize}px ${HEADLINE_FONT}`;
  context.fillText(STAT_LABEL, textX, top + metrics.innerPad, metrics.boxWidth - metrics.innerPad * 2);

  let lineY = top + metrics.innerPad + metrics.labelSize + Math.round(base * 0.012);
  context.font = `800 ${metrics.valueSize}px ${HEADLINE_FONT}`;
  metrics.valueLines.forEach((line) => {
    context.fillText(line, textX, lineY, metrics.boxWidth - metrics.innerPad * 2);
    lineY += metrics.valueLineHeight;
  });
}

// --- CTA pill: small, translucent, left-aligned (not centered) ---

type CtaMetrics = { width: number; height: number; fontSize: number };

function measureCta(context: CanvasRenderingContext2D, base: number): CtaMetrics {
  const fontSize = Math.round(Math.max(14, base * 0.022));
  context.font = `800 ${fontSize}px ${HEADLINE_FONT}`;
  const textWidth = context.measureText(CTA_TEXT).width;
  const hPad = Math.round(base * 0.038);
  const vPad = Math.round(base * 0.017);
  return { width: textWidth + hPad * 2, height: fontSize + vPad * 2, fontSize };
}

function drawCtaAt(context: CanvasRenderingContext2D, pad: number, metrics: CtaMetrics, top: number) {
  context.fillStyle = "rgba(10,61,92,0.82)";
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

  // Measure the bottom cluster (CTA, stat callout, banner) first, then stack
  // it upward from the bottom edge so it always fits regardless of aspect ratio.
  const ctaMetrics = measureCta(context, base);
  const statMetrics = measureStatCallout(context, data, width, pad, base);
  const bannerMetrics = measureBanner(width, pad, base);

  const ctaTop = height - bottomMargin - ctaMetrics.height;
  const statTop = ctaTop - gap - statMetrics.boxHeight;
  const bannerTop = statTop - gap - bannerMetrics.height;

  const logoBottom = await drawLogo(context, data, width, base);
  const headlineTop = Math.max(Math.round(height * 0.075), logoBottom + Math.round(base * 0.015));
  drawHeadline(context, data, width, pad, base, headlineTop, bannerTop - gap);

  drawBannerAt(context, data, pad, bannerMetrics, bannerTop);
  drawStatCalloutAt(context, statMetrics, base, statTop);
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
