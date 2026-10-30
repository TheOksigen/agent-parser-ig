import Link from "next/link";
import { ListChecks } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageAdmin } from "@/lib/auth";
import { dateTime, type Params } from "@/lib/filters";
import { Shell, PageHeading, Empty, Status } from "@/components/shell";
import {
  ActionButton,
  AutoRefresh,
  CollectionSettingsForm,
} from "@/components/controls";
import { activeStatuses } from "@/lib/queue";
import { jsonObject } from "@/lib/post-data";
import { taskProgress } from "@/lib/task-progress";
import type { Task } from "@/generated/prisma/client";

function TaskProgress({ task }: { task: Task }) {
  const p = taskProgress(task);
  return (
    <div className="task-progress">
      <div className="task-progress-heading">
        <strong>
          {p.percent === null ? "Postlar axtarılır" : `${p.percent}%`}
        </strong>
        <span>
          {p.total
            ? `${p.resolved} / ${p.total} post yoxlanıb`
            : p.finished
              ? "Post tapılmadı"
              : "Post sayı hələ müəyyən edilməyib"}
          {p.deferred.length > 0 &&
            ` · ${p.deferred.length} sonraya saxlanılıb`}
        </span>
      </div>
      <progress
        max={100}
        value={p.percent ?? undefined}
        aria-label="Tapılmış postların yoxlanma faizi"
      />
      <div className="task-timing">
        <span>
          Interval: <strong>{task.intervalSeconds} san</strong>
          {p.interval > task.intervalSeconds &&
            ` · agent hazırda ${p.interval} san`}
        </span>
        <span>
          {p.finished ? (
            "Yoxlama tamamlanıb"
          ) : (
            <>
              {p.basis}: <strong>{p.estimate}</strong>
            </>
          )}
        </span>
      </div>
      {!p.finished && (
        <p className="muted text-small">
          {!p.discoveryDone && p.total > 0
            ? "Faiz tapılmış postlara aiddir; axtarış davam etdikcə say arta bilər. "
            : ""}
          Müddət təxminidir; növbə, profil axtarışı və gözləmə fasilələri daxil
          deyil.
        </p>
      )}
      {p.deferred.length > 0 && (
        <details className="post-extra task-skips">
          <summary>Sonraya saxlanmış {p.deferred.length} post</summary>
          <ul>
            {p.deferred.map((item, i) => {
              const post = jsonObject(item);
              return typeof post.permalink === "string" &&
                typeof post.retryAt === "string" ? (
                <li key={i}>
                  <a
                    href={post.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Postu aç ↗
                  </a>
                  <span>
                    {typeof post.reason === "string"
                      ? post.reason
                      : "Səhifə açılmadı"}
                  </span>
                  <span className="muted">
                    Növbəti cəhd: {dateTime(new Date(post.retryAt))} ·{" "}
                    {Number(post.attempts)}/3 cəhd
                  </span>
                </li>
              ) : null;
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
export default async function Tasks({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requirePageAdmin();
  const params = await searchParams;
  const page = Math.max(1, parseInt(String(params.page ?? "1")) || 1);
  const [tasks, total, settings] = await Promise.all([
    db.task.findMany({
      include: { profile: true, device: true },
      orderBy: { createdAt: "desc" },
      take: 40,
      skip: (page - 1) * 40,
    }),
    db.task.count(),
    db.collectorSettings.findUnique({ where: { id: "collector" } }),
  ]);
  return (
    <Shell active="/tasks">
      <AutoRefresh />
      <PageHeading
        eyebrow="TOPLAMA NÖVBƏSİ"
        title="Tapşırıqlar"
        description="Toplama gedişatı, nəticələr və avtomatik ötürülən postlar."
      />
      <CollectionSettingsForm
        intervalSeconds={settings?.intervalSeconds ?? 10}
      />
      <p className="muted text-small">
        Aktiv tapşırığı dayandıra, tamamlanmış və ya dayandırılmış tapşırığı silə bilərsiniz. Arxivdəki paylaşımlar saxlanılır. Profilin dövri toplamasını da dayandırmaq üçün onu <Link className="text-link" href="/profiles">Profillər</Link> bölməsində deaktiv edin.
      </p>
      <div className="section-heading">
        <h2>{total} tapşırıq</h2>
        <span className="muted text-small">Hər 30 saniyədə yenilənir</span>
      </div>
      <section className="panel">
        {!tasks.length ? (
          <Empty title="Növbədə tapşırıq yoxdur" icon={ListChecks}>
            <p>
              Paylaşımlar səhifəsində profil və tarix seçib “Topla və göstər”
              düyməsini basın.
            </p>
          </Empty>
        ) : (
          <div className="task-list">
            {tasks.map((task) => (
              <article className="task-item" key={task.id}>
                <div className="task-top">
                  <div>
                    <Link
                      className="profile-name"
                      href={`/?profile=${task.profile.username}`}
                    >
                      @{task.profile.username}
                    </Link>
                    <p className="muted text-small">
                      {dateTime(task.from)} →{" "}
                      {dateTime(new Date(task.until.getTime() - 1))}
                    </p>
                  </div>
                  <Status value={task.status} />
                </div>
                <TaskProgress task={task} />
                <div className="task-details">
                  <span>
                    <strong>{task.postsReceived}</strong> qəbul edilmiş paylaşım
                  </span>
                  <span>{task.skippedPosts} oxunmayan paylaşım</span>
                  <span>
                    {Number(jsonObject(task.checkpoint).filtered ?? 0)} tarixdən
                    kənar paylaşım
                  </span>
                  <span>
                    Cəhd {task.attempts}/{task.maxAttempts}
                  </span>
                  <span>{task.device?.name ?? "Cihaz gözlənilir"}</span>
                </div>
                {task.message && (
                  <p
                    className={`task-message ${task.status === "FAILED" ? "error" : ""}`}
                  >
                    {task.message}
                  </p>
                )}
                {Array.isArray(jsonObject(task.checkpoint).recentSkips) && (
                  <details className="post-extra task-skips">
                    <summary>Son ötürülən postların səbəbləri</summary>
                    <ul>
                      {(
                        jsonObject(task.checkpoint)
                          .recentSkips as import("@/generated/prisma/client").Prisma.JsonArray
                      ).map((item, i) => {
                        const skip = jsonObject(item);
                        return typeof skip.permalink === "string" &&
                          typeof skip.reason === "string" ? (
                          <li key={i}>
                            <a
                              href={skip.permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Postu aç ↗
                            </a>
                            <span className="muted">{skip.reason}</span>
                          </li>
                        ) : null;
                      })}
                    </ul>
                  </details>
                )}
                <div className="task-bottom">
                  <span className="muted text-small">
                    Yaradılıb: {dateTime(task.createdAt)}
                    {task.oldestSeenAt &&
                      ` · Ən köhnə görülən: ${dateTime(task.oldestSeenAt)}`}
                  </span>
                  <div className="task-actions">{(activeStatuses as readonly string[]).includes(
                    task.status,
                  ) ? (
                    <ActionButton
                      action="task-cancel"
                      payload={{ id: task.id }}
                    >
                      Dayandır
                    </ActionButton>
                  ) : (
                    <>
                      <ActionButton action="task-retry" payload={{ id: task.id }}>
                        Yenidən topla
                      </ActionButton>
                      <ActionButton action="task-delete" payload={{ id: task.id }} confirmation="Bu tapşırıq silinsin? Arxivdəki paylaşımlar saxlanılacaq.">
                        Sil
                      </ActionButton>
                    </>
                  )}</div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {total > 40 && (
        <nav className="pagination" aria-label="Tapşırıq səhifələri">
          {page > 1 && <Link href={`?page=${page - 1}`}>Əvvəlki</Link>}
          <span>
            {page} / {Math.ceil(total / 40)}
          </span>
          {page * 40 < total && <Link href={`?page=${page + 1}`}>Növbəti</Link>}
        </nav>
      )}
    </Shell>
  );
}
