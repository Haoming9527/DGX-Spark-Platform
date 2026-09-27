import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "./account";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is not set. Refusing to start.");
}

export const SESSION_COOKIE = "token";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: { userId: string; username: string; email: string; role?: string }): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: "7d" });
}

export interface UserSession {
  userId: string;
  username: string;
  email: string;
  role?: UserRole;
}

export function verifyToken(token: string): UserSession | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET!) as {
      userId?: string;
      username?: string;
      email?: string;
      role?: string;
    } | string;
    if (decoded && typeof decoded !== "string" && decoded.userId && decoded.username && decoded.email) {
      return {
        userId: decoded.userId,
        username: decoded.username,
        email: decoded.email,
        role: decoded.role === "admin" || decoded.role === "operator" ? decoded.role : "user",
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function getSession(req: NextRequest): UserSession | null {
  const cookieToken = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookieToken) {
    const session = verifyToken(cookieToken);
    if (session) return session;
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (token) {
      const session = verifyToken(token);
      if (session) return session;
    }
  }

  return null;
}

export function applySessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(0),
    path: "/",
  });
}

export function unauthorizedResponse(clearCookie = false) {
  const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (clearCookie) clearSessionCookie(response);
  return response;
}
