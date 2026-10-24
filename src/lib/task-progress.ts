import type { Task } from "@/generated/prisma/client";
import { jsonObject } from "./post-data";

const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;

export function minutes(seconds: number) {
  const total = Math.max(1, Math.ceil(seconds / 60));
  return total < 60
    ? `${total} dəq`
    : `${Math.floor(total / 60)} saat${total % 60 ? ` ${total % 60} dəq` : ""}`;
}

export function taskProgress(task: Task) {
  const cp = jsonObject(task.checkpoint);
  const links = Array.isArray(cp.links) ? cp.links.length : 0;
  const scanned = Math.min(links, number(cp.index));
  const deferred = Array.isArray(cp.deferredPosts) ? cp.deferredPosts : [];
  const resolved = Math.max(0, scanned - deferred.length);
  const finished = task.status === "PARTIAL" || task.status === "SUCCEEDED";
  const discoveryDone = cp.discoveryDone === true;
  // Links after a confirmed date boundary are not part of the remaining scan.
  const total = cp.stopReason === "date_boundary" ? scanned : links;
  const percent = finished
    ? 100
    : total
      ? Math.min(100, Math.floor((resolved / total) * 100))
      : task.status === "RUNNING" || task.status === "WAITING_USER"
        ? null
        : 0;
  const interval = Math.max(
    task.intervalSeconds,
    number(cp.effectiveIntervalSeconds),
  );
  const remaining = total ? Math.max(0, total - resolved) : task.maxPosts;
  const estimate = finished
    ? "Bitib"
    : remaining
      ? `~${minutes(remaining * interval)} – ${minutes(remaining * (interval + 14))}`
      : "Profilin davamı yoxlanılır";
  return {
    resolved,
    total,
    deferred,
    percent,
    discoveryDone,
    finished,
    interval,
    estimate,
    basis: total
      ? "Tapılmış postlar üzrə qalan aktiv vaxt"
      : `${task.maxPosts} post limiti üzrə ilkin hesab`,
  };
}
