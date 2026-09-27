import { prisma } from "./prisma";

export type UserRole = "user" | "operator" | "admin";

export type Account = {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  disabled: boolean;
};

const ADMIN_MUTATION_LOCK = 87201431;

export async function loadAccount(userId: string): Promise<Account | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true, role: true, disabledAt: true },
  });
  if (!user) return null;
  const role: UserRole = user.role === "admin" || user.role === "operator" ? user.role : "user";
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role,
    disabled: Boolean(user.disabledAt),
  };
}

export function publicUser(account: Account) {
  return {
    id: account.id,
    username: account.username,
    email: account.email,
    role: account.role,
  };
}

export async function requireAdmin(userId: string): Promise<Account | null> {
  const account = await loadAccount(userId);
  if (!account || account.disabled || account.role !== "admin") return null;
  return account;
}

export async function applyAdminUserPatch(
  id: string,
  data: { role?: UserRole; disabledAt?: Date | null },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_MUTATION_LOCK})`;
      const target = await tx.user.findUnique({
        where: { id },
        select: { id: true, role: true, disabledAt: true },
      });
      if (!target) {
        throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
      }
      const liveAdmins = await tx.user.count({
        where: { role: "admin", disabledAt: null },
      });
      const isLiveAdmin = target.role === "admin" && !target.disabledAt;
      if (isLiveAdmin && liveAdmins <= 1) {
        if (data.role && data.role !== "admin") {
          throw Object.assign(new Error("LAST_ADMIN_ROLE"), { code: "LAST_ADMIN_ROLE" });
        }
        if (data.disabledAt) {
          throw Object.assign(new Error("LAST_ADMIN_DISABLE"), { code: "LAST_ADMIN_DISABLE" });
        }
      }
      await tx.user.updateMany({ where: { id }, data });
    });
    return { ok: true };
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
    if (code === "NOT_FOUND") return { ok: false, status: 404, error: "User not found." };
    if (code === "LAST_ADMIN_ROLE") return { ok: false, status: 400, error: "Cannot change the last admin's role." };
    if (code === "LAST_ADMIN_DISABLE") return { ok: false, status: 400, error: "Cannot disable the last admin." };
    throw err;
  }
}

export async function deleteUserGuarded(
  id: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_MUTATION_LOCK})`;
      const target = await tx.user.findUnique({
        where: { id },
        select: { id: true, role: true, disabledAt: true },
      });
      if (!target) {
        throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
      }
      const liveAdmins = await tx.user.count({
        where: { role: "admin", disabledAt: null },
      });
      if (target.role === "admin" && !target.disabledAt && liveAdmins <= 1) {
        throw Object.assign(new Error("LAST_ADMIN_DELETE"), { code: "LAST_ADMIN_DELETE" });
      }
      await tx.user.deleteMany({ where: { id } });
    });
    return { ok: true };
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
    if (code === "NOT_FOUND") return { ok: false, status: 404, error: "User not found." };
    if (code === "LAST_ADMIN_DELETE") return { ok: false, status: 400, error: "Cannot delete the last admin." };
    throw err;
  }
}
