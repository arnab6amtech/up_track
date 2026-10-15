import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { after } from "next/server";
import { authenticate, mcpEnabled } from "@/lib/mcp/auth";
import { createMcpServer } from "@/lib/mcp/server";

const rpcError = (status: number, message: string, headers: Record<string, string> = {}) =>
  Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status, headers });

/** MCP over Streamable HTTP, stateless: every POST gets a fresh server, so nothing is kept between calls. */
export async function POST(request: Request) {
  if (!mcpEnabled()) return rpcError(503, "UpTrack's MCP endpoint is turned off. Set MCP_TOKENS on the server to enable it.");
  const caller = authenticate(request);
  if (!caller) {
    return rpcError(401, "Missing or invalid token. Send 'Authorization: Bearer <token>'.", {
      "WWW-Authenticate": 'Bearer realm="uptrack"',
    });
  }

  const baseUrl = process.env.PUBLIC_URL?.trim().replace(/\/$/, "") || new URL(request.url).origin;
  const server = createMcpServer({ baseUrl, caller: caller.name });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  after(() => server.close());
  return transport.handleRequest(request);
}

// Stateless mode has no server-to-client stream or sessions to end.
export function GET() {
  return rpcError(405, "Method not allowed. Send MCP requests with POST.", { Allow: "POST" });
}

export function DELETE() {
  return rpcError(405, "Method not allowed. Send MCP requests with POST.", { Allow: "POST" });
}
