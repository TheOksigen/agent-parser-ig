import { db } from "./db";
import { token } from "./auth";
import { HttpError } from "./http";
import { Prisma } from "@/generated/prisma/client";

export const activeStatuses = ["QUEUED", "RUNNING", "WAITING_USER"] as const;
export const leaseSeconds = Math.max(
  120,
  Number(process.env.TASK_LEASE_SECONDS) || 180,
);
export const leaseEnd = () => new Date(Date.now() + leaseSeconds * 1000);

type JobRequest = {
  profileId: string;
  from: Date;
  until: Date;
  reason: string;
};

export async function enqueueJobs(
  requests: JobRequest[],
  replaceActive = false,
) {
  if (!requests.length) return { queued: 0, reused: 0, replaced: 0 };
  const unique = [...new Map(requests.map((r) => [r.profileId, r])).values()];
  const ids = unique.map((r) => r.profileId).sort();
  return db.$transaction(
    async (tx) => {
      const [settings] = await tx.$queryRaw<{ intervalSeconds: number }[]>`
        SELECT "intervalSeconds" FROM instagram_parser."CollectorSettings" WHERE id = 'collector' FOR SHARE`;
      const intervalSeconds = settings?.intervalSeconds ?? 10;
      const maxPosts = Math.min(
        10000,
        Math.max(10, Number(process.env.MAX_POSTS_PER_TASK) || 500),
      );
      const profiles = await tx.$queryRaw<
        {
          id: string;
          collectionFrom: Date | null;
          collectionUntil: Date | null;
        }[]
      >(Prisma.sql`
      SELECT id, "collectionFrom", "collectionUntil" FROM instagram_parser."Profile"
      WHERE id IN (${Prisma.join(ids)}) AND active = true AND "publicConfirmed" = true ORDER BY id FOR UPDATE`);
      const eligible = new Map(profiles.map((p) => [p.id, p]));
      const active = await tx.task.findMany({
        where: { profileId: { in: ids }, status: { in: [...activeStatuses] } },
        select: { id: true, profileId: true, from: true, until: true },
      });
      const byProfile = new Map(active.map((t) => [t.profileId, t]));
      const cancel: string[] = [];
      const ready: JobRequest[] = [];
      const ranges = new Map<
        string,
        { from: Date; until: Date; ids: string[] }
      >();
      let reused = 0;
      for (const r of unique) {
        const profile = eligible.get(r.profileId);
        if (!profile) continue;
        // Recheck under the profile lock: a scheduler snapshot may predate a user's new range.
        if (
          !replaceActive &&
          (profile.collectionFrom?.getTime() !== r.from.getTime() ||
            profile.collectionUntil?.getTime() !== r.until.getTime())
        )
          continue;
        if (replaceActive) {
          const key = `${r.from.toISOString()}/${r.until.toISOString()}`;
          const group = ranges.get(key) ?? {
            from: r.from,
            until: r.until,
            ids: [],
          };
          group.ids.push(r.profileId);
          ranges.set(key, group);
        }
        const current = byProfile.get(r.profileId);
        if (current) {
          if (
            !replaceActive ||
            (current.from.getTime() === r.from.getTime() &&
              current.until.getTime() === r.until.getTime())
          ) {
            reused++;
            continue;
          }
          cancel.push(current.id);
        }
        ready.push(r);
      }
      for (const range of ranges.values()) {
        await tx.profile.updateMany({
          where: { id: { in: range.ids } },
          data: { collectionFrom: range.from, collectionUntil: range.until },
        });
      }
      if (cancel.length)
        await tx.task.updateMany({
          where: { id: { in: cancel }, status: { in: [...activeStatuses] } },
          data: {
            status: "CANCELLED",
            leaseToken: null,
            leaseExpiresAt: null,
            finishedAt: new Date(),
            message:
              "İstifadəçinin seçdiyi yeni tarix aralığı ilə əvəz edildi.",
          },
        });
      const queued = ready.length
        ? (
            await tx.task.createMany({
              data: ready.map((job) => ({ ...job, intervalSeconds, maxPosts })),
            })
          ).count
        : 0;
      if (ready.length)
        await tx.$executeRaw(Prisma.sql`
      UPDATE instagram_parser."Profile" SET "nextRunAt" = NOW() + "intervalHours" * INTERVAL '1 hour'
      WHERE id IN (${Prisma.join(ready.map((r) => r.profileId))})`);
      return { queued, reused, replaced: cancel.length };
    },
    { timeout: 30000 },
  );
}

