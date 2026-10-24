import { handleAgent } from "@/lib/agent-api";
import { api } from "@/lib/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  return api((req) => handleAgent(req, action))(request);
}
