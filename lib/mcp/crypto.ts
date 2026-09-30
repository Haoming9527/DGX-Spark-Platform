import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ApiRequestError } from "../apiRequest";

function encryptionKey() {
  const value = process.env.MCP_ENCRYPTION_KEY?.trim() ?? "";
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    throw new ApiRequestError(503, "MCP is not configured. Set MCP_ENCRYPTION_KEY on the website server.");
  }
  return key;
}

export function mcpConfigured() {
  try { encryptionKey(); return true; } catch { return false; }
}

export function seal(value: unknown, context: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function unseal<T>(value: string, context: string): T {
  const key = encryptionKey();
  try {
    const data = Buffer.from(value, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8")) as T;
  } catch {
    throw new ApiRequestError(503, "MCP credentials could not be unlocked. Check the website encryption key.");
  }
}

export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
