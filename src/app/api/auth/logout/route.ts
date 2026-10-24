import { deleteSession, requireAdmin } from "@/lib/auth";
import { api } from "@/lib/http";
export const POST = api(async (request) => {
  await requireAdmin(request);
  await deleteSession();
  return Response.json({ ok: true });
});
