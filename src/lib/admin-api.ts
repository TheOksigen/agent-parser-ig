import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { hash, requireAdmin } from "./auth";
import { HttpError, jsonBody } from "./http";
import { activeStatuses, enqueue, enqueueJobs } from "./queue";
import { dateRange } from "./filters";

export async function handleAdmin(request: Request, action: string) {
  await requireAdmin(request);
  const raw = await jsonBody(request);
  if (action === "collection-settings") {
    const input = z
      .object({ intervalSeconds: z.number().int().min(2).max(300) })
      .parse(raw);
    const affected = await db.$transaction(async (tx) => {
      await tx.collectorSettings.upsert({
        where: { id: "collector" },
        create: { id: "collector", intervalSeconds: input.intervalSeconds },
        update: { intervalSeconds: input.intervalSeconds },
      });
      return tx.task.updateMany({
        where: { status: { in: [...activeStatuses] } },
        data: { intervalSeconds: input.intervalSeconds },
      });
    });
    return Response.json({
      message: `Interval ${input.intervalSeconds} saniyə oldu. ${affected.count} aktiv/növbədəki tapşırıq yeniləndi. Agent yeni intervalı ən gec növbəti 30 saniyəlik əlaqədə alacaq.`,
    });
  }
  if (action === "profiles") {
    const input = z
      .object({
        usernames: z.string().min(1).max(100000),
        publicConfirmed: z.literal(true),
      })
      .parse(raw);
    const names = [
      ...new Set(
        input.usernames
          .split(/[\s,;]+/)
          .filter(Boolean)
          .map((n) =>
            n
              .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "")
              .replace(/[/?].*$/, "")
              .replace(/^@/, "")
              .toLowerCase(),
          ),
      ),
    ];
    if (names.length > 1500 || names.some((n) => !/^[a-z0-9._]{1,30}$/.test(n)))
      throw new HttpError(
        400,
        "USERNAME",
        "Hər sətrə düzgün Instagram istifadəçi adı yazın (maksimum 1500).",
      );
    const result = await db.$transaction(async (tx) => {
      const created = await tx.profile.createMany({
        data: names.map((username) => ({ username, publicConfirmed: true })),
        skipDuplicates: true,
      });
      if (names.length)
        await tx.$executeRaw`
        INSERT INTO instagram_parser."PostProfile" ("postId", "profileId")
        SELECT p.id, profile.id FROM instagram_parser."Post" p
        JOIN instagram_parser."Profile" profile ON
          (profile.username = p."authorUsername" OR profile.username = ANY(p."collaboratorUsernames"))
        WHERE profile."publicConfirmed" AND profile.username IN (${Prisma.join(names)})
        ON CONFLICT DO NOTHING`;
      return created;
    });
    return Response.json({
      message: `${result.count} profil əlavə edildi.`,
      count: result.count,
    });
  }
  if (action === "profile-toggle") {
    const input = z.object({ id: z.string(), active: z.boolean() }).parse(raw);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM instagram_parser."Profile" WHERE id = ${input.id} FOR UPDATE`;
      await tx.profile.update({
        where: { id: input.id },
        data: {
          active: input.active,
          ...(input.active ? { nextRunAt: new Date() } : {}),
        },
      });
      if (!input.active)
        await tx.task.updateMany({
          where: { profileId: input.id, status: { in: [...activeStatuses] } },
          data: {
            status: "CANCELLED",
            leaseToken: null,
            leaseExpiresAt: null,
            finishedAt: new Date(),
            message: "Profil dayandırıldı.",
          },
        });
    });
    return Response.json({
      message: input.active
        ? "Profil aktivləşdirildi."
        : "Profil dayandırıldı; arxiv saxlanıldı.",
    });
  }
  if (action === "collect") {
    const input = z
      .object({
        from: z.string(),
        to: z.string(),
        profile: z.string().max(30).default(""),
      })
      .parse(raw);
    let range;
    try {
      range = dateRange(input.from, input.to);
    } catch (e) {
      throw new HttpError(400, "DATES", (e as Error).message);
    }
    const profiles = await db.profile.findMany({
      where: {
        active: true,
        ...(input.profile
          ? {
              username: {
                contains: input.profile.replace(/^@/, "").toLowerCase(),
              },
            }
          : {}),
      },
      take: 1500,
    });
    const result = await enqueueJobs(
      profiles.map((p) => ({ profileId: p.id, ...range, reason: "SEARCH" })),
      true,
    );
    return Response.json({
      ...result,
      message: `${result.queued} tapşırıq yaradıldı. ${result.replaced} əvvəlki tapşırıq yeni tarixlə əvəz edildi; ${result.reused} tapşırıq artıq bu tarixlər üzrə işləyir.`,
    });
  }
  if (action === "pairing") {
    const code = randomBytes(8).toString("hex").toUpperCase();
    await db.pairing.create({
      data: {
        codeHash: hash(code),
        expiresAt: new Date(Date.now() + 15 * 60000),
      },
    });
    return Response.json({
      code: code.match(/.{1,4}/g)!.join("-"),
      message: "Kod 15 dəqiqə ərzində bir cihaz üçün keçərlidir.",
    });
  }
  if (action === "device-toggle") {
    const input = z.object({ id: z.string(), enabled: z.boolean() }).parse(raw);
    await db.$transaction(async (tx) => {
      await tx.device.update({
        where: { id: input.id },
        data: { enabled: input.enabled },
      });
      if (!input.enabled)
        await tx.task.updateMany({
          where: {
            deviceId: input.id,
            status: { in: ["RUNNING", "WAITING_USER"] },
          },
          data: {
            status: "QUEUED",
            deviceId: null,
            leaseToken: null,
            leaseExpiresAt: null,
            availableAt: new Date(),
            message: "Cihaz dayandırıldı; başqa cihaz davam edə bilər.",
          },
        });
    });
    return Response.json({ message: "Cihazın vəziyyəti yeniləndi." });
  }
  if (action === "task-retry" || action === "task-cancel") {
    const input = z.object({ id: z.string() }).parse(raw);
    const task = await db.task.findUnique({ where: { id: input.id } });
    if (!task) throw new HttpError(404, "TASK", "Tapşırıq tapılmadı.");
    if (action === "task-cancel") {
      await db.task.updateMany({
        where: { id: input.id, status: { in: [...activeStatuses] } },
        data: {
          status: "CANCELLED",
          leaseToken: null,
          leaseExpiresAt: null,
          finishedAt: new Date(),
          message: "İstifadəçi dayandırdı.",
        },
      });
    } else {
      const created = await enqueue(
        task.profileId,
        task.from,
        task.until,
        "RETRY",
      );
      if (!created)
        throw new HttpError(
          409,
          "BUSY",
          "Profilin aktiv tapşırığı var və ya profil dayandırılıb.",
        );
    }
    return Response.json({
      message:
        action === "task-retry"
          ? "Yenidən toplama növbəyə əlavə edildi."
          : "Tapşırıq dayandırıldı.",
    });
  }
  throw new HttpError(404, "NOT_FOUND", "Endpoint tapılmadı.");
}
