import { BAND_STYLES, bandOf, cn, formatScore } from '../score';

/** Anneau de score, même construction que sur le site (cercle blanc dans une bordure teintée). */
export function ScoreRing({
  score,
  size = 'lg',
  className,
}: {
  score: number;
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const style = BAND_STYLES[bandOf(score)];
  const lg = size === 'lg';
  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div className={cn('relative flex items-center justify-center rounded-full', lg ? 'h-32 w-32' : 'h-16 w-16')}>
        <div className={cn('absolute inset-0 rounded-full border-2', style.border)} />
        <div
          className={cn(
            'z-10 flex flex-col items-center justify-center rounded-full border border-[#e0e0e0] bg-white shadow-sm',
            lg ? 'h-28 w-28' : 'h-14 w-14',
          )}
        >
          <span className={cn('font-bold tracking-tight', style.text, lg ? 'text-4xl' : 'text-xl')}>
            {formatScore(score)}
          </span>
          {lg && <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">/ 10</span>}
        </div>
      </div>
      {lg && (
        <span className={cn('rounded-full px-3 py-1 text-[10px] font-bold tracking-wider uppercase', style.badge)}>
          {style.label}
        </span>
      )}
    </div>
  );
}

export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  const style = BAND_STYLES[bandOf(score)];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums',
        style.badge,
        className,
      )}
    >
      {formatScore(score)}/10
    </span>
  );
}
