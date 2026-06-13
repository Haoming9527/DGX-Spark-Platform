import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { comparePassword, hashPassword, generateToken, getSession } from "../../../../lib/auth";

// GET: Check current session status.
export async function GET(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }
    return NextResponse.json({ authenticated: true, user: session }, { status: 200 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: Sign in
export async function POST(req: NextRequest) {
  try {
    const { identifier, password } = await req.json();

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

    const result = await query(
      "SELECT id, username, email, password_hash FROM users WHERE username = $1 OR email = $2 LIMIT 1",
      [clean, clean.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Invalid username/email or password." },
        { status: 401 }
      );
    }

    const user = result.rows[0];

    const isBcrypt = typeof user.password_hash === "string" &&
      /^\$2[ayb]\$[0-9]{2}\$[A-Za-z0-9./]{53}$/.test(user.password_hash);

    let isMatch = false;
    if (isBcrypt) {
      isMatch = await comparePassword(password, user.password_hash);
    } else {
      isMatch = (password === user.password_hash);
      if (isMatch) {
        try {
          const hashed = await hashPassword(password);
          await query(
            "UPDATE users SET password_hash = $1 WHERE id = $2",
            [hashed, user.id]
          );
          console.log(`Auto-hashed plaintext password reset for user ${user.username}`);
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

    const token = generateToken({
      userId: user.id,
      username: user.username,
      email: user.email,
    });

    const response = NextResponse.json({
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
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
    console.error("Login error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: Log out — clears the JWT cookie
export async function DELETE(_req: NextRequest) {
  const response = NextResponse.json({ message: "Logout successful" });
  response.cookies.set("token", "", {
    httpOnly: true,
    expires: new Date(0),
    path: "/",
  });
  return response;
}
