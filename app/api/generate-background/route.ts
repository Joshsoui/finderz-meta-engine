type GenerateBackgroundInput = {
  prompt?: string;
  title?: string;
  location?: string;
};

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as GenerateBackgroundInput;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "Beeldgeneratie is nog niet geconfigureerd. Voeg OPENAI_API_KEY toe aan Render." },
        { status: 503 },
      );
    }

    const prompt = input.prompt?.trim();
    if (!prompt || prompt.length > 3500) {
      return Response.json({ error: "Een geldige beeldbriefing is verplicht." }, { status: 400 });
    }

    const productionPrompt = [
      prompt,
      "Maak uitsluitend de fotografische achtergrond voor een Nederlandse recruitmentadvertentie.",
      "Fotorealistisch, geloofwaardig, modern maar niet gepolijst of kunstmatig.",
      "Plaats de medewerker rond het midden-rechts en houd links en onder voldoende rustige ruimte voor een grafische overlay.",
      "Geen tekst, letters, logo's, merknamen, watermerken, kaders of grafische blokken in de afbeelding.",
      input.title ? `Functie: ${input.title.slice(0, 120)}.` : "",
      input.location ? `Regio: ${input.location.slice(0, 120)}.` : "",
    ].filter(Boolean).join(" ");

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
        prompt: productionPrompt,
        size: "1536x1024",
        quality: "medium",
        output_format: "jpeg",
        output_compression: 88,
        moderation: "auto",
      }),
      signal: AbortSignal.timeout(120_000),
    });

    const result = (await response.json()) as {
      data?: Array<{ b64_json?: string }>;
      error?: { message?: string };
    };

    if (!response.ok || !result.data?.[0]?.b64_json) {
      const unavailable = response.status === 403 || response.status === 404;
      return Response.json(
        {
          error: unavailable
            ? "Het ingestelde beeldmodel is niet beschikbaar voor dit OpenAI-project."
            : "De achtergrond kon niet worden gegenereerd.",
        },
        { status: response.status >= 400 && response.status < 500 ? response.status : 502 },
      );
    }

    return Response.json({
      image: `data:image/jpeg;base64,${result.data[0].b64_json}`,
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return Response.json(
      { error: timedOut ? "De beeldgeneratie duurde te lang. Probeer het opnieuw." : "Ongeldige aanvraag." },
      { status: timedOut ? 504 : 400 },
    );
  }
}
