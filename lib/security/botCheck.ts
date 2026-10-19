import "server-only";
import { checkBotId } from "botid/server";
import { ApiRequestError } from "./apiRequest";

export const BOT_CHECK = "BOT_CHECK";

export async function requireHuman() {
  const verification = await checkBotId({ advancedOptions: { checkLevel: "basic" } });
  if (verification.isBot) {
    throw new ApiRequestError(403, "Your browser couldn't be verified. Refresh the page and try again.", BOT_CHECK);
  }
}
