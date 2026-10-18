import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Database drivers load native/WebAssembly files at runtime, so they stay out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  experimental: {
    // Room for workbook uploads on the Import page (capped at 25 MB in the action itself).
    serverActions: { bodySizeLimit: "30mb" },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
