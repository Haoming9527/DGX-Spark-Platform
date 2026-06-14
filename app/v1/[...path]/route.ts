import { NextRequest } from "next/server";
import { unsupportedOpenAiEndpoint } from "../../../lib/openaiGateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleUnsupported(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return unsupportedOpenAiEndpoint(path.map(decodeURIComponent).join("/"), req.method);
}

export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleUnsupported(req, context);
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleUnsupported(req, context);
}

export async function PUT(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleUnsupported(req, context);
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleUnsupported(req, context);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleUnsupported(req, context);
}
