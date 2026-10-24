import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { HttpError } from "./http";

export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export const equal = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const cookieName = "archive_session";

function sign(value: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new HttpError(503, "CONFIG", "SESSION_SECRET sazlanmayıb.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export async function isAdmin() {
  const raw = (await cookies()).get(cookieName)?.value;
  if (!raw) return false;
  const [expires, nonce, signature] = raw.split(".");
  return (
    !!signature &&
    Number(expires) > Date.now() &&
    equal(sign(`${expires}.${nonce}`), signature)
  );
}
export async function requirePageAdmin() {
  if (!(await isAdmin())) redirect("/login");
}
export async function requireAdmin(request: Request) {
  if (!(await isAdmin()))
    throw new HttpError(401, "UNAUTHORIZED", "Əvvəlcə daxil olun.");
  if (!["GET", "HEAD"].includes(request.method)) checkOrigin(request);
}
export function checkOrigin(request: Request) {
  const expected = new URL(process.env.APP_URL ?? "http://localhost:3000")
    .origin;
  if (request.headers.get("origin") !== expected)
    throw new HttpError(
      403,
      "ORIGIN",
      "Sorğu mənbəyi yanlışdır. APP_URL ünvanını yoxlayın.",
    );
}
export async function createSession() {
  const value = `${Date.now() + 12 * 60 * 60 * 1000}.${token()}`;
  (await cookies()).set(cookieName, `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE !== "false",
    path: "/",
    maxAge: 43200,
  });
}
export async function deleteSession() {
  (await cookies()).delete(cookieName);
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
) {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO instagram_parser."RateLimit" (key, count, "expiresAt")
    VALUES (${key}, 1, NOW() + ${windowSeconds} * INTERVAL '1 second')
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN instagram_parser."RateLimit"."expiresAt" < NOW() THEN 1 ELSE instagram_parser."RateLimit".count + 1 END,
      "expiresAt" = CASE WHEN instagram_parser."RateLimit"."expiresAt" < NOW() THEN NOW() + ${windowSeconds} * INTERVAL '1 second' ELSE instagram_parser."RateLimit"."expiresAt" END
    RETURNING count`;
  if (rows[0].count > limit)
    throw new HttpError(
      429,
      "RATE_LIMIT",
      "Çox sayda sorğu göndərildi. Bir qədər gözləyin.",
    );
}

export async function requireDevice(request: Request) {
  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer ") || bearer.length > 256)
    throw new HttpError(401, "DEVICE_AUTH", "Cihaz açarı tələb olunur.");
  const device = await db.device.findUnique({
    where: { tokenHash: hash(bearer.slice(7)) },
  });
  if (!device?.enabled)
    throw new HttpError(
      401,
      "DEVICE_AUTH",
      "Cihaz aktiv deyil və ya açarı yanlışdır.",
    );
  return device;
}
