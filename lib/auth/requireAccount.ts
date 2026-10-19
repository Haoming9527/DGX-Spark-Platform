import { NextRequest, NextResponse } from "next/server";
import { getSession, unauthorizedResponse } from "./auth";
import { loadAccount, type Account } from "./account";

export async function loadOptionalAccount(req: NextRequest): Promise<{
  account: Account | null;
  clearCookie: boolean;
}> {
  const session = getSession(req);
  if (!session) {
    return { account: null, clearCookie: false };
  }
  const account = await loadAccount(session.userId);
  if (!account || account.disabled) {
    return { account: null, clearCookie: true };
  }
  return { account, clearCookie: false };
}

export async function requireActiveAccount(req: NextRequest): Promise<
  { account: Account; error?: undefined } | { account?: undefined; error: ReturnType<typeof unauthorizedResponse> }
> {
  const session = getSession(req);
  if (!session) {
    return { error: unauthorizedResponse(false) };
  }
  const account = await loadAccount(session.userId);
  if (!account || account.disabled) {
    return { error: unauthorizedResponse(true) };
  }
  return { account };
}

export async function requireAdminRequest(req: NextRequest): Promise<
  { admin: Account; error?: undefined } | { admin?: undefined; error: ReturnType<typeof unauthorizedResponse> }
> {
  const session = getSession(req);
  if (!session) {
    return { error: unauthorizedResponse(false) };
  }
  const account = await loadAccount(session.userId);
  if (!account || account.disabled) {
    return { error: unauthorizedResponse(true) };
  }
  if (account.role !== "admin") {
    return { error: unauthorizedResponse(false) };
  }
  return { admin: account };
}

// Always reload the account: revoking the role or disabling it takes effect on
// the next power request, even while an older session cookie remains valid.
export async function requirePowerOperatorRequest(req: NextRequest): Promise<
  { account: Account; error?: undefined } | { account?: undefined; error: NextResponse }
> {
  const gate = await requireActiveAccount(req);
  if (gate.error) return gate;
  if (gate.account.role !== "admin" && gate.account.role !== "operator") {
    return { error: NextResponse.json({ error: "Forbidden", message: "Spark power access requires an operator or admin account." }, { status: 403 }) };
  }
  return gate;
}
