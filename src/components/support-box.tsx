import { DONATE_LABEL } from "@/lib/send-cheer";
import { DONATE_URL, SUPPORT_GOAL } from "@/lib/site";

/** A quiet ask above the footer: what the money is for, the goal, and the coffee link. No progress bar. */
export function SupportBox() {
  return (
    <section
      className="mx-auto mb-5 w-full min-w-0 max-w-5xl px-4 sm:px-6"
      aria-labelledby="support-heading"
    >
      <div className="pk-panel flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="support-heading" className="font-display text-xl leading-tight">
            Help keep Pokefacts running
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6">
            Pokefacts is free, with no ads. It runs on a small server that costs money every month. The goal is{" "}
            {SUPPORT_GOAL} to keep it going.
          </p>
        </div>
        <a
          className="pk-banner-btn shrink-0 self-start sm:self-center"
          href={DONATE_URL}
          target="_blank"
          rel="noreferrer"
        >
          {DONATE_LABEL}
        </a>
      </div>
    </section>
  );
}
