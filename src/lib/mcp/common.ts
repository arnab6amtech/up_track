import type { NetworkEntry } from "../capture-types";

export const MAX_IMAGE_BYTES = 4_500_000;

export type ToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
export type ToolResult = { content: ToolContent[]; isError?: boolean };

export const text = (t: string): ToolResult => ({ content: [{ type: "text", text: t }] });
export const json = (value: unknown): ToolResult => text(JSON.stringify(value, null, 2));
export const fail = (t: string): ToolResult => ({ content: [{ type: "text", text: t }], isError: true });

export const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max)}…` : value);

export const describeCall = (e: NetworkEntry) =>
  `${e.method} ${e.url} → ${e.status || `failed${e.error ? ` (${e.error})` : ""}`} in ${Math.round(e.durationMs)} ms`;
