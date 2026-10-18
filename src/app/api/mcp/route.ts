import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { after } from "next/server";
import { createMcpServer } from "@/lib/mcp/server";
import { publicOrigin } from "@/lib/origin";
import { authenticateToken } from "@/server/tokens";

const rpcError = (status: number, message: string, headers: Record<string, string> = {}) =>
  Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status, headers });

/** MCP over Streamable HTTP, stateless: every POST gets a fresh server acting as the token's owner. */
export async function POST(request: Request) {
  const caller = await authenticateToken(request);
  if (!caller) {
    return rpcError(401, "Missing, revoked or expired token. Create one under API tokens in UpTrack and send 'Authorization: Bearer <token>'.", {
      "WWW-Authenticate": 'Bearer realm="uptrack"',
    });
  }
  const server = createMcpServer({ baseUrl: await publicOrigin(), caller });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
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
