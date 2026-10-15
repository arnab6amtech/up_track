import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export interface TokenOwner {
  name: string;
}

/**
 * MCP_TOKENS holds comma-separated tokens, each optionally named: "alice:tok1,bob:tok2" or just "tok1".
 * Names show up in the server log so you can tell who called what.
 */
function configuredTokens(): { name: string; digest: Buffer }[] {
  return (process.env.MCP_TOKENS ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((entry, i) => {
      const sep = entry.indexOf(":");
      const [name, token] = sep > 0 ? [entry.slice(0, sep), entry.slice(sep + 1)] : [`token-${i + 1}`, entry];
      return { name, digest: digest(token) };
    });
}

// Comparing fixed-length digests keeps the comparison constant-time regardless of token length.
const digest = (token: string) => createHash("sha256").update(token).digest();

export function mcpEnabled(): boolean {
  return configuredTokens().length > 0;
}

export function authenticate(request: Request): TokenOwner | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const given = digest(match[1].trim());
  const owner = configuredTokens().find((t) => timingSafeEqual(t.digest, given));
  return owner ? { name: owner.name } : null;
}
