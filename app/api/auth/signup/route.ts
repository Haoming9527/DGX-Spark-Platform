import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "../../../../lib/prisma";
import { hashPassword, generateToken } from "../../../../lib/auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, email, password, referralCode } = body;

    if (!username || !email || !password || !referralCode) {
      return NextResponse.json(
        { error: "Username, email, password, and referral code are all required fields." },
        { status: 400 }
      );
    }

    if (typeof username !== "string" || username.trim().length < 3 || username.trim().length > 50) {
      return NextResponse.json({ error: "Username must be between 3 and 50 characters." }, { status: 400 });
    }
    if (typeof email !== "string" || email.trim().length > 255) {
      return NextResponse.json({ error: "Email address is too long." }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: "Password must be between 8 and 128 characters." }, { status: 400 });
    }
    if (typeof referralCode !== "string" || referralCode.length > 200) {
      return NextResponse.json({ error: "Invalid referral code." }, { status: 400 });
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const systemReferral = process.env.REFERRAL_CODE;
    if (!systemReferral) {
      console.warn("REFERRAL_CODE is not set in .env. Denying signup.");
      return NextResponse.json({ error: "Signup is currently disabled." }, { status: 503 });
    }

    let referralValid = false;
    try {
      const a = Buffer.from(crypto.createHash("sha256").update(referralCode).digest("hex"));
      const b = Buffer.from(crypto.createHash("sha256").update(systemReferral).digest("hex"));
      referralValid = crypto.timingSafeEqual(a, b);
    } catch {
      referralValid = false;
    }

    if (!referralValid) {
      return NextResponse.json(
        { error: "Invalid referral code. Access restricted." },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username: cleanUsername }, { email: cleanEmail }],
      },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Username or email is already registered." },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        username: cleanUsername,
        email: cleanEmail,
        passwordHash,
        referralCode: referralCode.trim().slice(0, 100),
      },
      select: { id: true, username: true, email: true },
    });

    const token = generateToken({
      userId: newUser.id,
      username: newUser.username,
      email: newUser.email,
    });

    const response = NextResponse.json({
      message: "Registration successful",
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
      },
    });

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error("Signup error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
