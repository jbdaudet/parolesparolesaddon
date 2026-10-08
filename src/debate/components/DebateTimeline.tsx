import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { DebateAnalysis, DebatePromise, Speaker, Topic, TranscriptSegment } from '../../../shared/debate-types';
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
  if (duration <= 5 * 60) return 30;
  if (duration <= 15 * 60) return 60;
  if (duration <= 30 * 60) return 5 * 60;
  if (duration <= 100 * 60) return 10 * 60;
  if (duration <= 200 * 60) return 20 * 60;
  return 30 * 60;
}

/**
 * Regroupe les prises de parole proches en barres continues (sinon on obtient un pointillé illisible).
 * `gap` : écart maximal, en secondes, entre deux segments fusionnés.
 */
function speakingBars(segments: TranscriptSegment[], gap: number): Array<[number, number]> {
  const bars: Array<[number, number]> = [];
  for (const s of [...segments].sort((a, b) => a.start - b.start)) {
    const last = bars.at(-1);
    if (last && s.start - last[1] <= gap) last[1] = Math.max(last[1], s.end);
    else bars.push([s.start, s.end]);
  }
  return bars;
}

const LABEL_FONT = '600 11px ui-sans-serif, system-ui, sans-serif';
const LABEL_PADDING = 16; // px-2 de chaque côté
let measureCtx: CanvasRenderingContext2D | null = null;

/** Largeur réelle d'un texte dans la police des étiquettes de thème. */
function textWidth(text: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 7;
  measureCtx.font = LABEL_FONT;
  return measureCtx.measureText(text).width;
}

/** Le titre tient-il en entier, sur deux lignes au plus, dans `width` px ? */
function labelFits(title: string, width: number): boolean {
  const available = width - LABEL_PADDING;
  const space = textWidth(' ');
  let lines = 1;
  let line = 0;
  for (const word of title.split(/\s+/)) {
    const w = textWidth(word);
    if (w > available) return false;
    if (line === 0) line = w;
    else if (line + space + w <= available) line += space + w;
    else {
      lines++;
      line = w;
    }
  }
  return lines <= 2;
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
  const [hoveredTopic, setHoveredTopic] = useState<Topic | null>(null);
  // Largeur réelle de la piste, pour n'afficher que les noms de thèmes qui tiennent en entier.
  const track = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setTrackWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Un seul orateur (discours) : le temps de parole n'apporte rien, on ne l'affiche pas.
  const showSpeakingTime = candidates.length > 1;
  const barGap = Math.max(15, duration / 300);

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
    const bars = showSpeakingTime
      ? speakingBars(
          analysis.transcript.filter((s) => s.speakerId === speaker.id),
          barGap,
        )
      : [];
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
            {bars.map(([start, end]) => (
              <div
                key={start}
                className={cn('absolute bottom-3 h-1.5 rounded-full', LANE_TINTS[index % LANE_TINTS.length])}
                style={{ left: pct(start, duration), width: pct(Math.max(end - start, duration / 400), duration) }}
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
      <div className="relative h-12 border-b border-slate-100">
        <div ref={track} className="absolute inset-x-2 inset-y-0">
          {analysis.topics.map((t, i) => {
            const active = currentTime >= t.start && currentTime < t.end;
            const widthPx = ((t.end - t.start) / duration) * trackWidth - 2;
            // Nom affiché seulement s'il tient en entier ; sinon zone teintée, nom au survol.
            const showLabel = trackWidth > 0 && labelFits(t.title, widthPx);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSeek(t.start)}
                onMouseEnter={() => setHoveredTopic(t)}
                onMouseLeave={() => setHoveredTopic(null)}
                onFocus={() => setHoveredTopic(t)}
                onBlur={() => setHoveredTopic(null)}
                aria-label={`${formatTimestamp(t.start)} — ${t.title}`}
                className={cn(
                  'absolute inset-y-1 flex items-center overflow-hidden rounded-lg px-2 text-left text-[11px] leading-tight font-semibold transition-colors',
                  active
                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                    : i % 2
                      ? 'bg-slate-50 text-slate-500'
                      : 'bg-slate-100 text-slate-600',
                  'hover:bg-blue-50 hover:text-blue-700',
                )}
                style={{ left: pct(t.start, duration), width: `calc(${pct(t.end - t.start, duration)} - 2px)` }}
              >
                {showLabel ? t.title : null}
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
        ) : hoveredTopic ? (
          <span>
            <span className="font-mono text-xs font-semibold text-slate-400">
              {formatTimestamp(hoveredTopic.start)} – {formatTimestamp(hoveredTopic.end)}
            </span>{' '}
            <span className="text-[10px] font-bold tracking-[0.2em] text-blue-600 uppercase">Thème</span>{' '}
            <span className="font-semibold text-slate-900">{hoveredTopic.title}</span>
          </span>
        ) : (
          <span className="text-slate-400">
            Survolez une pastille ou un thème pour le lire ; cliquez pour l’analyse et la vidéo.
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
