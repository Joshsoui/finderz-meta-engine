import { errorResponse } from "@/lib/api-error";
import { generateCreativeVariant, listCreativeVariants } from "@/lib/creative-builder";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const variants = await listCreativeVariants(id);
    return Response.json({ variants });
  } catch (error) {
    return errorResponse(error, "Testvariaties konden niet worden geladen");
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await generateCreativeVariant(id);
    if (!result.variant) return Response.json({ error: result.error || "Variant kon niet worden gegenereerd" }, { status: 400 });
    return Response.json({ variant: result.variant }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Variant kon niet worden gegenereerd");
  }
}
