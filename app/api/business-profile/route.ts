import { errorResponse } from "@/lib/api-error";
import { DEFAULT_COMPANY_ID, getBusinessProfile, saveBusinessProfile, type BusinessProfile } from "@/lib/business-profile";

export async function GET() {
  try {
    const profile = await getBusinessProfile();
    return Response.json({ profile });
  } catch (error) {
    return errorResponse(error, "Bedrijfsprofiel unavailable");
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<BusinessProfile>;
    if (!body.name?.trim()) return Response.json({ error: "Bedrijfsnaam is verplicht" }, { status: 400 });

    const profile: BusinessProfile = {
      companyId: DEFAULT_COMPANY_ID,
      name: body.name.trim(),
      website: body.website?.trim() ?? "",
      industry: body.industry?.trim() ?? "",
      services: Array.isArray(body.services) ? body.services.filter(Boolean) : [],
      targetAudiences: Array.isArray(body.targetAudiences) ? body.targetAudiences.filter(Boolean) : [],
      regions: Array.isArray(body.regions) ? body.regions.filter(Boolean) : [],
      toneOfVoice: body.toneOfVoice?.trim() ?? "",
      usps: Array.isArray(body.usps) ? body.usps.filter(Boolean) : [],
      socialChannels: body.socialChannels && typeof body.socialChannels === "object" ? body.socialChannels : {},
      customerSectors: Array.isArray(body.customerSectors) ? body.customerSectors.filter(Boolean) : [],
      keywords: Array.isArray(body.keywords) ? body.keywords.filter(Boolean) : [],
    };

    await saveBusinessProfile(profile);
    return Response.json({ profile });
  } catch (error) {
    return errorResponse(error, "Bedrijfsprofiel kon niet worden opgeslagen");
  }
}
