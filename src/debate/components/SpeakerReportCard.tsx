import { CircleCheck, CircleX } from 'lucide-react';
import type { Speaker, SpeakerReport } from '../../../shared/debate-types';
import { BAND_STYLES, cn } from '../score';
import { CategoryBars } from './CategoryBars';
import { ScoreRing } from './ScoreRing';

const minutes = (sec: number) => `${Math.round(sec / 60)} min`;

/**
 * Bilan d'un orateur politique. Volontairement sans classement entre orateurs :
 * la répartition des verdicts est montrée plutôt qu'une note unique.
 */
export function SpeakerReportCard({ report, speaker }: { report: SpeakerReport; speaker?: Speaker }) {
  const { stats } = report;
  const total = stats.bands.good + stats.bands.mid + stats.bands.bad;

  return (
    <section className="flex flex-col gap-6 rounded-[2.5rem] border border-slate-200/60 bg-white p-6 shadow-sm sm:p-8">
      <header className="flex items-center gap-5">
        {stats.averageScore !== null && <ScoreRing score={stats.averageScore} size="sm" />}
        <div className="min-w-0">
          <span className="block text-[10px] font-bold tracking-[0.2em] text-blue-600 uppercase">Bilan</span>
          <h3 className="truncate text-xl font-bold tracking-tight text-slate-900">{speaker?.name}</h3>
          {speaker?.affiliation && <p className="truncate text-xs font-medium text-slate-500">{speaker.affiliation}</p>}
        </div>
      </header>

      <dl className="grid grid-cols-3 gap-3 text-center">
        {[
          ['Promesses', String(stats.promiseCount)],
          ['Précises', String(stats.preciseCount)],
          ['Temps de parole', minutes(stats.speakingTimeSec)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-slate-50 px-2 py-3">
            <dd className="text-lg font-bold text-slate-900 tabular-nums">{value}</dd>
            <dt className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">{label}</dt>
          </div>
        ))}
      </dl>

      {total > 0 && (
        <div className="space-y-2">
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
            {(['good', 'mid', 'bad'] as const).map((b) =>
              stats.bands[b] > 0 ? (
                <div key={b} className={BAND_STYLES[b].dot} style={{ width: `${(stats.bands[b] / total) * 100}%` }} />
              ) : null,
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500">
            {(['good', 'mid', 'bad'] as const).map((b) => (
              <span key={b} className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', BAND_STYLES[b].dot)} />
                {stats.bands[b]} {BAND_STYLES[b].label.toLowerCase()}
                {stats.bands[b] > 1 ? 's' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {stats.categoryAverages && <CategoryBars scores={stats.categoryAverages} />}

      <p className="text-sm leading-relaxed text-slate-600">{report.summary}</p>

      {(report.strengths.length > 0 || report.weaknesses.length > 0) && (
        <ul className="space-y-2.5 text-sm font-medium text-slate-600">
          {report.strengths.map((s, i) => (
            <li key={`s${i}`} className="flex items-start gap-3">
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span className="leading-relaxed">{s}</span>
            </li>
          ))}
          {report.weaknesses.map((s, i) => (
            <li key={`w${i}`} className="flex items-start gap-3">
              <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <span className="leading-relaxed">{s}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
