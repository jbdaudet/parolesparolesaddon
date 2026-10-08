import { CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react';
import { PIPELINE_STEPS, STEP_LABELS, type DebateJobStatus } from '../../../shared/debate-types';
import { cn } from '../score';

/** Suivi des six étapes du traitement (qui dure plusieurs minutes). */
export function DebateProgress({ status, onRetry }: { status: DebateJobStatus; onRetry?(): void }) {
  const done = new Set(status.analysis?.completedSteps ?? []);
  const failed = status.state === 'error';

  return (
    <div className="mx-auto max-w-xl rounded-[2.5rem] border border-slate-200/60 bg-white p-6 shadow-sm sm:p-10">
      <span className="block text-[10px] font-bold tracking-[0.2em] text-blue-600 uppercase">Analyse en cours</span>
      <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
        {status.analysis?.video.title ?? 'Préparation de l’analyse'}
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        Comptez quelques minutes pour une vidéo de deux heures. Vous pouvez quitter cette page : l’analyse continue.
      </p>

      <ol className="mt-8 space-y-4">
        {PIPELINE_STEPS.map((step) => {
          const isDone = done.has(step);
          const isCurrent = !isDone && status.step === step && status.state === 'running';
          const pct = isCurrent && status.progress?.total ? (status.progress.done / status.progress.total) * 100 : 0;
          return (
            <li key={step} className="flex items-start gap-3">
              <span className="mt-0.5">
                {isDone ? (
                  <CircleCheck className="h-5 w-5 text-emerald-500" />
                ) : isCurrent ? (
                  <LoaderCircle className="h-5 w-5 animate-spin text-blue-600" />
                ) : (
                  <span className="block h-5 w-5 rounded-full border-2 border-slate-200" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-semibold', isDone || isCurrent ? 'text-slate-900' : 'text-slate-400')}>
                  {STEP_LABELS[step]}
                  {isCurrent && status.progress && status.progress.total > 1 && (
                    <span className="ml-2 font-mono text-xs text-slate-400">
                      {status.progress.done}/{status.progress.total}
                    </span>
                  )}
                </p>
                {isCurrent && (
                  <>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-50">
                      <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    {status.message && <p className="mt-1.5 truncate text-xs text-slate-400">{status.message}</p>}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {failed && (
        <div className="mt-8 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
          <p className="flex items-start gap-2 font-semibold">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {status.error}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 rounded-2xl bg-[#0066cc] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#0071e3]"
            >
              Reprendre l’analyse
            </button>
          )}
        </div>
      )}
    </div>
  );
}
