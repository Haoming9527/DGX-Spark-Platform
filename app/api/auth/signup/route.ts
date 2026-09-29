import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "../../../../lib/prisma";
import { hashPassword, generateToken, applySessionCookie } from "../../../../lib/auth";
import { loadAccount, publicUser } from "../../../../lib/account";
import { clientKey, takeRateLimit } from "../../../../lib/rateLimit";
import { apiFailure, readJsonBody } from "../../../../lib/apiRequest";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    if (!await takeRateLimit(`signup:${clientKey(req)}`, { limit: 5, windowMs: 15 * 60 * 1000 })) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const body = await readJsonBody(req);
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
      },
      select: { id: true, username: true, email: true },
    });

    const account = await loadAccount(newUser.id);
    if (!account) {
      return NextResponse.json({ error: "Failed to create user." }, { status: 500 });
    }

    const token = generateToken({
      userId: account.id,
      username: account.username,
      email: account.email,
      role: account.role,
    });

    const response = NextResponse.json({
      message: "Registration successful",
      user: publicUser(account),
    });

    applySessionCookie(response, token);
    return response;
  } catch (error: unknown) {
    return apiFailure(error, "Signup error:");
  }
}
