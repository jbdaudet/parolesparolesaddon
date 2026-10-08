import {
  scoreBand,
  type CategoryScores,
  type DebateAnalysis,
  type SpeakerReport,
  type SpeakerStats,
} from '../../../shared/debate-types';
import { mapLimit } from '../text';
import { formatTimestamp } from '../time';
import { kindNoun, type StepContext } from './context';

/**
 * Étape 6 — Bilan par orateur politique (débatteur ou auteur du discours).
 * Les chiffres (`stats`) sont calculés ici, de façon déterministe ; le modèle ne
 * rédige que la synthèse, à partir de ces chiffres et des verdicts.
 * Volontairement : pas de note unique ni de « gagnant ».
 */

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeStats(analysis: DebateAnalysis, speakerId: string): SpeakerStats {
  const promises = analysis.promises.filter((p) => p.speakerId === speakerId);
  const evaluated = promises.flatMap((p) => (p.evaluation ? [p.evaluation.data] : []));
  const bands = { good: 0, mid: 0, bad: 0 };
  for (const e of evaluated) bands[scoreBand(e.score)]++;

  const mean = (pick: (e: (typeof evaluated)[number]) => number) =>
    round1(evaluated.reduce((sum, e) => sum + pick(e), 0) / evaluated.length);

  const categoryAverages: CategoryScores | null = evaluated.length
    ? {
        legal: mean((e) => e.categoryScores.legal),
        budget: mean((e) => e.categoryScores.budget),
        operational: mean((e) => e.categoryScores.operational),
      }
    : null;

  return {
    promiseCount: promises.length,
    evaluatedCount: evaluated.length,
    preciseCount: promises.filter((p) => p.specificity === 'precise').length,
    averageScore: evaluated.length ? mean((e) => e.score) : null,
    bands,
    categoryAverages,
    speakingTimeSec: Math.round(
      analysis.transcript.filter((s) => s.speakerId === speakerId).reduce((sum, s) => sum + (s.end - s.start), 0),
    ),
  };
}

const schema = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Synthèse de 3 à 5 phrases.' },
    strengths: { type: 'array', items: { type: 'string' }, description: 'Points solides du programme exposé (2 à 3).' },
    weaknesses: {
      type: 'array',
      items: { type: 'string' },
      description: 'Points fragiles du programme exposé (2 à 3).',
    },
  },
  required: ['summary', 'strengths', 'weaknesses'],
};

export async function summarize(ctx: StepContext): Promise<void> {
  const { analysis, config } = ctx;
  const candidates = analysis.speakers.filter((s) => s.role === 'candidate');
  let done = 0;
  ctx.progress(0, candidates.length);

  analysis.reports = await mapLimit(candidates, config.concurrency, async (speaker): Promise<SpeakerReport> => {
    const stats = computeStats(analysis, speaker.id);
    const promises = analysis.promises.filter((p) => p.speakerId === speaker.id);

    if (promises.length === 0) {
      ctx.progress(++done, candidates.length);
      return {
        speakerId: speaker.id,
        stats,
        summary: "Aucune promesse identifiable n'a été relevée dans les propos de cet orateur.",
        strengths: [],
        weaknesses: [],
      };
    }

    const lines = promises.map((p) => {
      const e = p.evaluation?.data;
      return (
        `- [${formatTimestamp(p.start)}] ${p.statement} (${p.specificity === 'precise' ? 'précise' : 'vague'})` +
        (e ? ` → ${e.score}/10 — ${e.verdict}` : ' → non évaluée')
      );
    });

    const { value } = await ctx.llm.generateJson<{ summary: string; strengths: string[]; weaknesses: string[] }>({
      label: `summarize ${speaker.id}`,
      model: config.textModel,
      thinking: 'low',
      input: [
        {
          type: 'text',
          text: `Rédige le bilan de faisabilité des promesses formulées par ${speaker.name} au cours de ce ${kindNoun(analysis)}.

Chiffres (calculés, à ne pas modifier) : ${stats.promiseCount} promesses, dont ${stats.preciseCount} précises ;
${stats.evaluatedCount} évaluées ; note moyenne ${stats.averageScore ?? 'n/a'}/10 ;
${stats.bands.good} jugées réalistes, ${stats.bands.mid} incertaines, ${stats.bands.bad} peu réalistes.

Promesses et verdicts :
${lines.join('\n')}

Règles : ton strictement factuel et neutre ; ne porte aucun jugement sur la personne, ses valeurs ou son camp ;
ne compare avec aucun autre responsable politique ; ne désigne pas de gagnant ; parle de faisabilité, pas de désirabilité.`,
        },
      ],
      schema,
    });

    ctx.progress(++done, candidates.length);
    return { speakerId: speaker.id, stats, ...value };
  });
}
