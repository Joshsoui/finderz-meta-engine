export async function GET() {
  return Response.json({
    configured: Boolean(
      process.env.META_ACCESS_TOKEN &&
      process.env.META_AD_ACCOUNT_ID &&
      process.env.META_PAGE_ID
    ),
    services: {
      adsManager: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID),
      leadForms: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PAGE_ID),
      imageGeneration: Boolean(process.env.OPENAI_API_KEY),
    },
    mode: process.env.META_ACCESS_TOKEN ? "connected" : "sandbox",
  });
}
