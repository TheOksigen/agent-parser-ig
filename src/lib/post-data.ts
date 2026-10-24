import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

export const metricLabels = {
  likeCount: "Bəyənmə",
  commentCount: "Şərh",
  viewCount: "Baxış",
  playCount: "Oynatma",
  shareCount: "Paylaşma",
  repostCount: "Repost",
  saveCount: "Yadda saxlama",
} as const;
export type MetricKey = keyof typeof metricLabels;
export const metricKeys = Object.keys(metricLabels) as MetricKey[];

const observation = z.object({
  value: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  approximate: z.boolean().default(false),
  source: z.enum(["embedded_json", "dom"]),
  label: z.string().max(160).optional(),
});
export const metricsSchema = z.object({
  likeCount: observation.optional(),
  commentCount: observation.optional(),
  viewCount: observation.optional(),
  playCount: observation.optional(),
  shareCount: observation.optional(),
  repostCount: observation.optional(),
  saveCount: observation.optional(),
});
const publicUrl = z
  .string()
  .url()
  .max(4096)
  .refine((v) => v.startsWith("https://"));
const media = z.object({
  id: z.string().max(100).optional(),
  type: z.enum(["image", "video", "carousel", "unknown"]).optional(),
  width: z.number().int().min(1).max(100000).optional(),
  height: z.number().int().min(1).max(100000).optional(),
  durationSeconds: z.number().min(0).max(86400).optional(),
  altText: z.string().max(10000).optional(),
  imageUrl: publicUrl.optional(),
  videoUrl: publicUrl.optional(),
});
export const metadataSchema = media.extend({
  mediaCount: z.number().int().min(1).max(100).optional(),
  productType: z.string().max(100).optional(),
  isPinned: z.boolean().optional(),
  isSponsored: z.boolean().optional(),
  location: z
    .object({
      id: z.string().max(100).optional(),
      name: z.string().max(500),
      slug: z.string().max(500).optional(),
    })
    .optional(),
  taggedUsers: z.array(z.string().max(30)).max(100).optional(),
  collaborators: z.array(z.string().max(30)).max(100).optional(),
  media: z.array(media).max(100).optional(),
});

export function jsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function metricText(
  value: bigint | null,
  detail: Prisma.JsonValue | undefined,
  locale = true,
) {
  if (value === null) return locale ? "—" : "";
  const approximate = jsonObject(detail ?? null).approximate === true;
  return `${approximate ? "≈" : ""}${locale ? value.toLocaleString("az-AZ") : value.toString()}`;
}
