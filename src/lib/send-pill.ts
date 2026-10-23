/** What the small round progress button shows while the send panel is hidden. */
export type PillState =
  | { kind: "percent"; percent: number }
  | { kind: "working" }
  | { kind: "done" }
  | { kind: "failed" };

export function pillState(job: { status: string; done?: number; total?: number }): PillState {
  if (job.status === "failed") return { kind: "failed" };
  if (job.status === "completed") return { kind: "done" };
  const { done, total } = job;
  if (typeof done === "number" && typeof total === "number" && total > 0) {
    return { kind: "percent", percent: Math.max(0, Math.min(100, Math.round((done / total) * 100))) };
  }
  return { kind: "working" };
}

/**
 * A hidden panel opens again when the send moves on to finished or failed, because those need a look.
 * The hide only counts for the status it was made at.
 */
export function isHidden(hiddenAt: string | null, status: string): boolean {
  return hiddenAt !== null && hiddenAt === status;
}
