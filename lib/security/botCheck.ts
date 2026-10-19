import "server-only";
import type { NextRequest } from "next/server";
import { checkBotId } from "botid/server";
import { ApiRequestError } from "./apiRequest";

export const BOT_CHECK = "BOT_CHECK";

export async function requireHuman(req: NextRequest) {
  const verification = await checkBotId();
  if (verification.isBot) {
    console.error("BotID rejected request", {
      path: req.nextUrl.pathname,
      challengeSent: req.headers.has("x-is-human"),
      isHuman: verification.isHuman,
      isVerifiedBot: verification.isVerifiedBot,
      bypassed: verification.bypassed,
      classificationReason: "classificationReason" in verification ? verification.classificationReason : undefined,
    });
    throw new ApiRequestError(403, "Your browser couldn't be verified. Refresh the page and try again.", BOT_CHECK);
  }
}
