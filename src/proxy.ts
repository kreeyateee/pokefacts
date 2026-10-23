import { NextResponse, type NextRequest } from "next/server";

import { budgetFor, RateLimiter, visitorOf } from "@/lib/rate-limit";

const limiter = new RateLimiter();

/** Slows down anyone sending far more requests than a person using the site could. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const wait = limiter.take(visitorOf(request.headers), budgetFor(pathname, request.headers, search));
  if (wait === 0) return NextResponse.next();
  const headers = { "Retry-After": String(wait), "Cache-Control": "no-store" };
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Too many requests. Wait a moment and try again." }, { status: 429, headers });
  }
  return new NextResponse("Too many requests. Wait a moment and try again.", { status: 429, headers });
}

export const config = {
  // Pictures, sounds and built scripts are cheap to serve and load in bursts, so they are never counted.
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|webp|jpg|jpeg|gif|svg|ico|mp3|ogg|wav|woff2?|txt|xml)$).*)"],
};
