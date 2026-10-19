export function StatusBar({
  label,
  done,
  total,
  failed = false,
}: {
  label: string;
  done?: number;
  total?: number;
  failed?: boolean;
}) {
  const known = typeof done === "number" && typeof total === "number" && total > 0;
  const pct = known ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
  return (
    <div className="mt-3">
      <p className={`text-sm leading-6 ${failed ? "pk-danger" : "pk-status"}`} role="status">
        {label}
      </p>
      <div
        className="pk-bar mt-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={known ? total : undefined}
        aria-valuenow={known ? Math.min(done, total) : undefined}
        aria-valuetext={label}
      >
        <div
          className={`pk-bar-fill${known ? "" : " pk-bar-indeterminate"}${failed ? " pk-bar-failed" : ""}`}
          style={known ? { width: `${pct}%` } : undefined}
        />
      </div>
    </div>
  );
}
