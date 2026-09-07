/** Logs the real error server-side and returns a safe, generic message to the client. */
export function errorResponse(error: unknown, fallbackMessage: string, status = 500): Response {
  console.error(fallbackMessage, error);
  return Response.json({ error: fallbackMessage }, { status });
}
