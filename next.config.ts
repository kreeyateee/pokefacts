import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The live server deploys by building into a spare folder, then swapping it in (scripts/deploy-vm.sh),
  // so the running site never loses its build. Everywhere else this stays the usual .next.
  distDir: process.env.POKEFACTS_DIST_DIR || ".next",
  allowedDevOrigins: ["127.0.0.1", "**.trycloudflare.com"],
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
  turbopack: {
    // This repo, not a package-lock.json sitting in $HOME (Termux).
    root: path.resolve("."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
