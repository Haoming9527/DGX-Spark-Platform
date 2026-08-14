import { prisma } from "./prisma";

export type UserRole = "user" | "admin";

export type Account = {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  disabled: boolean;
};

export async function loadAccount(userId: string): Promise<Account | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true, role: true, disabledAt: true },
  });
  if (!user) return null;
  const role: UserRole = user.role === "admin" ? "admin" : "user";
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

export async function countAdmins(): Promise<number> {
  return prisma.user.count({
    where: { role: "admin", disabledAt: null },
  });
}

export async function requireAdmin(userId: string): Promise<Account | null> {
  const account = await loadAccount(userId);
  if (!account || account.disabled || account.role !== "admin") return null;
  return account;
}
