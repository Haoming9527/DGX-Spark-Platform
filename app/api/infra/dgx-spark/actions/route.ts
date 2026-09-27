import { NextRequest } from "next/server";
import { requirePowerOperatorRequest } from "@/lib/requireAccount";
import { readSparkAction, runSparkAction, sparkFailure } from "@/lib/infra/sparkGateway";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const gate = await requirePowerOperatorRequest(req);
    if (gate.error) {
      gate.error.headers.set("Cache-Control", "no-store");
      return gate.error;
    }
    const action = await readSparkAction(req);
    return await runSparkAction(req, action, gate.account.id);
  } catch (error) {
    return sparkFailure(error);
  }
}
