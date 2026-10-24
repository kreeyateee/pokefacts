import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { cleanFeedback } from "@/lib/demos";

/** One line of JSON per vote or note, in a file for each demo. Read on the server; never served. */
const FEEDBACK_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "demo-feedback");

export async function POST(request: Request) {
  const feedback = cleanFeedback(await request.json().catch(() => null));
  if (!feedback) return Response.json({ error: "Pick a thumb or write a note first." }, { status: 400 });
  await mkdir(FEEDBACK_ROOT, { recursive: true });
  const line = JSON.stringify({ at: new Date().toISOString(), ...feedback });
  await appendFile(path.join(FEEDBACK_ROOT, `${feedback.slug}.jsonl`), `${line}\n`);
  return Response.json({ ok: true });
}
