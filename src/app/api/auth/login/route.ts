import { z } from "zod";
import { checkOrigin, createSession, equal, rateLimit } from "@/lib/auth";
import { api, HttpError, jsonBody } from "@/lib/http";

export const POST = api(async (request) => {
  checkOrigin(request);
  await rateLimit("admin-login", 20, 900);
  const { password } = z
    .object({ password: z.string().max(200) })
    .parse(await jsonBody(request, 1024));
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 16)
    throw new HttpError(503, "CONFIG", "Admin şifrəsi sazlanmayıb.");
  if (!equal(password, process.env.ADMIN_PASSWORD))
    throw new HttpError(401, "PASSWORD", "Şifrə yanlışdır.");
  await createSession();
  return Response.json({ ok: true });
});
