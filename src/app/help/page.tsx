"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BrandHomeLink } from "@/components/brand-logo";
import { ConnectDialog } from "@/components/connect-dialog";
import { SetupGuide } from "@/components/setup-guide";

export default function HelpPage() {
  const router = useRouter();
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <div className="pk-page min-h-dvh">
      <header className="mx-auto w-full min-w-0 max-w-3xl px-4 pt-5 sm:px-6">
        <BrandHomeLink />
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <SetupGuide
          onConnect={() => setConnectOpen(true)}
          onHome={() => router.push("/")}
        />
      </main>
      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
}
