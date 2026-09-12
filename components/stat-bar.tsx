import type { GroundStats } from "@/lib/grounding";

/** "pages 1-10 and 16-20" — derived from the run, not hard-coded. */
function SampledNotice({ pages }: { pages: number[] }) {
  const breaks = pages.filter((p, i) => i > 0 && p !== pages[i - 1]! + 1);
  const gap = breaks[0];
  const label = gap
    ? `pages ${pages[0]}–${pages[pages.indexOf(gap) - 1]} and ${gap}–${pages.at(-1)}`
    : `pages ${pages[0]}–${pages.at(-1)}`;
  return (
    <p className="text-[12px]" style={{ color: "var(--accent-text)" }}>
      Long document — extracted from {label}.
    </p>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline gap-2">
    <span className="text-[11px] tracking-wide text-text-muted uppercase">{label}</span>
    <span className="font-mono text-[13px] tabular-nums">{value}</span>
  </div>
);

export function StatBar({
  stats,
  ms,
  totalPages,
  sampledPages,
}: {
  stats: GroundStats;
  ms: number;
  totalPages: number;
  sampledPages: number[] | null;
}) {
  const grounded = stats.present ? Math.round((stats.grounded / stats.present) * 100) : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-border bg-surface px-4 py-2">
      <Stat label="grounded" value={`${grounded}%`} />
      <Stat label="fields" value={`${stats.present}/${stats.total}`} />
      <Stat label="ungrounded" value={String(stats.ungrounded)} />
      <Stat label="pages" value={String(totalPages)} />
      <Stat label="time" value={`${(ms / 1000).toFixed(1)} s`} />
      {sampledPages && <SampledNotice pages={sampledPages} />}
    </div>
  );
}
