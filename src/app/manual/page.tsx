import Link from "next/link";
import { Users } from "lucide-react";
import { ManualCollectionForm, AutoRefresh } from "@/components/controls";
import { ProfileAccordion } from "@/components/profile-accordion";
import { Empty, PageHeading, Shell } from "@/components/shell";
import { requirePageAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { bakuDay, dateTime, type Params } from "@/lib/filters";

export default async function ManualPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePageAdmin();
  const params = await searchParams;
  const q = (Array.isArray(params.q) ? params.q[0] : params.q ?? "").trim().replace(/^@/, "").slice(0, 30);
  const page = Math.min(100000, Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1));
  const where = { username: { contains: q, mode: "insensitive" as const } };
  const [profiles, total] = await Promise.all([
    db.profile.findMany({ where, include: { _count: { select: { postLinks: true } } }, orderBy: { username: "asc" }, take: 50, skip: (page - 1) * 50 }),
    db.profile.count({ where }),
  ]);
  const today = bakuDay();
  return (
    <Shell active="/manual">
      <AutoRefresh />
      <PageHeading eyebrow="ƏL İLƏ TOPLAMA" title="Əl ilə profil topla" description="Profil və tarix aralığını seçin, toplanmış paylaşımlara aşağıda baxın." />
      <ManualCollectionForm from={bakuDay(new Date(Date.now() - 30 * 86400000))} to={today} today={today} profile={q} />
      <div className="section-heading"><h2>Profillər <span className="count">{total}</span></h2></div>
      <form className="inline-search" action="/manual">
        <label htmlFor="manual-search" className="sr-only">Profil axtar</label>
        <input id="manual-search" name="q" defaultValue={q} key={q} placeholder="İstifadəçi adı ilə axtar…" maxLength={30} />
        <button className="button secondary">Axtar</button>
        {q && <Link className="button secondary" href="/manual">Hamısını göstər</Link>}
      </form>
      <section className="panel">
        {!profiles.length ? <Empty title={q ? "Profil tapılmadı" : "Profil siyahısı boşdur"} icon={Users}><p>{q ? "Başqa istifadəçi adı ilə axtarın və ya yuxarıdan profil əlavə edin." : "Yuxarıdan profil əlavə edib toplamanı başladın."}</p></Empty> : <div className="profile-list">
          <div className="profile-list-heading"><span>Profil</span><span>Paylaşım</span><span>Toplama</span><span>Son yoxlama</span></div>
          {profiles.map((p) => <ProfileAccordion key={p.id} compact profile={{ id: p.id, username: p.username, count: p._count.postLinks, active: p.active, schedule: p.active ? p.collectionFrom ? `Hər ${p.intervalHours} saat` : "Tarix seçilməyib" : "Dayandırılıb", range: p.collectionFrom && p.collectionUntil ? `${bakuDay(p.collectionFrom)} → ${bakuDay(new Date(p.collectionUntil.getTime() - 1))}` : "Tarix seçilməyib", checked: dateTime(p.lastCheckedAt) }} />)}
        </div>}
      </section>
      {total > 50 && <nav className="pagination" aria-label="Profil səhifələri">
        {page > 1 && <Link href={`?q=${encodeURIComponent(q)}&page=${page - 1}`}>Əvvəlki</Link>}
        <span>{page} / {Math.ceil(total / 50)}</span>
        {page * 50 < total && <Link href={`?q=${encodeURIComponent(q)}&page=${page + 1}`}>Növbəti</Link>}
      </nav>}
    </Shell>
  );
}
