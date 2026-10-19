import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";
import { publicOrigin } from "@/lib/origin";

const distDir = () => path.resolve(/*turbopackIgnore: true*/ process.cwd(), "extension/dist");

async function collect(dir: string, prefix = ""): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) Object.assign(files, await collect(full, `${name}/`));
    else files[name] = new Uint8Array(await readFile(full));
  }
  return files;
}

/**
 * The browser extension as a zip, ready for "Load unpacked". It includes this server's address so the
 * extension's settings come pre-filled and people only paste their token.
 */
export async function GET() {
  let files: Record<string, Uint8Array>;
  try {
    files = await collect(distDir());
  } catch {
    return new Response("The extension hasn't been built on this server. Run `npm run ext:build`.", { status: 404 });
  }
  const config = { serverUrl: await publicOrigin() };
  files["config.json"] = new TextEncoder().encode(JSON.stringify(config));
  const zip = zipSync({ "uptrack-extension": files }, { level: 6 });
  return new Response(zip as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="uptrack-extension.zip"',
      "Cache-Control": "no-store",
    },
  });
}
