export type CreativeFormat = "1:1" | "1.91:1" | "9:16";

export const CREATIVE_DIMENSIONS: Record<CreativeFormat, { width: number; height: number; label: string }> = {
  "1:1": { width: 1080, height: 1080, label: "Feed 1080 × 1080" },
  "1.91:1": { width: 1200, height: 628, label: "Landscape 1200 × 628" },
  "9:16": { width: 1080, height: 1920, label: "Story 1080 × 1920" },
};

export type CreativeData = {
  title: string;
  location: string;
  usps: [string, string, string];
  backgroundImage?: string;
  logoImage?: string;
};

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

function drawFallbackBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#15384a");
  gradient.addColorStop(0.55, "#08131d");
  gradient.addColorStop(1, "#0b3044");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

async function drawLogo(context: CanvasRenderingContext2D, data: CreativeData, width: number, height: number) {
  const pad = Math.round(width * 0.055);
  if (data.logoImage) {
    try {
      const logo = await loadImage(data.logoImage);
      const maxWidth = width * 0.24;
      const maxHeight = height * 0.075;
      const scale = Math.min(maxWidth / logo.naturalWidth, maxHeight / logo.naturalHeight);
      const drawWidth = logo.naturalWidth * scale;
      const drawHeight = logo.naturalHeight * scale;
      context.drawImage(logo, width - pad - drawWidth, pad, drawWidth, drawHeight);
      return;
    } catch {
      // Fall back to the built-in Finderz wordmark.
    }
  }

  const symbol = Math.max(44, Math.round(Math.min(width, height) * 0.07));
  const x = width - pad - symbol;
  const y = pad;
  context.fillStyle = "#006192";
  roundRect(context, x, y, symbol, symbol, symbol * 0.22);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = `900 ${Math.round(symbol * 0.5)}px Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("F", x + symbol / 2, y + symbol / 2 + 1);
  context.textAlign = "right";
  context.textBaseline = "alphabetic";
  context.font = `900 ${Math.round(symbol * 0.28)}px Arial, sans-serif`;
  context.fillText("FINDERZ", x - symbol * 0.16, y + symbol * 0.43);
  context.fillStyle = "#9ed5db";
  context.font = `700 ${Math.round(symbol * 0.19)}px Arial, sans-serif`;
  context.fillText("KEEPERZ", x - symbol * 0.16, y + symbol * 0.74);
}

export async function renderCreative(data: CreativeData, format: CreativeFormat) {
  const { width, height } = CREATIVE_DIMENSIONS[format];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas wordt niet ondersteund");

  if (data.backgroundImage) {
    try {
      drawCover(context, await loadImage(data.backgroundImage), width, height);
    } catch {
      drawFallbackBackground(context, width, height);
    }
  } else {
    drawFallbackBackground(context, width, height);
  }

  const shade = context.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, "rgba(0,30,46,0.10)");
  shade.addColorStop(0.45, "rgba(0,30,46,0.30)");
  shade.addColorStop(1, "rgba(0,18,29,0.94)");
  context.fillStyle = shade;
  context.fillRect(0, 0, width, height);

  const sideShade = context.createLinearGradient(0, 0, width * 0.75, 0);
  sideShade.addColorStop(0, "rgba(0,48,73,0.56)");
  sideShade.addColorStop(1, "rgba(0,48,73,0)");
  context.fillStyle = sideShade;
  context.fillRect(0, 0, width, height);

  await drawLogo(context, data, width, height);

  const base = Math.min(width, height);
  const pad = Math.round(width * 0.055);
  const ctaHeight = Math.round(Math.max(72, height * 0.095));
  const uspHeight = Math.round(Math.max(49, base * 0.066));
  const uspGap = Math.round(base * 0.012);
  const titleSize = Math.round(Math.max(42, base * (format === "1.91:1" ? 0.078 : 0.068)));
  const locationSize = Math.round(Math.max(20, base * 0.026));
  const titleLineHeight = Math.round(titleSize * 1.02);
  const titleLines = 2;
  const contentHeight = 34 + titleLineHeight * titleLines + 22 + (uspHeight * 3 + uspGap * 2);
  const contentTop = Math.max(height * 0.36, height - ctaHeight - pad * 0.7 - contentHeight);

  context.textAlign = "left";
  context.textBaseline = "middle";
  context.font = `800 ${locationSize}px Arial, sans-serif`;
  const location = data.location.toUpperCase();
  const locationWidth = context.measureText(location).width + locationSize * 1.5;
  context.fillStyle = "rgba(0,97,146,0.78)";
  roundRect(context, pad, contentTop, locationWidth, locationSize * 1.75, locationSize * 0.6);
  context.fill();
  context.fillStyle = "#ffffff";
  context.fillText(location, pad + locationSize * 0.72, contentTop + locationSize * 0.9);

  context.font = `900 ${titleSize}px Arial, sans-serif`;
  context.textBaseline = "top";
  const lines = wrapLines(context, data.title, width - pad * 2, titleLines);
  const titleY = contentTop + locationSize * 2.15;
  lines.forEach((line, index) => context.fillText(line, pad, titleY + index * titleLineHeight));

  let uspY = titleY + titleLineHeight * titleLines + base * 0.02;
  context.font = `700 ${Math.round(Math.max(19, base * 0.025))}px Arial, sans-serif`;
  context.textBaseline = "middle";
  data.usps.forEach((usp, index) => {
    const textWidth = Math.min(context.measureText(usp).width + uspHeight * 1.45, width * 0.82);
    const barWidth = Math.max(width * (0.54 + index * 0.055), textWidth);
    context.fillStyle = index === 0 ? "rgba(0,97,146,0.84)" : "rgba(0,48,73,0.76)";
    context.fillRect(0, uspY, barWidth, uspHeight);
    context.fillStyle = "#66c7df";
    context.beginPath();
    context.arc(pad, uspY + uspHeight / 2, uspHeight * 0.14, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffffff";
    context.fillText(usp, pad + uspHeight * 0.34, uspY + uspHeight / 2 + 1, barWidth - pad - uspHeight * 0.5);
    uspY += uspHeight + uspGap;
  });

  const ctaY = height - ctaHeight;
  context.fillStyle = "#006192";
  context.fillRect(0, ctaY, width, ctaHeight);
  context.fillStyle = "#ffffff";
  context.font = `900 ${Math.round(Math.max(24, base * 0.035))}px Arial, sans-serif`;
  context.textBaseline = "middle";
  context.fillText("SOLLICITEER NU", pad, ctaY + ctaHeight / 2);
  context.textAlign = "right";
  context.font = `700 ${Math.round(Math.max(18, base * 0.024))}px Arial, sans-serif`;
  context.fillText("FINDERZ KEEPERZ  →", width - pad, ctaY + ctaHeight / 2);

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
