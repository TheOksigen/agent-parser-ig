import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { hash, rateLimit, requireDevice } from "./auth";
import { HttpError, jsonBody } from "./http";
import { claim, leaseEnd, leaseSeconds, ownedTask } from "./queue";
import {
  jsonObject,
  metadataSchema,
  metricKeys,
  metricsSchema,
  type MetricKey,
} from "./post-data";

const postUrl = z
  .string()
  .regex(/^https:\/\/www\.instagram\.com\/(?:p|reel)\/[A-Za-z0-9_-]{5,64}\/$/);
const checkpointSchema = z
  .object({
    phase: z.enum(["discovery", "posts"]),
    grid: z.enum(["posts", "reels"]).optional(),
    secondGrid: z.boolean().optional(),
    linkGrids: z.array(z.enum(["posts", "reels"])).max(10000).optional(),
    links: z.array(postUrl).max(10000),
    index: z.number().int().min(0).max(10000),
    scrolls: z.number().int().min(0).max(10000),
    skipped: z.number().int().min(0).max(10000),
    oldestSeenAt: z.string().datetime().nullable().optional(),
    version: z.number().int().min(1).max(4).optional(),
    filtered: z.number().int().min(0).max(10000).optional(),
    matched: z.number().int().min(0).max(10000).optional(),
    effectiveIntervalSeconds: z.number().int().min(2).max(300).optional(),
    olderStreak: z.number().int().min(0).max(10000).optional(),
    previousDate: z.string().datetime().nullable().optional(),
    discoveryDone: z.boolean().optional(),
    stopReason: z
      .enum([
        "date_boundary",
        "page_end",
        "limit",
        "manual",
        "legacy",
        "profile_unavailable",
      ])
      .optional(),
    recentSkips: z
      .array(z.object({ permalink: postUrl, reason: z.string().max(200) }))
      .max(20)
      .optional(),
    deferredPosts: z
      .array(
        z.object({
          permalink: postUrl,
          retryAt: z.string().datetime(),
          attempts: z.number().int().min(1).max(2),
          reason: z.string().max(200),
        }),
      )
      .max(10000)
      .optional(),
  })
  .refine((c) => c.index <= c.links.length, "Mərhələ indeksi yanlışdır.")
  .refine((c) => {
    const visited = new Set(c.links.slice(0, c.index));
    const deferred = c.deferredPosts ?? [];
    return (
      deferred.every((p) => visited.has(p.permalink)) &&
      new Set(deferred.map((p) => p.permalink)).size === deferred.length
    );
  }, "Gözləyən postlar yoxlanmış linklərə aid olmalıdır.");
const ownedSchema = z.object({
  taskId: z.string().min(1).max(100),
  leaseToken: z.string().min(20).max(200),
});

