import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { api, HttpError } from "@/lib/http";
import { postView } from "@/lib/post-view";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async (req) => {
    await requireAdmin(req);
    const { id } = await params;
    const cursor = new URL(req.url).searchParams.get("cursor");
    const profile = await db.profile.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!profile) throw new HttpError(404, "PROFILE", "Profil tapılmadı.");
    const where = { profileLinks: { some: { profileId: id } } };
    if (
      cursor &&
      (cursor.length > 100 ||
        !(await db.post.findFirst({
          where: { ...where, id: cursor },
          select: { id: true },
        })))
    )
      throw new HttpError(400, "CURSOR", "Səhifə göstəricisi düzgün deyil.");
    const posts = await db.post.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 11,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return Response.json(
      {
        posts: posts.slice(0, 10).map(postView),
        nextCursor: posts.length > 10 ? posts[9].id : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  })(request);
}
