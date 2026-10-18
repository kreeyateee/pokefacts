"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="font-display text-3xl">The field guide hit a snag.</h1>
      <p className="text-sm leading-6 text-[#cbbfa8]">{error.message}</p>
      <button
        type="button"
        className="h-10 rounded-lg bg-[#d64532] px-4 text-sm font-medium text-white"
        onClick={reset}
      >
        Try again
      </button>
    </main>
  );
}