export async function handleAgent(request: Request, action: string) {
  if (action === "register") {
    await rateLimit("agent-registration", 60, 600);
    const input = z
      .object({
        code: z.string().min(8).max(64),
        installationId: z.string().uuid(),
        token: z.string().min(40).max(100),
        name: z.string().trim().min(1).max(80),
        appVersion: z.string().max(30),
      })
      .parse(await jsonBody(request, 4096));
    const codeHash = hash(input.code.replace(/[-\s]/g, "").toUpperCase());
    const device = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM instagram_parser."Pairing" WHERE "codeHash" = ${codeHash} FOR UPDATE`;
      const pairing = await tx.pairing.findUnique({ where: { codeHash } });
      if (
        !pairing ||
        pairing.expiresAt < new Date() ||
        (pairing.installationId &&
          pairing.installationId !== input.installationId)
      ) {
        throw new HttpError(
          403,
          "PAIRING",
          "Qoşulma kodu yanlışdır, istifadə edilib və ya vaxtı bitib.",
        );
      }
      const existing = await tx.device.findUnique({
        where: { installationId: input.installationId },
      });
      if (pairing.installationId && existing?.tokenHash !== hash(input.token))
        throw new HttpError(403, "PAIRING", "Kod istifadə edilib.");
      const d = await tx.device.upsert({
        where: { installationId: input.installationId },
        create: {
          installationId: input.installationId,
          tokenHash: hash(input.token),
          name: input.name,
          appVersion: input.appVersion,
        },
        update: {
          tokenHash: hash(input.token),
          name: input.name,
          enabled: true,
          appVersion: input.appVersion,
          lastSeenAt: new Date(),
        },
      });
      await tx.pairing.update({
        where: { id: pairing.id },
        data: { installationId: input.installationId },
      });
      return d;
    });
    return Response.json({ deviceId: device.id });
  }

  const device = await requireDevice(request);
  await rateLimit(`device:${device.id}`, 180, 60);
  await db.device.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() },
  });

  if (action === "claim") {
    const input = z
      .object({
        protocolVersion: z.number().int().optional(),
        appVersion: z.string().max(30).optional(),
      })
      .parse(await jsonBody(request, 4096));
    if (input.appVersion)
      await db.device.update({
        where: { id: device.id },
        data: { appVersion: input.appVersion },
      });
    const task = await claim(device.id, (input.protocolVersion ?? 0) >= 4);
    if (!task)
      await db.device.update({
        where: { id: device.id },
        data: { state: "IDLE" },
      });
    return Response.json({
      task: task
        ? {
            id: task.id,
            username: task.profile.username,
            from: task.from,
            until: task.until,
            leaseToken: task.leaseToken,
            checkpoint: task.checkpoint,
            intervalSeconds: task.intervalSeconds,
          }
        : null,
      config: {
        leaseSeconds,
        intervalSeconds: task?.intervalSeconds ?? 10,
        maxScrolls: Math.min(
          2000,
          Math.max(10, Number(process.env.MAX_PROFILE_SCROLLS) || 200),
        ),
        maxPosts:
          task?.maxPosts ??
          Math.min(
            10000,
            Math.max(10, Number(process.env.MAX_POSTS_PER_TASK) || 500),
          ),
      },
    });
  }

  const raw = await jsonBody(request, 4_194_304);
  const ownership = ownedSchema.parse(raw);

  if (action === "heartbeat") {
    const input = ownedSchema
      .extend({
        state: z.enum(["RUNNING", "WAITING_USER", "COOLDOWN"]),
        message: z.string().max(500).optional(),
        checkpoint: checkpointSchema.optional(),
        appVersion: z.string().max(30).optional(),
      })
      .parse(raw);
    const intervalSeconds = await db.$transaction(async (tx) => {
      const task = await ownedTask(
        tx,
        input.taskId,
        device.id,
        input.leaseToken,
      );
      await tx.task.update({
        where: { id: input.taskId },
        data: {
          status: input.state === "COOLDOWN" ? "RUNNING" : input.state,
          message: input.message,
          leaseExpiresAt: leaseEnd(),
          ...(input.checkpoint
            ? {
                checkpoint: input.checkpoint,
                skippedPosts: input.checkpoint.skipped,
                ...(input.checkpoint.oldestSeenAt
                  ? { oldestSeenAt: new Date(input.checkpoint.oldestSeenAt) }
                  : {}),
              }
            : {}),
        },
      });
      await tx.device.update({
        where: { id: device.id },
        data: {
          state: input.state,
          lastSeenAt: new Date(),
          appVersion: input.appVersion,
        },
      });
      return task.intervalSeconds;
    });
    return Response.json({ ok: true, config: { intervalSeconds } });
  }

  if (action === "defer") {
    const input = ownedSchema
      .extend({ checkpoint: checkpointSchema })
      .parse(raw);
    const waiting = input.checkpoint.deferredPosts ?? [];
    if (!waiting.length || !input.checkpoint.discoveryDone)
      throw new HttpError(
        400,
        "DEFER",
        "Profil yoxlanışı bitməli və gözləyən post olmalıdır.",
      );
    const availableAt = new Date(
      Math.max(
        Date.now() + 5000,
        Math.min(...waiting.map((p) => Date.parse(p.retryAt))),
      ),
    );
    await db.$transaction(async (tx) => {
      await ownedTask(tx, input.taskId, device.id, input.leaseToken);
      await tx.task.update({
        where: { id: input.taskId },
        data: {
          status: "QUEUED",
          checkpoint: input.checkpoint,
          skippedPosts: input.checkpoint.skipped,
          availableAt,
          deviceId: null,
          leaseToken: null,
          leaseExpiresAt: null,
          errorCode: "POSTS_DEFERRED",
          message: `${waiting.length} post sonraya saxlanılıb. Digər profillərin toplanması davam edir.`,
          // A planned retry is not a failed device attempt.
          attempts: { decrement: 1 },
        },
      });
      await tx.device.update({
        where: { id: device.id },
        data: { state: "IDLE" },
      });
    });
    return Response.json({ ok: true, availableAt });
  }

  if (action === "upload") {
    const input = ownedSchema
      .extend({
        batchId: z.string().uuid(),
        checkpoint: checkpointSchema,
        posts: z
          .array(
            z.object({
              username: z.string().regex(/^[a-zA-Z0-9._]{1,30}$/),
              authorUsername: z
                .string()
                .regex(/^[a-zA-Z0-9._]{1,30}$/)
                .optional(),
              collaboratorUsernames: z
                .array(z.string().regex(/^[a-zA-Z0-9._]{1,30}$/))
                .max(100)
                .optional(),
              permalink: postUrl,
              publishedAt: z.string().datetime(),
              caption: z.string().max(100000),
              fullCaption: z.literal(true),
              extraction: z.enum(["embedded_json", "dom", "manual"]),
              instagramId: z.string().max(100).optional(),
              mediaType: z
                .enum(["image", "video", "carousel", "unknown"])
                .optional(),
              metrics: metricsSchema.optional(),
              metadata: metadataSchema.optional(),
            }),
          )
          .max(50),
      })
      .parse(raw);
    const count = await db.$transaction(
      async (tx) => {
        const task = await ownedTask(
          tx,
          input.taskId,
          device.id,
          input.leaseToken,
        );
        const existing = await tx.receipt.findUnique({
          where: {
            taskId_batchId: { taskId: task.id, batchId: input.batchId },
          },
        });
        if (existing) return existing.count;
        // Lock shared posts in a stable order when several devices collect the same collaboration.
        for (const post of [...input.posts].sort((a, b) =>
          a.permalink.split("/")[4].localeCompare(b.permalink.split("/")[4]),
        )) {
          const publishedAt = new Date(post.publishedAt);
          if (
            post.username.toLowerCase() !== task.profile.username ||
            publishedAt < task.from ||
            publishedAt >= task.until ||
            publishedAt.getTime() > Date.now() + 300000
          ) {
            throw new HttpError(
              400,
              "POST_SCOPE",
              "Paylaşım profili və ya tarixi tapşırığa uyğun deyil.",
            );
          }
          const shortcode = new URL(post.permalink).pathname.split("/")[2];
          // The lock function returns PostgreSQL void, which $queryRaw cannot deserialize.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${shortcode}, 0))`;
          const existingPost = await tx.post.findUnique({
            where: { shortcode },
            select: {
              profileId: true,
              authorUsername: true,
              collaboratorUsernames: true,
              metricDetails: true,
              metadata: true,
              profileLinks: { select: { profileId: true } },
            },
          });
          const authorUsername = post.authorUsername?.toLowerCase();
          const collaborators = [
            ...new Set(
              post.collaboratorUsernames?.map((name) => name.toLowerCase()) ??
                [],
            ),
          ];
          const authors = [authorUsername, ...collaborators].filter(
            (name): name is string => Boolean(name),
          );
          if (
            (authorUsername && !authors.includes(task.profile.username)) ||
            (!authorUsername && collaborators.length > 0) ||
            (!authorUsername &&
              existingPost &&
              existingPost.profileId !== task.profileId &&
              !existingPost.profileLinks.some(
                (link) => link.profileId === task.profileId,
              ))
          )
            throw new HttpError(
              409,
              "POST_OWNER",
              "Profilin paylaşım müəllifi və ya collab iştirakçısı olduğu təsdiqlənməyib.",
            );
          const checkedAt = new Date();
          const counts: Partial<Record<MetricKey, bigint>> = {};
          const metricDetails = jsonObject(existingPost?.metricDetails ?? null);
          for (const key of metricKeys) {
            const observation = post.metrics?.[key];
            if (!observation) continue; // Unknown is not zero; retain the last observed value and its timestamp.
            counts[key] = BigInt(observation.value);
            metricDetails[key] = {
              ...observation,
              checkedAt: checkedAt.toISOString(),
            };
          }
          const data = {
            permalink: post.permalink,
            publishedAt,
            caption: post.caption,
            extraction: post.extraction,
            checkedAt,
            instagramId: post.instagramId,
            mediaType: post.mediaType,
            ...(authorUsername
              ? { authorUsername }
              : !existingPost
                ? { authorUsername: task.profile.username }
                : {}),
            collaboratorUsernames: [
              ...new Set([
                ...(existingPost?.collaboratorUsernames ?? []),
                ...collaborators,
              ]),
            ],
            ...counts,
            ...(post.metrics
              ? { metricDetails: metricDetails as Prisma.InputJsonObject }
              : {}),
            ...(post.metadata
              ? {
                  metadata: {
                    ...jsonObject(existingPost?.metadata ?? null),
                    ...post.metadata,
                  } as Prisma.InputJsonObject,
                }
              : {}),
            hashtags: [
              ...new Set(post.caption.match(/#[\p{L}\p{M}\p{N}_]+/gu) ?? []),
            ],
          };
          const saved = await tx.post.upsert({
            where: { shortcode },
            create: { ...data, shortcode, profileId: task.profileId },
            update: data,
            select: { id: true },
          });
          const relatedProfiles = authors.length
            ? await tx.profile.findMany({
                where: { publicConfirmed: true, username: { in: authors } },
                select: { id: true },
              })
            : [];
          await tx.postProfile.createMany({
            data: [
              ...new Set([
                task.profileId,
                ...relatedProfiles.map((profile) => profile.id),
              ]),
            ].map((profileId) => ({ postId: saved.id, profileId })),
            skipDuplicates: true,
          });
        }
        await tx.receipt.create({
          data: {
            taskId: task.id,
            batchId: input.batchId,
            count: input.posts.length,
          },
        });
        await tx.task.update({
          where: { id: task.id },
          data: {
            checkpoint: input.checkpoint,
            postsReceived: { increment: input.posts.length },
            skippedPosts: input.checkpoint.skipped,
            ...(input.checkpoint.oldestSeenAt
              ? { oldestSeenAt: new Date(input.checkpoint.oldestSeenAt) }
              : {}),
            leaseExpiresAt: leaseEnd(),
          },
        });
        return input.posts.length;
      },
      { timeout: 30000 },
    );
    return Response.json({ accepted: count });
  }

  if (action === "finish") {
    const input = ownedSchema
      .extend({
        message: z.string().min(1).max(500),
        checkpoint: checkpointSchema,
      })
      .parse(raw);
    if (input.checkpoint.deferredPosts?.length)
      throw new HttpError(
        400,
        "DEFERRED_POSTS",
        "Gözləyən postlar tamamlanmalı və ya defer ilə növbəyə qaytarılmalıdır.",
      );
    await db.$transaction(async (tx) => {
      // A lost response can be retried after the transaction already completed.
      await tx.$queryRaw`SELECT id FROM instagram_parser."Task" WHERE id = ${input.taskId} FOR UPDATE`;
      const done = await tx.task.findUnique({ where: { id: input.taskId } });
      if (
        done?.status === "PARTIAL" &&
        done.deviceId === device.id &&
        done.leaseToken === input.leaseToken
      )
        return;
      const task = await ownedTask(
        tx,
        input.taskId,
        device.id,
        input.leaseToken,
      );
      // Browser pagination cannot prove historical completeness. Never manufacture coverage.
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: "PARTIAL",
          message: input.message,
          errorCode: "WEBVIEW_COVERAGE_UNVERIFIED",
          checkpoint: input.checkpoint,
          skippedPosts: input.checkpoint.skipped,
          oldestSeenAt: input.checkpoint.oldestSeenAt
            ? new Date(input.checkpoint.oldestSeenAt)
            : null,
          finishedAt: new Date(),
          leaseExpiresAt: null,
        },
      });
      await tx.profile.update({
        where: { id: task.profileId },
        data: { lastCheckedAt: new Date() },
      });
      await tx.device.update({
        where: { id: device.id },
        data: { state: "IDLE" },
      });
    });
    return Response.json({ ok: true, coverage: "UNVERIFIED" });
  }

  if (action === "fail") {
    const input = ownedSchema
      .extend({
        code: z.string().regex(/^[A-Z_]{2,60}$/),
        message: z.string().max(500),
        retryable: z.boolean(),
        deviceState: z.enum(["IDLE", "NEEDS_LOGIN"]).optional(),
      })
      .parse(raw);
    await db.$transaction(async (tx) => {
      const task = await ownedTask(
        tx,
        ownership.taskId,
        device.id,
        ownership.leaseToken,
      );
      const retry = input.retryable && task.attempts < task.maxAttempts;
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: retry ? "QUEUED" : "FAILED",
          message: input.message,
          errorCode: input.code,
          availableAt: new Date(
            Date.now() + Math.min(3600, 30 * 2 ** task.attempts) * 1000,
          ),
          deviceId: retry ? null : device.id,
          leaseToken: null,
          leaseExpiresAt: null,
          finishedAt: retry ? null : new Date(),
        },
      });
      await tx.device.update({
        where: { id: device.id },
        data: { state: input.deviceState ?? "IDLE" },
      });
    });
    return Response.json({ ok: true });
  }
  throw new HttpError(404, "NOT_FOUND", "Endpoint tapılmadı.");
}
