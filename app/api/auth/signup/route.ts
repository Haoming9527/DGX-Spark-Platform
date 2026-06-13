import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "../../../../lib/db";
import { hashPassword, generateToken } from "../../../../lib/auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, email, password, referralCode } = body;

    // --- Input presence check ---
    if (!username || !email || !password || !referralCode) {
      return NextResponse.json(
        { error: "Username, email, password, and referral code are all required fields." },
        { status: 400 }
      );
    }

    // --- Input length limits (prevent bcrypt DoS and DB overflow) ---
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

    // --- Email format validation ---
    if (!EMAIL_REGEX.test(email.trim())) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    // --- Referral code check (timing-safe to prevent side-channel attacks) ---
    const systemReferral = process.env.REFERRAL_CODE;
    if (!systemReferral) {
      console.warn("REFERRAL_CODE is not set in .env. Denying signup.");
      return NextResponse.json(
        { error: "Signup is currently disabled." },
        { status: 503 }
      );
    }

    let referralValid = false;
    try {
      // SECURITY: timingSafeEqual requires same-length buffers.
      // Pad/hash both to equal lengths to avoid length-based timing leaks.
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

    // --- Duplicate check ---
    const existingUser = await query(
      "SELECT id FROM users WHERE username = $1 OR email = $2 LIMIT 1",
      [cleanUsername, cleanEmail]
    );

    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { error: "Username or email is already registered." },
        { status: 400 }
      );
    }

    // SECURITY: hashPassword is now async — does not block the event loop.
    const passwordHash = await hashPassword(password);

    const insertResult = await query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email",
      [cleanUsername, cleanEmail, passwordHash]
    );

    const newUser = insertResult.rows[0];

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
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error("Signup error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
