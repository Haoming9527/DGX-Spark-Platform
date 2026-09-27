import { NextRequest } from "next/server";
import { requirePowerOperatorRequest } from "@/lib/requireAccount";
import { readSparkStatus, sparkFailure } from "@/lib/infra/sparkGateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const gate = await requirePowerOperatorRequest(req);
    if (gate.error) {
      gate.error.headers.set("Cache-Control", "no-store");
      return gate.error;
    }
    return await readSparkStatus(req);
  } catch (error) {
    return sparkFailure(error);
  }
}
