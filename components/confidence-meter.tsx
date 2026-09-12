/** Three segments plus a word — confidence is never colour alone. */
export function ConfidenceMeter({
  confidence,
  ungrounded,
}: {
  confidence: number;
  ungrounded?: boolean;
}) {
  const level = ungrounded || confidence < 0.5 ? "low" : confidence < 0.85 ? "medium" : "high";
  const filled = { low: 1, medium: 2, high: 3 }[level];
  const fill = { low: "var(--bad-fill)", medium: "var(--warn-fill)", high: "var(--ok-fill)" }[level];
  const tone = { low: "var(--bad)", medium: "var(--warn)", high: "var(--ok)" }[level];

  return (
    <span className="flex shrink-0 items-center gap-1.5" title={`confidence ${confidence.toFixed(2)}`}>
      <span className="flex gap-[2px]" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2.5 w-1.5 rounded-[1px]"
            style={{ background: i < filled ? fill : "var(--border)" }}
          />
        ))}
      </span>
      <span className="font-mono text-[11px] tabular-nums" style={{ color: tone }}>
        {level}
      </span>
    </span>
  );
}
