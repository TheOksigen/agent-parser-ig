import { handleAdmin } from "@/lib/admin-api";
import { api } from "@/lib/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  return api((req) => handleAdmin(req, action))(request);
}
