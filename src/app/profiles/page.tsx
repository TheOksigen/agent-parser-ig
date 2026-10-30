import Link from "next/link";
import { Users } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageAdmin } from "@/lib/auth";
import { bakuDay, dateTime, type Params } from "@/lib/filters";
import { Shell, PageHeading, Empty } from "@/components/shell";
import { ProfileForm } from "@/components/controls";
import { ProfileAccordion } from "@/components/profile-accordion";

export default async function Profiles({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requirePageAdmin();
  const params = await searchParams;
  const q = String(params.q ?? "").slice(0, 30);
  const page = Math.max(1, parseInt(String(params.page ?? "1")) || 1);
  const where = { username: { contains: q, mode: "insensitive" as const } };
  const [profiles, total] = await Promise.all([
    db.profile.findMany({
      where,
      include: { _count: { select: { postLinks: true } } },
      orderBy: { username: "asc" },
      take: 50,
      skip: (page - 1) * 50,
    }),
    db.profile.count({ where }),
  ]);
  return (
    <Shell active="/profiles">
      <PageHeading
        eyebrow="İZLƏNƏN HESABLAR"
        title="Profillər"
        description="Profilin üzərinə klikləyib toplanmış postlarını açın."
        action={<ProfileForm />}
      />
      <form className="inline-search">
        <label htmlFor="profile-search" className="sr-only">
          Profil axtar
        </label>
        <input
          id="profile-search"
          name="q"
          defaultValue={q}
          placeholder="İstifadəçi adı ilə axtar…"
        />
        <button className="button secondary">Axtar</button>
        <span className="muted">{total} profil</span>
      </form>
      <section className="panel">
        {!profiles.length ? (
          <Empty title="Profil siyahısı boşdur" icon={Users}>
            <p>
              Yuxarıdakı “Profil əlavə et” düyməsi ilə tək və ya toplu əlavə
              edin.
            </p>
          </Empty>
        ) : (
          <div className="profile-list">
            <div className="profile-list-heading">
              <span>Profil</span>
              <span>Paylaşım</span>
              <span>Toplama</span>
              <span>Son yoxlama</span>
            </div>
            {profiles.map((p) => (
              <ProfileAccordion
                key={p.id}
                profile={{
                  id: p.id,
                  username: p.username,
                  count: p._count.postLinks,
                  active: p.active,
                  schedule: p.active
                    ? p.collectionFrom
                      ? `Hər ${p.intervalHours} saat`
                      : "Tarix seçilməyib"
                    : "Dayandırılıb",
                  range:
                    p.collectionFrom && p.collectionUntil
                      ? `${bakuDay(p.collectionFrom)} → ${bakuDay(new Date(p.collectionUntil.getTime() - 1))}`
                      : "Tarix seçilməyib",
                  checked: dateTime(p.lastCheckedAt),
                }}
              />
            ))}
          </div>
        )}
      </section>
      {total > 50 && (
        <nav className="pagination" aria-label="Profil səhifələri">
          {page > 1 && (
            <Link href={`?q=${encodeURIComponent(q)}&page=${page - 1}`}>
              Əvvəlki
            </Link>
          )}
          <span>
            {page} / {Math.ceil(total / 50)}
          </span>
          {page * 50 < total && (
            <Link href={`?q=${encodeURIComponent(q)}&page=${page + 1}`}>
              Növbəti
            </Link>
          )}
        </nav>
      )}
    </Shell>
  );
}
