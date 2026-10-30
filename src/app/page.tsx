import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Info,
  Search,
  Users,
  FileText,
  Smartphone,
} from "lucide-react";
import { requirePageAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { bakuDay, filters, queryString, type Params } from "@/lib/filters";
import { Shell, PageHeading, Empty } from "@/components/shell";
import { AutoRefresh, SearchForm } from "@/components/controls";
import { postView } from "@/lib/post-view";
import { PostCard } from "@/components/post-card";

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requirePageAdmin();
  const params = await searchParams;
  let f,
    filterError = "";
  try {
    f = filters(params);
  } catch (e) {
    filterError = (e as Error).message;
    f = filters({});
  }
  const [total, posts, profiles, allPosts, devices, settings] =
    await Promise.all([
      db.post.count({ where: f.where }),
      db.post.findMany({
        where: f.where,
        include: {
          profileLinks: {
            include: { profile: { select: { username: true } } },
          },
        },
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: 30,
        skip: (f.page - 1) * 30,
      }),
      db.profile.count({ where: { active: true } }),
      db.post.count(),
      db.device.count({
        where: {
          enabled: true,
          lastSeenAt: { gt: new Date(Date.now() - 180000) },
        },
      }),
      db.collectorSettings.findUnique({ where: { id: "collector" } }),
    ]);
  const groups = new Map<string, typeof posts>();
  for (const post of posts)
    for (const link of post.profileLinks) {
      const name = link.profile.username;
      if (f.profile && (f.exact ? name !== f.profile : !name.includes(f.profile))) continue;
      const group = groups.get(name) ?? [];
      group.push(post);
      groups.set(name, group);
    }
  const qs = { from: f.from, to: f.to, profile: f.profile, ...(f.exact ? { exact: "1" } : {}) };
  return (
    <Shell active="/">
      <AutoRefresh />
      <PageHeading
        eyebrow="PAYLAŞIM KİTABXANASI"
        title="Paylaşımlar"
        description="Tam təsvir, tarix və şərh sayı bir arxivdə."
        action={
          <a
            className="button secondary"
            href={`/api/posts/export?${queryString(qs)}`}
          >
            <ArrowDownToLine size={17} />
            CSV ixrac et
          </a>
        }
      />
      <div className="summary-strip">
        {[
          [Users, profiles, "aktiv profil"],
          [FileText, allPosts, "arxivlənmiş paylaşım"],
          [Smartphone, devices, "onlayn cihaz"],
        ].map(([Icon, value, label], i) => {
          const I = Icon as typeof Users;
          return (
            <div key={i}>
              <I size={20} />
              <strong>{Number(value).toLocaleString("az-AZ")}</strong>
              <span>{String(label)}</span>
            </div>
          );
        })}
      </div>
      {filterError && (
        <p className="feedback error" role="alert">
          {filterError}
        </p>
      )}
      <SearchForm
        {...qs}
        today={bakuDay()}
        intervalSeconds={settings?.intervalSeconds ?? 10}
      />
      <div className="coverage-note">
        <Info size={17} />
        <p>
          Toplama seçilmiş tarixlər üzrə aparılır. Instagram tarixçəsinin tam
          əhatəsi təsdiqlənmir.{" "}
          <Link href="/tasks">
            Toplamanın vəziyyəti <ArrowUpRight size={13} />
          </Link>
        </p>
      </div>
      <div className="section-heading">
        <h2>
          Axtarış nəticələri <span className="count">{total}</span>
        </h2>
        <span className="muted text-small">
          Profil üzrə qruplaşdırılıb · ən yeni əvvəl
        </span>
      </div>
      {!posts.length ? (
        <section className="panel">
          <Empty
            title={
              profiles
                ? "Bu tarixlərdə paylaşım tapılmadı"
                : "İlk profilinizdən başlayın"
            }
            icon={Search}
          >
            <p>
              {profiles
                ? "Tarixi və ya profil adını dəyişin. Növbədəki tapşırıqlar bitdikdən sonra nəticələri yeniləyin."
                : "İzləmək istədiyiniz ictimai profilləri əlavə edin, sonra Android cihazınızı qoşun."}
            </p>
            <Link
              className="button secondary"
              href={profiles ? "/tasks" : "/profiles"}
            >
              {profiles ? "Tapşırıqlara bax" : "Profil əlavə et"}
              <ArrowUpRight size={16} />
            </Link>
          </Empty>
        </section>
      ) : (
        [...groups]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([username, items]) => (
            <section className="post-group panel" key={username}>
              <header className="group-header">
                <div className="profile-avatar">
                  {username.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <a
                    href={`https://www.instagram.com/${username}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="profile-name"
                  >
                    @{username}
                    <ArrowUpRight size={14} />
                  </a>
                  <span className="muted text-small">
                    Bu səhifədə {items.length} paylaşım
                  </span>
                </div>
              </header>
              {items.map((post) => (
                <PostCard key={post.id} post={postView(post)} />
              ))}
            </section>
          ))
      )}
      {total > 30 && (
        <nav className="pagination" aria-label="Nəticə səhifələri">
          {f.page > 1 && (
            <Link
              className="button secondary small"
              href={`/?${queryString({ ...qs, page: f.page - 1 })}`}
            >
              Əvvəlki
            </Link>
          )}
          <span>
            {f.page} / {Math.ceil(total / 30)}
          </span>
          {f.page * 30 < total && (
            <Link
              className="button secondary small"
              href={`/?${queryString({ ...qs, page: f.page + 1 })}`}
            >
              Növbəti
            </Link>
          )}
        </nav>
      )}
    </Shell>
  );
}