export async function enqueue(
  profileId: string,
  from: Date,
  until: Date,
  reason = "MANUAL",
) {
  return (
    (await enqueueJobs([{ profileId, from, until, reason }], true)).queued > 0
  );
}

export async function reclaimExpired() {
  await db.$executeRaw`
    UPDATE instagram_parser."Task" SET
      status = CASE WHEN attempts >= "maxAttempts" THEN 'FAILED'::instagram_parser."TaskStatus" ELSE 'QUEUED'::instagram_parser."TaskStatus" END,
      "deviceId" = NULL, "leaseToken" = NULL, "leaseExpiresAt" = NULL,
      "availableAt" = NOW() + LEAST(3600, 30 * POWER(2, attempts)) * INTERVAL '1 second',
      "errorCode" = 'LEASE_EXPIRED', message = 'Cihaz bağlantısı kəsildi; saxlanmış mərhələdən davam ediləcək.',
      "finishedAt" = CASE WHEN attempts >= "maxAttempts" THEN NOW() ELSE NULL END, "updatedAt" = NOW()
    WHERE status IN ('RUNNING', 'WAITING_USER') AND "leaseExpiresAt" < NOW()`;
}

export async function claim(deviceId: string, supportsDeferred = false) {
  await reclaimExpired();
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM instagram_parser."Device" WHERE id = ${deviceId} FOR UPDATE`;
    const owned = await tx.task.findFirst({
      where: {
        deviceId,
        status: { in: ["RUNNING", "WAITING_USER"] },
        leaseExpiresAt: { gt: new Date() },
      },
      include: { profile: true },
    });
    if (owned) return owned;
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT t.id FROM instagram_parser."Task" t JOIN instagram_parser."Profile" p ON p.id = t."profileId"
      WHERE t.status = 'QUEUED' AND t."availableAt" <= NOW() AND p.active = true AND p."publicConfirmed" = true
      AND (${supportsDeferred} OR COALESCE(jsonb_array_length(t.checkpoint->'deferredPosts'), 0) = 0)
      ORDER BY CASE WHEN t.reason = 'SCHEDULED' THEN 1 ELSE 0 END, t."createdAt" FOR UPDATE OF t SKIP LOCKED LIMIT 1`;
    if (!rows.length) return null;
    const task = await tx.task.update({
      where: { id: rows[0].id },
      data: {
        deviceId,
        status: "RUNNING",
        leaseToken: token(),
        leaseExpiresAt: leaseEnd(),
        attempts: { increment: 1 },
        errorCode: null,
        message: null,
      },
      include: { profile: true },
    });
    await tx.device.update({
      where: { id: deviceId },
      data: { state: "RUNNING", lastSeenAt: new Date() },
    });
    return task;
  });
}

export async function ownedTask(
  tx: Prisma.TransactionClient,
  id: string,
  deviceId: string,
  leaseToken: string,
) {
  await tx.$queryRaw`SELECT id FROM instagram_parser."Task" WHERE id = ${id} FOR UPDATE`;
  const task = await tx.task.findUnique({
    where: { id },
    include: { profile: true },
  });
  if (
    !task ||
    task.deviceId !== deviceId ||
    task.leaseToken !== leaseToken ||
    !task.leaseExpiresAt ||
    task.leaseExpiresAt < new Date() ||
    !["RUNNING", "WAITING_USER"].includes(task.status)
  ) {
    throw new HttpError(
      409,
      "LEASE_LOST",
      "Tapşırıq artıq bu cihaza aid deyil. Növbədən yenidən götürün.",
    );
  }
  return task;
}

export async function scheduleDue() {
  await reclaimExpired();
  const profiles = await db.profile.findMany({
    where: {
      active: true,
      publicConfirmed: true,
      nextRunAt: { lte: new Date() },
      collectionFrom: { not: null },
      collectionUntil: { not: null },
    },
    take: 1500,
    orderBy: { nextRunAt: "asc" },
  });
  const result = await enqueueJobs(
    profiles.map((p) => ({
      profileId: p.id,
      from: p.collectionFrom!,
      until: p.collectionUntil!,
      reason: "SCHEDULED",
    })),
  );
  await db.rateLimit.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 86400000) } },
  });
  await db.pairing.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 86400000) } },
  });
  return result.queued;
}
