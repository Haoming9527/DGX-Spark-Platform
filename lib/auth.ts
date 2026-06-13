import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";


const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is not set. Refusing to start.");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: { userId: string; username: string; email: string }): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: "7d" });
}

export interface UserSession {
  userId: string;
  username: string;
  email: string;
}

export function verifyToken(token: string): UserSession | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET!) as { userId?: string; username?: string; email?: string } | string;
    if (decoded && typeof decoded !== "string" && decoded.userId && decoded.username && decoded.email) {
      return {
        userId: decoded.userId,
        username: decoded.username,
        email: decoded.email,
      };
    }
    return null;
  } catch {
    // Token expired, invalid signature, or malformed — all treated the same
    return null;
  }
}

export function getSession(req: NextRequest): UserSession | null {
  // Try Cookie first (browser sessions)
  const cookieToken = req.cookies.get("token")?.value;
  if (cookieToken) {
    const session = verifyToken(cookieToken);
    if (session) return session;
  }

  // Try Authorization header (API key holders using Bearer JWT — not to be
  // confused with user API keys, which are looked up directly in the DB)
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
