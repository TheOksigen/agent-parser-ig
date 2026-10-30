import type { Prisma } from "@/generated/prisma/client";

export type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
export function bakuDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function dayStart(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Tarix formatı düzgün deyil.");
  const d = new Date(`${value}T00:00:00+04:00`);
  if (!Number.isFinite(d.getTime()) || bakuDay(d) !== value)
    throw new Error("Tarix düzgün deyil.");
  return d;
}
export function dateRange(from: string, to: string) {
  const start = dayStart(from);
  const end = new Date(dayStart(to).getTime() + 86400000);
  if (start >= end)
    throw new Error("Başlanğıc tarixi bitiş tarixindən sonra ola bilməz.");
  if (
    start < new Date("2010-01-01T00:00:00+04:00") ||
    dayStart(to) > dayStart(bakuDay())
  )
    throw new Error("2010-cu ildən bu günə qədər tarix seçin.");
  return { from: start, until: end };
}
export function filters(params: Params) {
  const to = one(params.to) || bakuDay();
  const from =
    one(params.from) || bakuDay(new Date(Date.now() - 30 * 86400000));
  const profile = one(params.profile)
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .slice(0, 30);
  const exact = one(params.exact) === "1";
  const page = Math.min(
    100000,
    Math.max(1, Number.parseInt(one(params.page), 10) || 1),
  );
  const range = dateRange(from, to);
  const where: Prisma.PostWhereInput = {
    publishedAt: { gte: range.from, lt: range.until },
    ...(profile
      ? {
          profileLinks: {
            some: {
              profile: { username: exact ? { equals: profile, mode: "insensitive" } : { contains: profile, mode: "insensitive" } },
            },
          },
        }
      : {}),
  };
  return { from, to, profile, exact, page, range, where };
}
export function queryString(values: {
  from: string;
  to: string;
  profile: string;
  exact?: string;
  page?: number;
}) {
  const p = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value) p.set(key, String(value));
  });
  return p.toString();
}
export function dateTime(value: Date | string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("az-AZ", {
    timeZone: "Asia/Baku",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
