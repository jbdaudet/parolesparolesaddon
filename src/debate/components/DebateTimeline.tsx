import { useMemo, useState, type MouseEvent } from 'react';
import type { DebateAnalysis, DebatePromise, Speaker } from '../../../shared/debate-types';
import { formatTimestamp } from '../../../shared/time-format';
import { BAND_STYLES, bandOf, cn, formatScore } from '../score';

interface Props {
  analysis: DebateAnalysis;
  currentTime: number;
  selectedId?: string;
  onSelect(promise: DebatePromise): void;
  onSeek(seconds: number): void;
}

/** Teintes neutres par couloir (aucune couleur partisane). */
const LANE_TINTS = ['bg-blue-200', 'bg-sky-200', 'bg-violet-200', 'bg-teal-200'];

const pct = (t: number, duration: number) => `${Math.min(100, Math.max(0, (t / duration) * 100))}%`;

function tickStep(duration: number) {
  if (duration <= 30 * 60) return 5 * 60;
  if (duration <= 100 * 60) return 10 * 60;
  if (duration <= 200 * 60) return 20 * 60;
  return 30 * 60;
}

/** Décale verticalement les pastilles trop proches pour qu'elles restent cliquables. */
function stackLevels(promises: DebatePromise[], duration: number): Map<string, number> {
  const levels = new Map<string, number>();
  const lastAt: number[] = [];
  for (const p of [...promises].sort((a, b) => a.start - b.start)) {
    const x = (p.start / duration) * 100;
    let level = 0;
    while (lastAt[level] !== undefined && x - lastAt[level] < 2) level++;
    lastAt[level] = x;
    levels.set(p.id, Math.min(level, 2));
  }
  return levels;
}

