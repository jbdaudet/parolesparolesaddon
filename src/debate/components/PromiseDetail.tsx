import { ChevronDown, CircleCheck, CircleX, ExternalLink, Lightbulb, Play, Quote, TriangleAlert } from 'lucide-react';
import Markdown from 'react-markdown';
import type { DebatePromise, Speaker } from '../../../shared/debate-types';
import { formatTimestamp } from '../../../shared/time-format';
import { CategoryBars } from './CategoryBars';
import { ScoreRing } from './ScoreRing';

interface Props {
  promise: DebatePromise;
  speaker?: Speaker;
  topicTitle?: string;
  onSeek(seconds: number): void;
}

/**
 * Détail d'une promesse : citation horodatée (vérifiable dans la vidéo) puis
 * évaluation, avec la même mise en page que la page d'analyse du site.
 * Lors de la fusion, la partie « évaluation » peut être remplacée par le
 * composant de résultat existant, qui consomme le même format de données.
 */
export function PromiseDetail({ promise, speaker, topicTitle, onSeek }: Props) {
  const evaluation = promise.evaluation;
  const data = evaluation?.data;

  return (
    <article className="overflow-hidden rounded-[2.5rem] border border-slate-200/60 bg-white shadow-sm">
      {/* Citation */}
      <div className="space-y-4 border-b border-slate-100 px-6 py-8 sm:px-10">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-blue-600 uppercase">
          <span>Promesse</span>
          {topicTitle && <span className="text-slate-300">•</span>}
          {topicTitle && <span>{topicTitle}</span>}
          {promise.specificity === 'vague' && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 tracking-wider text-slate-500">Vague</span>
          )}
        </div>
        <h3 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{promise.statement}</h3>

        <figure className="rounded-2xl border border-slate-100 bg-slate-50/80 p-5">
          <blockquote className="flex gap-3 text-sm leading-relaxed text-slate-700 italic">
            <Quote className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
            <span>« {promise.quote} »</span>
          </blockquote>
          <figcaption className="mt-4 flex flex-wrap items-center gap-3 text-xs">
            <span className="font-bold text-slate-900">{speaker?.name ?? 'Orateur inconnu'}</span>
            <button
              type="button"
              onClick={() => onSeek(promise.start)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0066cc] px-3 py-1.5 font-bold text-white shadow-sm transition-colors hover:bg-[#0071e3]"
            >
              <Play className="h-3 w-3 fill-current" /> Voir à {formatTimestamp(promise.start)}
            </button>
            {!promise.quoteVerified && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                <TriangleAlert className="h-3 w-3" /> Citation à vérifier dans la vidéo
              </span>
            )}
          </figcaption>
          {promise.repeats.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span>Répétée à</span>
              {promise.repeats.map((r) => (
                <button
                  key={r.segmentId + r.start}
                  type="button"
                  onClick={() => onSeek(r.start)}
                  title={r.quote}
                  className="rounded-md bg-white px-2 py-0.5 font-mono font-semibold text-blue-700 ring-1 ring-slate-200 hover:ring-blue-300"
                >
                  {formatTimestamp(r.start)}
                </button>
              ))}
            </div>
          )}
        </figure>
      </div>

      {/* Évaluation */}
      {!data ? (
        <div className="px-6 py-8 text-sm text-slate-500 sm:px-10">
          {promise.evaluationError ? `Évaluation indisponible : ${promise.evaluationError}` : 'Évaluation en cours…'}
        </div>
      ) : (
        <div className="space-y-8 bg-slate-50/50 px-6 py-8 sm:px-10">
          <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start">
            <ScoreRing score={data.score} className="shrink-0" />
            <div className="w-full flex-1 space-y-5">
              <div className="space-y-1">
                <span className="block text-[10px] font-bold tracking-[0.2em] text-blue-600 uppercase">
                  Analyse & Verdict
                </span>
                <p className="text-lg leading-snug font-bold tracking-tight text-slate-900 sm:text-xl">
                  {data.verdict}
                </p>
              </div>
              <CategoryBars scores={data.categoryScores} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {data.strengths.length > 0 && (
              <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
                <h4 className="mb-4 flex items-center gap-2 text-xs font-bold tracking-widest text-emerald-700 uppercase">
                  <CircleCheck className="h-3.5 w-3.5" /> Atouts & Leviers
                </h4>
                <ul className="space-y-3 text-sm font-medium text-slate-600">
                  {data.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span className="leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.weaknesses.length > 0 && (
              <div className="rounded-3xl border border-rose-100 bg-white p-6 shadow-sm">
                <h4 className="mb-4 flex items-center gap-2 text-xs font-bold tracking-widest text-rose-700 uppercase">
                  <CircleX className="h-3.5 w-3.5" /> Défis & Limites
                </h4>
                <ul className="space-y-3 text-sm font-medium text-slate-600">
                  {data.weaknesses.map((s, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                      <span className="leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {data.alternatives.length > 0 && (
            <div className="flex flex-col gap-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-6">
              <h4 className="flex items-center gap-2 text-xs font-bold tracking-widest text-blue-700 uppercase">
                <Lightbulb className="h-4 w-4" /> Solutions Alternatives
              </h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data.alternatives.map((a, i) => (
                  <div key={i} className="rounded-xl border border-blue-100 bg-white p-4">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold tracking-wider text-emerald-700 uppercase">
                      {a.impact}
                    </span>
                    <h5 className="mt-3 mb-2 text-sm leading-snug font-bold text-slate-900">{a.text}</h5>
                    <p className="text-xs leading-relaxed font-medium text-slate-500">{a.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {evaluation.grounded === false && (
            <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs leading-relaxed text-amber-900">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              Évaluation réalisée sans recherche documentaire : les chiffres viennent des connaissances du modèle et
              aucune source officielle n’est citée. À confirmer.
            </p>
          )}

          {evaluation.sources.length > 0 && (
            <div>
              <h4 className="mb-2 text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase">
                Sources officielles
              </h4>
              <ul className="flex flex-wrap gap-2">
                {evaluation.sources.map((s) => (
                  <li key={s.uri}>
                    <a
                      href={s.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-700"
                    >
                      {s.title ?? new URL(s.uri).hostname} <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.markdownReport && (
            <details className="group rounded-2xl border border-slate-200/60 bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-bold text-slate-900">
                Analyse détaillée
                <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="debate-markdown border-t border-slate-100 px-5 pb-5 text-sm text-slate-600">
                <Markdown>{data.markdownReport}</Markdown>
              </div>
            </details>
          )}
        </div>
      )}
    </article>
  );
}
