import { requireInferenceGateway } from "./inferenceGateway";
import type { Account } from "./account";

export function inferenceKeyForAccount(account: Account | null): { base: string; apiKey: string } {
  const { base, apiKey, adminKey } = requireInferenceGateway();
  if (account?.role === "admin" && adminKey) {
    return { base, apiKey: adminKey };
  }
  return { base, apiKey };
}
