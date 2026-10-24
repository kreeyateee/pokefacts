import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BrandHomeLink } from "@/components/brand-logo";
import { DemoPlayer } from "@/components/demo-player";
import { DEMOS, findDemo } from "@/lib/demos";

export function generateStaticParams() {
  return DEMOS.map((demo) => ({ slug: demo.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const demo = findDemo((await params).slug);
  // Shared by link for feedback, so kept out of search results.
  return { title: demo?.title ?? "Demo", robots: { index: false, follow: false } };
}

async function DemoFor({ params }: { params: Promise<{ slug: string }> }) {
  const demo = findDemo((await params).slug);
  if (!demo) notFound();
  return <DemoPlayer demo={demo} />;
}

export default function DemoPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <div className="pk-page min-h-dvh">
      <header className="mx-auto w-full min-w-0 max-w-3xl px-4 pt-5 sm:px-6">
        <BrandHomeLink />
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <Suspense fallback={<p className="text-base leading-7">Loading the demo…</p>}>
          <DemoFor params={params} />
        </Suspense>
      </main>
    </div>
  );
}
