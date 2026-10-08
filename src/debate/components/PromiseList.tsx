import type { DebateAnalysis, DebatePromise } from '../../../shared/debate-types';
import { formatTimestamp } from '../../../shared/time-format';
import { cn } from '../score';
import { ScoreBadge } from './ScoreRing';

/** Liste chronologique, regroupée par thème : alternative accessible et mobile à la timeline. */
export function PromiseList({
  analysis,
  selectedId,
  onSelect,
}: {
  analysis: DebateAnalysis;
  selectedId?: string;
  onSelect(p: DebatePromise): void;
}) {
  const names = new Map(analysis.speakers.map((s) => [s.id, s.name]));
  const groups = analysis.topics.length
    ? analysis.topics.map((t) => ({ title: t.title, items: analysis.promises.filter((p) => p.topicId === t.id) }))
    : [{ title: 'Promesses', items: analysis.promises }];
  const orphans = analysis.topics.length ? analysis.promises.filter((p) => !p.topicId) : [];
  if (orphans.length) groups.push({ title: 'Autres', items: orphans });

  return (
    <div className="space-y-6">
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <div key={g.title}>
            <h4 className="mb-2 text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase">{g.title}</h4>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/60 bg-white">
              {g.items.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    className={cn(
                      'flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-slate-50',
                      p.id === selectedId && 'bg-blue-50/60',
                    )}
                  >
                    <span className="w-14 shrink-0 font-mono text-xs font-semibold text-slate-400">
                      {formatTimestamp(p.start)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-bold text-slate-500">{names.get(p.speakerId)}</span>
                      <span className="block text-sm font-medium text-slate-800">{p.statement}</span>
                    </span>
                    {p.evaluation ? (
                      <ScoreBadge score={p.evaluation.data.score} />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}
