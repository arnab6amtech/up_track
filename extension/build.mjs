// Builds the browser extension into extension/dist. Load that folder with "Load unpacked" in chrome://extensions.
import { context, build } from "esbuild";
import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = `${here}dist`;
const watch = process.argv.includes("--watch");

await rm(dist, { recursive: true, force: true });
await cp(`${here}static`, dist, { recursive: true });

const common = { bundle: true, target: "chrome116", outdir: dist, logLevel: "info", legalComments: "none" };
const configs = [
  // Content scripts, extension pages and the offscreen recorder run as classic scripts.
  {
    ...common,
    format: "iife",
    entryPoints: ["page-recorder", "relay", "recording-bar", "popup", "editor", "offscreen"].map((n) => `${here}src/${n}.ts`),
  },
  // The service worker is declared as a module in the manifest.
  { ...common, format: "esm", entryPoints: [`${here}src/background.ts`] },
];

if (watch) {
  for (const config of configs) await (await context(config)).watch();
  console.log("Watching extension sources…");
} else {
  await Promise.all(configs.map((config) => build(config)));
}
