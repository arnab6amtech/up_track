import "server-only";
import { headers } from "next/headers";

/** This app's public address: PUBLIC_URL if set, otherwise worked out from the current request. */
export async function publicOrigin(): Promise<string> {
  const configured = process.env.PUBLIC_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}
