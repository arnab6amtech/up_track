import { z } from "zod";
import { verifyCredentials } from "@/server/auth/credentials";
import { endExtensionSession, startExtensionSession, userForSession } from "@/server/auth/session";

const credentials = z.object({ email: z.string().trim().min(1), password: z.string().min(1) });

/**
 * Signs the browser extension in with an email and password. The extension keeps the session token it
 * gets back and sends it as "Authorization: Bearer ses_…".
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send your email and password as JSON." }, { status: 400 });
  }
  const parsed = credentials.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Enter your email and password." }, { status: 400 });
  const userId = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!userId) return Response.json({ error: "That email and password don't match an account." }, { status: 401 });
  const { token, expiresAt } = await startExtensionSession(userId, request);
  const user = await userForSession(token);
  return Response.json({ token, expiresAt, user: { name: user?.fullName ?? "", email: user?.email ?? "" } }, { status: 201 });
}

/** Signs the extension out: its session stops working at once. */
export async function DELETE(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(ses_\S+)$/i)?.[1];
  if (token) await endExtensionSession(token);
  return new Response(null, { status: 204 });
}
