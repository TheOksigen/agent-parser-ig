import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function jsonBody(
  request: Request,
  maxBytes = 1_048_576,
): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new HttpError(415, "JSON_REQUIRED", "JSON formatı tələb olunur.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "EMPTY_BODY", "Sorğu boşdur.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "BODY_TOO_LARGE", "Sorğu həddən böyükdür.");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "INVALID_JSON", "JSON formatı yanlışdır.");
  } finally {
    reader.releaseLock();
  }
}

export function api(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpError)
        return Response.json(
          { error: error.message, code: error.code },
          { status: error.status },
        );
      if (error instanceof ZodError)
        return Response.json(
          {
            error: error.issues[0]?.message ?? "Məlumat yanlışdır.",
            code: "VALIDATION",
          },
          { status: 400 },
        );
      // Never log database URLs, request bodies, pairing codes, or tokens.
      console.error("Request failed", {
        method: request.method,
        path: new URL(request.url).pathname,
        name: error instanceof Error ? error.name : "UnknownError",
        ...(error instanceof Prisma.PrismaClientKnownRequestError
          ? { code: error.code }
          : {}),
      });
      return Response.json(
        {
          error: "Sorğu tamamlanmadı. Yenidən cəhd edin.",
          code: "SERVER_ERROR",
        },
        { status: 500 },
      );
    }
  };
}