export function DebateTimeline({ analysis, currentTime, selectedId, onSelect, onSeek }: Props) {
  const duration = Math.max(analysis.video.durationSec, 1);
  const candidates = analysis.speakers.filter((s) => s.role === 'candidate');
  const [hovered, setHovered] = useState<DebatePromise | null>(null);

  const ticks = useMemo(() => {
    const step = tickStep(duration);
    return Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => i * step);
  }, [duration]);

  const seekFromClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(((e.clientX - rect.left) / rect.width) * duration);
  };

  const playhead = (
    <div
      className="pointer-events-none absolute inset-y-0 z-30 w-0.5 -translate-x-1/2 bg-blue-600/70"
      style={{ left: pct(currentTime, duration) }}
    />
  );

  const lane = (speaker: Speaker, index: number) => {
    const promises = analysis.promises.filter((p) => p.speakerId === speaker.id);
    const levels = stackLevels(promises, duration);
    const segments = analysis.transcript.filter((s) => s.speakerId === speaker.id);
    return (
      <div key={speaker.id} className="contents">
        <div className="flex flex-col justify-center border-b border-slate-100 py-3 pr-4">
          <span className="truncate text-sm font-bold text-slate-900">{speaker.name}</span>
          {speaker.affiliation && (
            <span className="truncate text-[11px] font-medium text-slate-500">{speaker.affiliation}</span>
          )}
          <span className="mt-1 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            {promises.length} promesse{promises.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="relative h-24 border-b border-slate-100">
          <div className="absolute inset-x-2 inset-y-0 cursor-pointer" onClick={seekFromClick}>
            {/* Temps de parole */}
            {segments.map((s) => (
              <div
                key={s.id}
                className={cn('absolute bottom-3 h-1.5 rounded-full', LANE_TINTS[index % LANE_TINTS.length])}
                style={{
                  left: pct(s.start, duration),
                  width: pct(Math.max(s.end - s.start, duration / 600), duration),
                }}
              />
            ))}
            {/* Promesses */}
            {promises.map((p) => {
              const score = p.evaluation?.data.score;
              const band = score !== undefined ? bandOf(score) : null;
              const selected = p.id === selectedId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(p);
                  }}
                  onMouseEnter={() => setHovered(p)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(p)}
                  onBlur={() => setHovered(null)}
                  aria-label={`${formatTimestamp(p.start)} — ${p.statement}${score !== undefined ? ` — ${formatScore(score)}/10` : ''}`}
                  className={cn(
                    'absolute z-20 -translate-x-1/2 rounded-full border-2 shadow-sm transition-transform hover:scale-125 focus-visible:outline-none',
                    'h-4 w-4',
                    band === null && 'border-white bg-slate-300',
                    band !== null && p.specificity === 'precise' && cn('border-white', BAND_STYLES[band].dot),
                    band !== null && p.specificity === 'vague' && cn('bg-white', BAND_STYLES[band].solidBorder),
                    selected
                      ? 'scale-125 ring-4 ring-blue-500/30'
                      : 'focus-visible:ring-4 focus-visible:ring-blue-500/30',
                  )}
                  style={{ left: pct(p.start, duration), top: `${12 + (levels.get(p.id) ?? 0) * 20}px` }}
                />
              );
            })}
            {playhead}
          </div>
        </div>
      </div>
    );
  };

  const topicsRow = (
    <div key="topics" className="contents">
      <div className="flex items-center border-b border-slate-100 py-2 pr-4">
        <span className="text-[10px] font-bold tracking-[0.2em] text-blue-600 uppercase">Thèmes</span>
      </div>
      <div className="relative h-10 border-b border-slate-100">
        <div className="absolute inset-x-2 inset-y-0">
          {analysis.topics.map((t, i) => {
            const active = currentTime >= t.start && currentTime < t.end;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSeek(t.start)}
                title={`${formatTimestamp(t.start)} — ${t.title}`}
                className={cn(
                  'absolute inset-y-1 truncate rounded-lg px-2 text-left text-[11px] font-semibold transition-colors',
                  active
                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                    : i % 2
                      ? 'bg-slate-50 text-slate-500'
                      : 'bg-slate-100 text-slate-600',
                  'hover:bg-blue-50 hover:text-blue-700',
                )}
                style={{ left: pct(t.start, duration), width: `calc(${pct(t.end - t.start, duration)} - 2px)` }}
              >
                {t.title}
              </button>
            );
          })}
          {playhead}
        </div>
      </div>
    </div>
  );

  // Débat à deux : thèmes au milieu, « de part et d'autre ». Discours ou débat à plus de deux : thèmes en haut.
  const rows =
    candidates.length === 2
      ? [lane(candidates[0], 0), topicsRow, lane(candidates[1], 1)]
      : [topicsRow, ...candidates.map((c, i) => lane(c, i))];

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-[9rem_1fr] sm:grid-cols-[11rem_1fr]">
          {rows}
          {/* Axe du temps */}
          <div />
          <div className="relative mx-2 h-6">
            {ticks.map((t, i) => (
              <span
                key={t}
                className={cn(
                  'absolute top-1 text-[10px] font-medium whitespace-nowrap text-slate-400 tabular-nums',
                  i === 0 ? '' : t >= duration - 1 ? '-translate-x-full' : '-translate-x-1/2',
                )}
                style={{ left: pct(t, duration) }}
              >
                {formatTimestamp(t)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Zone de survol (évite les infobulles rognées par le défilement horizontal) */}
      <div className="mt-3 min-h-10 rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-600" aria-live="polite">
        {hovered ? (
          <span>
            <span className="font-mono text-xs font-semibold text-slate-400">{formatTimestamp(hovered.start)}</span>{' '}
            <span className="font-semibold text-slate-900">
              {analysis.speakers.find((s) => s.id === hovered.speakerId)?.name}
            </span>{' '}
            — {hovered.statement}
            {hovered.evaluation && (
              <span className={cn('ml-2 font-bold', BAND_STYLES[bandOf(hovered.evaluation.data.score)].text)}>
                {formatScore(hovered.evaluation.data.score)}/10
              </span>
            )}
          </span>
        ) : (
          <span className="text-slate-400">
            Survolez une pastille pour lire la promesse, cliquez pour l’analyse et la vidéo.
          </span>
        )}
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  const item = (dot: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-3 w-3 rounded-full border-2', dot)} />
      {label}
    </span>
  );
  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-medium text-slate-500">
      {item(cn('border-white', BAND_STYLES.good.dot), 'Réaliste (≥ 7)')}
      {item(cn('border-white', BAND_STYLES.mid.dot), 'Incertaine (4 – 7)')}
      {item(cn('border-white', BAND_STYLES.bad.dot), 'Peu réaliste (< 4)')}
      {item('border-slate-400 bg-white', 'Promesse vague')}
      {item('border-white bg-slate-300', 'Non évaluée')}
    </div>
  );
}
