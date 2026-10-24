import { appendFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

import { cleanFeedback } from "@/lib/demos";

/** One line of JSON per vote or note, in a file for each demo. Read on the server; never served. */
const FEEDBACK_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "demo-feedback");
const FEEDBACK_FILE_LIMIT = 5_000_000;

export async function POST(request: Request) {
  const feedback = cleanFeedback(await request.json().catch(() => null));
  if (!feedback) return Response.json({ error: "Pick a thumb or write a note first." }, { status: 400 });
  await mkdir(FEEDBACK_ROOT, { recursive: true });
  const file = path.join(FEEDBACK_ROOT, `${feedback.slug}.jsonl`);
  // Far more than people would write. Stops a script filling the disk.
  const size = await stat(file).then((info) => info.size, () => 0);
  if (size > FEEDBACK_FILE_LIMIT) return Response.json({ error: "Feedback is full for now. Thank you!" }, { status: 429 });
  const line = JSON.stringify({ at: new Date().toISOString(), ...feedback });
  await appendFile(file, `${line}\n`);
  return Response.json({ ok: true });
}
