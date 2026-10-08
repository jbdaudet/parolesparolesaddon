import { TriangleAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { KIND_LABELS, type DebateAnalysis, type DebatePromise } from '../../shared/debate-types';
import { formatTimestamp } from '../../shared/time-format';
import { DebateTimeline } from './components/DebateTimeline';
import { FloatingPlayer } from './components/FloatingPlayer';
import { PromiseDetail } from './components/PromiseDetail';
import { PromiseList } from './components/PromiseList';
import { SpeakerReportCard } from './components/SpeakerReportCard';
import { YouTubePlayer, type PlayerHandle } from './components/YouTubePlayer';

/** Vue complète d'un débat ou d'un discours analysé : vidéo, timeline, détail de la promesse choisie, bilans. */
export function DebateView({ analysis }: { analysis: DebateAnalysis }) {
  const player = useRef<PlayerHandle>(null);
  const detail = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [seekCount, setSeekCount] = useState(0);
  const [selected, setSelected] = useState<DebatePromise | null>(analysis.promises[0] ?? null);

  const speakers = useMemo(() => new Map(analysis.speakers.map((s) => [s.id, s])), [analysis]);
  const topics = useMemo(() => new Map(analysis.topics.map((t) => [t.id, t])), [analysis]);
  const videoId = analysis.video.url ? analysis.video.videoId : null;

  const seek = useCallback((seconds: number) => {
    player.current?.seekTo(seconds);
    setSeekCount((n) => n + 1);
  }, []);
  const select = useCallback(
    (p: DebatePromise) => {
      setSelected(p);
      seek(p.start);
      detail.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    [seek],
  );

  const candidates = analysis.speakers.filter((s) => s.role === 'candidate');

  return (
    <div className="space-y-8">
      {/* En-tête */}
      <header className="rounded-3xl border border-slate-200/60 bg-white px-6 py-8 shadow-sm sm:px-10">
        <span className="text-[10px] font-bold tracking-[0.2em] text-blue-600 uppercase">
          {KIND_LABELS[analysis.kind].analyzed}
        </span>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {analysis.video.title ?? KIND_LABELS[analysis.kind].analyzed}
        </h1>
        <p className="mt-2 text-sm font-medium text-slate-500">
          {candidates.map((c) => c.name).join(' face à ')}
          {analysis.video.airedOn &&
            ` · ${new Date(analysis.video.airedOn).toLocaleDateString('fr-FR', { dateStyle: 'long' })}`}
          {` · ${formatTimestamp(analysis.video.durationSec)}`}
          {` · ${analysis.promises.length} promesses`}
        </p>
      </header>

      {/* Vidéo + timeline */}
      <section className="space-y-6 rounded-[2.5rem] border border-slate-200/60 bg-white p-4 shadow-sm sm:p-8">
        <div className="mx-auto max-w-3xl">
          {/* Devient une mini-vidéo flottante et déplaçable quand on fait défiler vers l'analyse. */}
          <FloatingPlayer currentTime={time} revealSignal={seekCount} onDismiss={() => player.current?.pause()}>
            <YouTubePlayer ref={player} videoId={videoId} onTime={setTime} />
          </FloatingPlayer>
        </div>
        <DebateTimeline
          analysis={analysis}
          currentTime={time}
          selectedId={selected?.id}
          onSelect={select}
          onSeek={seek}
        />
      </section>

      {/* Promesse sélectionnée */}
      <div ref={detail} className="scroll-mt-6">
        <AnimatePresence mode="wait">
          {selected && (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <PromiseDetail
                promise={selected}
                speaker={speakers.get(selected.speakerId)}
                topicTitle={selected.topicId ? topics.get(selected.topicId)?.title : undefined}
                onSeek={seek}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bilans */}
      {analysis.reports.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-center text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {analysis.reports.length > 1 ? 'Bilan par débatteur' : 'Bilan'}
          </h2>
          <div className={analysis.reports.length > 1 ? 'grid grid-cols-1 gap-6 lg:grid-cols-2' : 'mx-auto max-w-2xl'}>
            {analysis.reports.map((r) => (
              <SpeakerReportCard key={r.speakerId} report={r} speaker={speakers.get(r.speakerId)} />
            ))}
          </div>
        </section>
      )}

      {/* Toutes les promesses */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Toutes les promesses</h2>
        <PromiseList analysis={analysis} selectedId={selected?.id} onSelect={select} />
      </section>

      {analysis.warnings.length > 0 && (
        <details className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-900">
          <summary className="flex cursor-pointer items-center gap-2 font-semibold">
            <TriangleAlert className="h-4 w-4" /> {analysis.warnings.length} remarque(s) sur le traitement
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {analysis.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      {/* Mention discrète, en bas de page. */}
      <p className="pt-2 text-center text-[11px] leading-relaxed text-slate-400">
        Transcription, attribution des propos et évaluations produites automatiquement par IA. Chaque citation renvoie à
        l’instant exact de la vidéo : vérifiez-la avant de la reprendre.
      </p>
    </div>
  );
}
