import type { Post } from "@/generated/prisma/client";
import { dateTime } from "./filters";
import { jsonObject, metricKeys, metricLabels, metricText } from "./post-data";

export function postView(post: Post) {
  const metadata = jsonObject(post.metadata);
  const location = jsonObject(metadata.location ?? null);
  const extra: [string, string][] = [];
  const add = (label: string, value: unknown) => {
    if (typeof value === "string" || typeof value === "number")
      extra.push([label, String(value)]);
  };
  add("Instagram ID", post.instagramId);
  add(
    "Növ",
    post.mediaType &&
      (
        {
          image: "Şəkil",
          video: "Video / Reel",
          carousel: "Karusel",
          unknown: "Müəyyən edilməyib",
        } as Record<string, string>
      )[post.mediaType],
  );
  add("Media sayı", metadata.mediaCount);
  add("Məkan", location.name);
  add("Media təsviri", metadata.altText);
  if (Array.isArray(metadata.taggedUsers) && metadata.taggedUsers.length)
    add("Etiketlənənlər", metadata.taggedUsers.join(", "));
  return {
    id: post.id,
    permalink: post.permalink,
    caption: post.caption,
    hashtags: post.hashtags,
    publishedAt: post.publishedAt.toISOString(),
    checkedAt: post.checkedAt.toISOString(),
    publishedLabel: dateTime(post.publishedAt),
    checkedLabel: dateTime(post.checkedAt),
    authors: [
      ...new Set(
        [post.authorUsername, ...post.collaboratorUsernames].filter(
          (name): name is string => Boolean(name),
        ),
      ),
    ],
    metrics: metricKeys.map((key) => {
      const detail = jsonObject(jsonObject(post.metricDetails)[key] ?? null);
      return {
        key,
        label: metricLabels[key],
        value: metricText(post[key], detail),
        title:
          typeof detail.checkedAt === "string"
            ? `Yoxlanılıb: ${dateTime(detail.checkedAt)}${detail.approximate ? " · Yuvarlaqlaşdırılmış say" : ""}`
            : "Instagram bu sayı təqdim etməyib",
      };
    }),
    extra,
  };
}
export type PostView = ReturnType<typeof postView>;
