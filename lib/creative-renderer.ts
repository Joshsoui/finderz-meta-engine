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
  usps: [string, string, string];
  backgroundImage?: string;
  logoImage?: string;
};

const HEADLINE_FONT = '"Baloo 2", Arial, sans-serif';
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
    // Baloo 2 could not be loaded; canvas text falls back to Arial.
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

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
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
    const radius = Math.max(drawWidth, drawHeight) * 0.85;
    const vignette = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
    vignette.addColorStop(0, "rgba(0,8,14,0.5)");
    vignette.addColorStop(0.7, "rgba(0,8,14,0.2)");
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

// --- Title banner (full-width blue band with job title + location) ---

type BannerMetrics = { height: number; titleSize: number; locationSize: number; vPad: number; gap: number };

function measureBanner(width: number, pad: number, base: number): BannerMetrics {
  const titleSize = Math.round(Math.max(24, base * 0.048));
  const locationSize = Math.round(Math.max(16, base * 0.027));
  const vPad = Math.round(base * 0.028);
  const gap = Math.round(base * 0.01);
  return { height: vPad * 2 + titleSize + gap + locationSize, titleSize, locationSize, vPad, gap };
}

function drawBannerAt(context: CanvasRenderingContext2D, data: CreativeData, width: number, pad: number, metrics: BannerMetrics, top: number) {
  context.fillStyle = "#0d6fa3";
  context.fillRect(0, top, width, metrics.height);

  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillStyle = "#ffffff";
  context.font = `800 ${metrics.titleSize}px ${HEADLINE_FONT}`;
  context.fillText(data.title, pad, top + metrics.vPad, width - pad * 2);

  context.font = `600 ${metrics.locationSize}px ${HEADLINE_FONT}`;
  context.fillText(data.location, pad, top + metrics.vPad + metrics.titleSize + metrics.gap, width - pad * 2);
}

// --- USP glass panel (triangle-badge list) ---

type UspPanelMetrics = {
  panelX: number; panelWidth: number; panelHeight: number; innerPad: number;
  iconSize: number; uspFontSize: number; uspLineHeight: number; rowGap: number;
  uspLines: string[]; rowHeights: number[];
};

function measureUspPanel(context: CanvasRenderingContext2D, data: CreativeData, width: number, pad: number, base: number): UspPanelMetrics {
  const panelWidth = Math.round(width * 0.58);
  const panelX = width - pad - panelWidth;
  const iconSize = Math.round(base * 0.044);
  const uspFontSize = Math.round(Math.max(15, base * 0.023));
  const uspLineHeight = Math.round(uspFontSize * 1.2);
  const rowGap = Math.round(base * 0.018);
  const innerPad = Math.round(base * 0.022);
  const textWidth = panelWidth - innerPad * 2 - iconSize - Math.round(base * 0.018);

  context.font = `700 ${uspFontSize}px ${HEADLINE_FONT}`;
  // Each USP renders as a single truncated line so the panel stays compact
  // regardless of how much text a recruiter (or the AI) puts in it.
  const uspLines = data.usps.map((usp) => truncateToWidth(context, usp.trim().replace(/\s+/g, " "), textWidth));
  const rowHeights = uspLines.map(() => Math.max(iconSize, uspLineHeight));
  const panelHeight = innerPad * 2 + rowHeights.reduce((sum, h) => sum + h, 0) + rowGap * (rowHeights.length - 1);

  return { panelX, panelWidth, panelHeight, innerPad, iconSize, uspFontSize, uspLineHeight, rowGap, uspLines, rowHeights };
}

function drawTriangleBadge(context: CanvasRenderingContext2D, x: number, y: number, size: number) {
  context.fillStyle = "rgba(255,255,255,0.16)";
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#ffffff";
  const cx = x + size / 2;
  const cy = y + size / 2;
  const triangleSize = size * 0.32;
  context.beginPath();
  context.moveTo(cx - triangleSize * 0.4, cy - triangleSize);
  context.lineTo(cx - triangleSize * 0.4, cy + triangleSize);
  context.lineTo(cx + triangleSize * 0.7, cy);
  context.closePath();
  context.fill();
}

