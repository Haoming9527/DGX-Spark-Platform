import { NextRequest, NextResponse } from "next/server";
import { generateText, jsonSchema, Output } from "ai";
import { loadOptionalAccount } from "../../../../lib/auth/requireAccount";
import { clientKey, takeRateLimit } from "../../../../lib/security/rateLimit";
import { ApiRequestError, apiFailure, readJsonBody, requireSameOrigin } from "../../../../lib/security/apiRequest";
import { clipHarnessText, FOLLOW_UP_SCHEMA, harnessPhasePrompt } from "../../../../lib/chat/chatHarness";
import { chatModel, reasoningOptions } from "../../../../lib/inference/chatModel";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    const { account, clearCookie } = await loadOptionalAccount(req);
    if (clearCookie) throw new ApiRequestError(401, "Sign in again to continue.");
    const bucket = account ? `followups:${account.id}` : `followups-anon:${clientKey(req)}`;
    if (!await takeRateLimit(bucket, { limit: 10, windowMs: 60_000 })) return NextResponse.json({ followUps: [] });
    const { model, question, answer } = await readJsonBody(req, 32 * 1024);
    if (typeof model !== "string" || !model.trim() || model.length > 256 || typeof question !== "string" || typeof answer !== "string") {
      throw new ApiRequestError(400, "A model, question and answer are required.");
    }
    const { output } = await generateText({
      model: chatModel(account, model.trim()),
      instructions: harnessPhasePrompt("followups"),
      prompt: JSON.stringify({ question: clipHarnessText(question, 600), answer: clipHarnessText(answer, 3200) }),
      output: Output.object({ schema: jsonSchema<{ followUps: string[] }>(FOLLOW_UP_SCHEMA as never) }),
      maxOutputTokens: 256,
      temperature: 0,
      providerOptions: reasoningOptions(false),
      abortSignal: AbortSignal.any([req.signal, AbortSignal.timeout(20_000)]),
    });
    const seen = new Set<string>();
    const followUps = (Array.isArray(output?.followUps) ? output.followUps : [])
      .map(value => typeof value === "string" ? value.trim() : "")
      .filter(value => {
        const key = value.toLowerCase();
        if (!value || value.length > 140 || key === question.trim().toLowerCase() || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 2);
    return NextResponse.json({ followUps }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ApiRequestError) return apiFailure(error, "Follow-ups failed:");
    if (req.signal.aborted) return new NextResponse(null, { status: 499 });
    return NextResponse.json({ followUps: [] });
  }
}
