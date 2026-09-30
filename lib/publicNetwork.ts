import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { ApiRequestError } from "./apiRequest";

export function isPublicAddress(address: string): boolean {
  try {
    const ip = ipaddr.parse(address);
    if (ip.range() !== "unicast") return false;
    return ip.kind() === "ipv4" || (ip as ipaddr.IPv6).match(ipaddr.parse("2000::") as ipaddr.IPv6, 3);
  } catch { return false; }
}

export async function resolvePublic(url: URL, signal: AbortSignal) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  signal.throwIfAborted();
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await new Promise<Awaited<ReturnType<typeof lookup>>[]>((resolve, reject) => {
      const abort = () => reject(new ApiRequestError(504, "Connection timed out."));
      signal.addEventListener("abort", abort, { once: true });
      lookup(hostname, { all: true, verbatim: true }).then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", abort));
    });
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new ApiRequestError(400, "Connections to private, local, or reserved networks are not allowed.");
  }
  return addresses;
}
