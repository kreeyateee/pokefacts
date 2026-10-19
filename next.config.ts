import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "**.trycloudflare.com"],
  cacheComponents: true,
  partialPrefetching: true,
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
