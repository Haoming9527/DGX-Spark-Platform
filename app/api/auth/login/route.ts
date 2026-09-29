import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { comparePassword, hashPassword, generateToken, getSession, applySessionCookie, clearSessionCookie } from "../../../../lib/auth";
import { loadAccount, publicUser } from "../../../../lib/account";
import { clientKey, takeRateLimit } from "../../../../lib/rateLimit";
import { apiFailure, readJsonBody } from "../../../../lib/apiRequest";

function sessionCookie(response: NextResponse, token: string) {
  applySessionCookie(response, token);
}

export async function GET(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }
    const account = await loadAccount(session.userId);
    if (!account || account.disabled) {
      const response = NextResponse.json({ authenticated: false }, { status: 200 });
      clearSessionCookie(response);
      return response;
    }
    return NextResponse.json({ authenticated: true, user: publicUser(account) }, { status: 200 });
  } catch (error: unknown) {
    return apiFailure(error, "Session lookup failed:");
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!await takeRateLimit(`login:${clientKey(req)}`, { limit: 10, windowMs: 15 * 60 * 1000 })) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const { identifier, password } = await readJsonBody(req);

    if (!identifier || !password) {
      return NextResponse.json(
        { error: "Username/email and password are required." },
        { status: 400 }
      );
    }

    if (typeof identifier !== "string" || identifier.length > 255) {
      return NextResponse.json({ error: "Invalid identifier." }, { status: 400 });
    }
    if (typeof password !== "string" || password.length > 128) {
      return NextResponse.json({ error: "Invalid password." }, { status: 400 });
    }

    const clean = identifier.trim();
    if (!await takeRateLimit(`login-identity:${clean.toLowerCase()}`, { limit: 10, windowMs: 15 * 60 * 1000 })) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: clean }, { email: clean.toLowerCase() }],
      },
      select: { id: true, username: true, email: true, passwordHash: true, disabledAt: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid username/email or password." },
        { status: 401 }
      );
    }

    if (user.disabledAt) {
      return NextResponse.json(
        { error: "Invalid username/email or password." },
        { status: 401 }
      );
    }

    const isBcrypt =
      typeof user.passwordHash === "string" &&
      /^\$2[ayb]\$[0-9]{2}\$[A-Za-z0-9./]{53}$/.test(user.passwordHash);

    let isMatch = false;
    if (isBcrypt) {
      isMatch = await comparePassword(password, user.passwordHash);
    } else {
      isMatch = password === user.passwordHash;
      if (isMatch) {
        try {
          const hashed = await hashPassword(password);
          await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: hashed },
          });
        } catch (err) {
          console.error("Failed to update plaintext password reset:", err);
        }
      }
    }

    if (!isMatch) {
      return NextResponse.json(
        { error: "Invalid username/email or password." },
        { status: 401 }
      );
    }

    const account = await loadAccount(user.id);
    if (!account || account.disabled) {
      return NextResponse.json(
        { error: "Invalid username/email or password." },
        { status: 401 }
      );
    }

    const token = generateToken({
      userId: account.id,
      username: account.username,
      email: account.email,
      role: account.role,
    });

    const response = NextResponse.json({
      message: "Login successful",
      user: publicUser(account),
    });
    sessionCookie(response, token);
    return response;
  } catch (error: unknown) {
    return apiFailure(error, "Login error:");
  }
}

export async function DELETE() {
  const response = NextResponse.json({ message: "Logout successful" });
  clearSessionCookie(response);
  return response;
}
