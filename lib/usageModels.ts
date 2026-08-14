import { prisma } from "./prisma";
import { loadAccount } from "./account";

export type ModelUsageRow = {
  model: string;
  requests: number;
  tokens: number;
};

export function normalizeModelName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.toLowerCase().endsWith(":latest")) {
    return trimmed.slice(0, -":latest".length);
  }
  return trimmed;
}

export async function restrictedNameSet(): Promise<Set<string>> {
  const rows = await prisma.restrictedModel.findMany({ select: { modelName: true } });
  return new Set(rows.map((r) => normalizeModelName(r.modelName)));
}

export async function filterUsageModels(
  userId: string,
  rows: ModelUsageRow[],
): Promise<ModelUsageRow[]> {
  const account = await loadAccount(userId);
  if (account?.role === "admin" && !account.disabled) {
    return rows;
  }
  const hidden = await restrictedNameSet();
  return rows.filter((row) => {
    if (!row.model) return true;
    return !hidden.has(normalizeModelName(row.model));
  });
}
