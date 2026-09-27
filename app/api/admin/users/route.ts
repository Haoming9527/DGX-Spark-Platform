import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRequest } from "@/lib/requireAdminRequest";
import { applyAdminUserPatch, deleteUserGuarded, type UserRole } from "@/lib/account";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const gate = await requireAdminRequest(req);
    if (gate.error) return gate.error;

    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const users = await prisma.user.findMany({
      where: q
        ? {
            OR: [
              { username: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        disabledAt: true,
        createdAt: true,
        _count: { select: { apiKeys: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role === "admin" || u.role === "operator" ? u.role : "user",
        disabled: Boolean(u.disabledAt),
        createdAt: u.createdAt,
        keyCount: u._count.apiKeys,
      })),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const gate = await requireAdminRequest(req);
    if (gate.error) return gate.error;

    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const data: { role?: UserRole; disabledAt?: Date | null } = {};

    if (typeof body.role === "string") {
      if (body.role !== "user" && body.role !== "operator" && body.role !== "admin") {
        return NextResponse.json({ error: "Invalid role." }, { status: 400 });
      }
      data.role = body.role;
    }

    if (typeof body.disabled === "boolean") {
      data.disabledAt = body.disabled ? new Date() : null;
    }

    if (Object.keys(data).length > 0) {
      const result = await applyAdminUserPatch(id, data);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
    }

    const updated = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        disabledAt: true,
        createdAt: true,
        _count: { select: { apiKeys: true } },
      },
    });
    return NextResponse.json({
      user: updated && {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        role: updated.role === "admin" || updated.role === "operator" ? updated.role : "user",
        disabled: Boolean(updated.disabledAt),
        createdAt: updated.createdAt,
        keyCount: updated._count.apiKeys,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const gate = await requireAdminRequest(req);
    if (gate.error) return gate.error;

    const id = req.nextUrl.searchParams.get("id") || "";
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
    }

    const result = await deleteUserGuarded(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
