/** Cloudflare Worker entry point. */
import handler from "vinext/server/app-router-entry";
import { runCampaignMonitor } from "@/lib/campaign-monitor-sync";
import { refreshPipeline } from "@/lib/pipeline-sync";

const PIPELINE_CRON = "0 */6 * * *";

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
