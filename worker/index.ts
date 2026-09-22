/** Cloudflare Worker entry point. */
import handler from "vinext/server/app-router-entry";
import { runCampaignMonitor } from "@/lib/campaign-monitor-sync";
import { analyzePendingSignals } from "@/lib/opportunity-engine";
import { refreshPipeline } from "@/lib/pipeline-sync";
import { runRadarScan } from "@/lib/radar/radar-sync";

const PIPELINE_CRON = "0 */6 * * *";
// Fires every 10 minutes -- always-on monitoring (section 1), not a fixed
// few-times-a-day schedule. Each tick only actually runs the providers that
// are due per their own scanFrequencyMinutes (see lib/radar/radar-sync.ts),
// so this being frequent doesn't mean every source gets hit every 10
// minutes -- it means the fastest-tier sources (news, 30 min) never wait
// longer than one extra tick past their own cadence.
const RADAR_CRON = "*/10 * * * *";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  MEDIA: R2Bucket;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/media/")) {
      return serveMedia(request, env, url.pathname.slice("/media/".length));
    }

    return handler.fetch(request, env, ctx);
  },

  async scheduled(event: ScheduledController, _env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === PIPELINE_CRON) {
      ctx.waitUntil(refreshPipeline().catch(() => {}));
    } else if (event.cron === RADAR_CRON) {
      // Collect first, then analyze whatever passed the free cheap filter --
      // kept as two steps in the same run so a scan never blocks on AI calls
      // for signals it hasn't even deduped yet.
      ctx.waitUntil(
        runRadarScan()
          .then(() => analyzePendingSignals())
          .catch(() => {})
      );
    } else {
      ctx.waitUntil(runCampaignMonitor().catch(() => {}));
    }
  },
};

async function serveMedia(request: Request, env: Env, key: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!key) return new Response("Not found", { status: 404 });

  const object = await env.MEDIA.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");

  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

export default worker;
