import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import path from "node:path";

/** The commit this build was made from. An open page compares it with /api/version to spot an update. */
function buildStamp(): string {
  try {
    return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "dev";
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  // The live server deploys by building into a spare folder, then swapping it in (scripts/deploy-vm.sh),
  // so the running site never loses its build. Everywhere else this stays the usual .next.
  distDir: process.env.POKEFACTS_DIST_DIR || ".next",
  allowedDevOrigins: ["127.0.0.1", "**.trycloudflare.com"],
  // The server runs from this folder, so traces are never shipped. data/ holds gigabytes of recorded
  // speech on the live server, and tracing it ran next build out of memory there.
  outputFileTracingExcludes: {
    "/*": ["./data/**/*"],
  },
  env: { NEXT_PUBLIC_POKEFACTS_BUILD: buildStamp() },
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        // HTTPS only from now on, no framing by other sites, and no guessing at file types.
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
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
