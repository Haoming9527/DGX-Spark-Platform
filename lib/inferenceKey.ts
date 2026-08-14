import { NextRequest } from "next/server";
import { getSession } from "./auth";
import { loadAccount } from "./account";
import { requireInferenceGateway } from "./inferenceGateway";

export async function inferenceKeyForRequest(req: NextRequest): Promise<{ base: string; apiKey: string }> {
  const { base, apiKey, adminKey } = requireInferenceGateway();
  const session = getSession(req);
  if (!session || !adminKey) {
    return { base, apiKey };
  }
  const account = await loadAccount(session.userId);
  if (!account || account.disabled || account.role !== "admin") {
    return { base, apiKey };
  }
  return { base, apiKey: adminKey };
}
