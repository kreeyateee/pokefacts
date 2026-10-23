import type { Metadata } from "next";

import { BrandHomeLink } from "@/components/brand-logo";
import { RadioPage } from "@/components/radio-page";
import { RADIO_SUMMARY, RADIO_TITLE } from "@/lib/radio/radio-feed";

export const metadata: Metadata = {
  title: RADIO_TITLE,
  description: RADIO_SUMMARY,
  alternates: { types: { "application/rss+xml": "/radio/feed.xml" } },
};

export default function Radio() {
  return (
    <div className="pk-page min-h-dvh">
      <header className="mx-auto w-full min-w-0 max-w-3xl px-4 pt-5 sm:px-6">
        <BrandHomeLink />
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <RadioPage />
      </main>
    </div>
  );
}