function drawUspPanelAt(context: CanvasRenderingContext2D, metrics: UspPanelMetrics, top: number) {
  context.fillStyle = "rgba(103,153,156,0.55)"; // Finderz Keeperz brand groenblauw #67999C
  roundRect(context, metrics.panelX, top, metrics.panelWidth, metrics.panelHeight, Math.round(metrics.innerPad * 0.8));
  context.fill();

  let rowY = top + metrics.innerPad;
  context.textAlign = "left";
  context.fillStyle = "#ffffff";
  metrics.uspLines.forEach((line, index) => {
    drawTriangleBadge(context, metrics.panelX + metrics.innerPad, rowY, metrics.iconSize);
    context.font = `700 ${metrics.uspFontSize}px ${HEADLINE_FONT}`;
    context.textBaseline = "middle";
    const textX = metrics.panelX + metrics.innerPad + metrics.iconSize + Math.round(metrics.innerPad * 0.6);
    const rowHeight = metrics.rowHeights[index];
    context.fillText(line, textX, rowY + rowHeight / 2 + 1);
    rowY += rowHeight + metrics.rowGap;
  });
}

// --- CTA pill ---

type CtaMetrics = { width: number; height: number; fontSize: number };

function measureCta(context: CanvasRenderingContext2D, base: number): CtaMetrics {
  const fontSize = Math.round(Math.max(16, base * 0.026));
  context.font = `800 ${fontSize}px ${HEADLINE_FONT}`;
  const textWidth = context.measureText(CTA_TEXT).width;
  const hPad = Math.round(base * 0.045);
  const vPad = Math.round(base * 0.02);
  return { width: textWidth + hPad * 2, height: fontSize + vPad * 2, fontSize };
}

function drawCtaAt(context: CanvasRenderingContext2D, width: number, metrics: CtaMetrics, top: number) {
  const pillX = (width - metrics.width) / 2;

  context.fillStyle = "#0a3d5c";
  roundRect(context, pillX, top, metrics.width, metrics.height, metrics.height / 2);
  context.fill();

  context.font = `800 ${metrics.fontSize}px ${HEADLINE_FONT}`;
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(CTA_TEXT, width / 2, top + metrics.height / 2 + 1);
}

// --- Headline hook ---

function drawHeadline(context: CanvasRenderingContext2D, data: CreativeData, width: number, pad: number, base: number, top: number, maxBottom: number) {
  let fontSize = Math.round(Math.max(26, base * 0.052));
  context.textAlign = "left";
  context.textBaseline = "top";
  const maxWidth = width - pad * 2;

  let lines: string[];
  let lineHeight: number;
  // Shrink the headline until two lines fit in the space above the bottom cluster.
  do {
    context.font = `800 ${fontSize}px ${HEADLINE_FONT}`;
    lines = wrapLines(context, data.headline, maxWidth, 2);
    lineHeight = Math.round(fontSize * 1.1);
    fontSize -= 2;
  } while (top + lines.length * lineHeight > maxBottom && fontSize > 18);

  context.shadowColor = "rgba(0,8,14,0.4)";
  context.shadowBlur = Math.round(lineHeight * 0.3);
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

  const topScrim = context.createLinearGradient(0, 0, 0, height * 0.32);
  topScrim.addColorStop(0, "rgba(0,10,18,0.5)");
  topScrim.addColorStop(1, "rgba(0,10,18,0)");
  context.fillStyle = topScrim;
  context.fillRect(0, 0, width, height * 0.32);

  const base = Math.min(width, height);
  const pad = Math.round(width * 0.055);
  const gap = Math.round(base * 0.022);
  const bottomMargin = Math.round(base * 0.045);

  // Measure the bottom cluster (CTA, USP panel, banner) first, then stack it
  // upward from the bottom edge so it always fits regardless of aspect ratio.
  const ctaMetrics = measureCta(context, base);
  const panelMetrics = measureUspPanel(context, data, width, pad, base);
  const bannerMetrics = measureBanner(width, pad, base);

  const ctaTop = height - bottomMargin - ctaMetrics.height;
  const panelTop = ctaTop - gap - panelMetrics.panelHeight;
  const bannerTop = panelTop - gap - bannerMetrics.height;

  const logoBottom = await drawLogo(context, data, width, base);
  const headlineTop = Math.max(Math.round(height * 0.075), logoBottom + Math.round(base * 0.015));
  drawHeadline(context, data, width, pad, base, headlineTop, bannerTop - gap);

  drawBannerAt(context, data, width, pad, bannerMetrics, bannerTop);
  drawUspPanelAt(context, panelMetrics, panelTop);
  drawCtaAt(context, width, ctaMetrics, ctaTop);

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
