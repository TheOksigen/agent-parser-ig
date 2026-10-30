import { requireAdmin } from "@/lib/auth";
import { filters } from "@/lib/filters";
import { api, HttpError } from "@/lib/http";
import { db } from "@/lib/db";
import { jsonObject, metricKeys, metricLabels } from "@/lib/post-data";

function cell(value: string) {
  // Neutralize spreadsheet formulas while preserving newlines and Unicode.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export const GET = api(async (request) => {
  await requireAdmin(request);
  let f;
  try {
    f = filters(Object.fromEntries(new URL(request.url).searchParams));
  } catch (e) {
    throw new HttpError(400, "DATES", (e as Error).message);
  }
  const encoder = new TextEncoder();
  let cursor: string | undefined;
  let initial = true;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        if (initial) {
          controller.enqueue(
            encoder.encode(
              "\uFEFF" +
                [
                  "Profillər",
                  "Əsas müəllif",
                  "Collab iştirakçıları",
                  "Instagram linki",
                  "Tarix (UTC)",
                  "Tam təsvir",
                  "Hashtag-lər",
                  "Yoxlanılıb (UTC)",
                  "Instagram ID",
                  "Media növü",
                  ...metricKeys.map((key) => metricLabels[key]),
                  "Şərh sayının mənbəyi, dəqiqliyi və yoxlama vaxtı (JSON)",
                  "Əlavə post məlumatları (JSON)",
                ]
                  .map(cell)
                  .join(",") +
                "\r\n",
            ),
          );
          initial = false;
        }
        const posts = await db.post.findMany({
          where: f.where,
          include: {
            profileLinks: {
              include: { profile: { select: { username: true } } },
            },
          },
          orderBy: { id: "asc" },
          take: 500,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (!posts.length) {
          controller.close();
          return;
        }
        controller.enqueue(
          encoder.encode(
            posts
              .map((p) =>
                [
                  p.profileLinks
                    .map((link) => link.profile.username)
                    .sort()
                    .join(", "),
                  p.authorUsername ?? "",
                  p.collaboratorUsernames.join(", "),
                  p.permalink,
                  p.publishedAt.toISOString(),
                  p.caption,
                  p.hashtags.join(" "),
                  p.checkedAt.toISOString(),
                  p.instagramId ?? "",
                  p.mediaType ?? "",
                  ...metricKeys.map((key) => p[key]?.toString() ?? ""),
                  jsonObject(p.metricDetails).commentCount != null
                    ? JSON.stringify({ commentCount: jsonObject(p.metricDetails).commentCount })
                    : "",
                  p.metadata ? JSON.stringify(p.metadata) : "",
                ]
                  .map(cell)
                  .join(","),
              )
              .join("\r\n") + "\r\n",
          ),
        );
        cursor = posts.at(-1)!.id;
      } catch {
        controller.error(
          new Error("CSV ixracı yarımçıq qaldı. Yenidən endirin."),
        );
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="instagram-${f.from}-${f.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
