import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRequest } from "@/lib/requireAdminRequest";
import { gatewayAuthHeaders, requireInferenceGateway } from "@/lib/inferenceGateway";

function normalizeModel(name: string): string {
  const trimmed = name.trim();
  if (trimmed.toLowerCase().endsWith(":latest")) {
    return trimmed.slice(0, -":latest".length);
  }
  return trimmed;
}

export async function GET(req: NextRequest) {
  try {
    const gate = await requireAdminRequest(req);
    if (gate.error) return gate.error;

    const { base, adminKey, apiKey } = requireInferenceGateway();
    const key = adminKey || apiKey;
    const tagsRes = await fetch(`${base}/olla/ollama/api/tags`, {
      headers: gatewayAuthHeaders(key),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const tags = tagsRes.ok ? await tagsRes.json() : { models: [] };
    const live: string[] = Array.isArray(tags?.models)
      ? tags.models.map((m: { name?: string }) => String(m.name || "")).filter(Boolean)
      : [];

    const restricted = await prisma.restrictedModel.findMany({
      orderBy: { modelName: "asc" },
    });
    const restrictedSet = new Set(restricted.map((r) => normalizeModel(r.modelName)));

    return NextResponse.json({
      models: live.map((name) => ({
        name,
        restricted: restrictedSet.has(normalizeModel(name)),
      })),
      restricted: restricted.map((r) => r.modelName),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const gate = await requireAdminRequest(req);
    if (gate.error) return gate.error;

    const body = await req.json();
    const rawName = typeof body.modelName === "string" ? body.modelName : "";
    const modelName = normalizeModel(rawName);
    if (!modelName || modelName.length > 256) {
      return NextResponse.json({ error: "Invalid model name." }, { status: 400 });
    }
    if (typeof body.restricted !== "boolean") {
      return NextResponse.json({ error: "restricted must be boolean." }, { status: 400 });
    }

    if (body.restricted) {
      await prisma.restrictedModel.upsert({
        where: { modelName },
        create: { modelName },
        update: {},
      });
    } else {
      await prisma.restrictedModel.deleteMany({ where: { modelName } });
    }

    return NextResponse.json({ modelName, restricted: body.restricted });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
