import type { AnalysisData, DebatePromise, Evaluation, Source } from '../../../shared/debate-types';
import type { LlmClient } from '../gemini';
import { filterOfficialSources } from '../sources';
import { mapLimit } from '../text';
import { kindNoun, speakerById, type StepContext } from './context';

/**
 * Étape 5 — Évaluation de chaque promesse.
 *
 * L'évaluation passe par l'interface `PromiseEvaluator`. Ce dépôt fournit
 * `GeminiPromiseEvaluator`, qui reproduit le format de sortie de `/api/analyze`
 * du site. Lors de la fusion, la remplacer par un adaptateur qui appelle
 * directement l'analyseur existant (et son cache) : voir docs/INTEGRATION.md.
 */

export interface PromiseToEvaluate {
  /** Reformulation autonome : c'est le texte qu'un visiteur taperait dans l'analyseur. */
  statement: string;
  quote: string;
  speakerName: string;
  affiliation?: string;
  debateTitle?: string;
  airedOn?: string;
  /** « débat » ou « discours ». */
  occasion?: string;
}

export interface PromiseEvaluator {
  readonly id: string;
  evaluate(promise: PromiseToEvaluate): Promise<Evaluation>;
}

export async function evaluatePromises(ctx: StepContext, evaluator: PromiseEvaluator): Promise<void> {
  const { analysis, config } = ctx;
  const speakers = speakerById(analysis);
  const pending = analysis.promises.filter((p) => !p.evaluation);
  let done = analysis.promises.length - pending.length;
  ctx.progress(done, analysis.promises.length);

  await mapLimit(pending, config.concurrency, async (promise: DebatePromise) => {
    const speaker = speakers.get(promise.speakerId);
    try {
      promise.evaluation = await evaluator.evaluate({
        statement: promise.statement,
        quote: promise.quote,
        speakerName: speaker?.name ?? 'Inconnu',
        affiliation: speaker?.affiliation,
        debateTitle: analysis.video.title,
        airedOn: analysis.video.airedOn,
        occasion: kindNoun(analysis),
      });
      delete promise.evaluationError;
    } catch (err) {
      promise.evaluationError = err instanceof Error ? err.message : String(err);
      ctx.warn(`Évaluation impossible pour ${promise.id} : ${promise.evaluationError}`);
    }
    await ctx.checkpoint();
    ctx.progress(++done, analysis.promises.length, promise.statement);
  });
}

// ---------------------------------------------------------------------------
// Évaluateur autonome (Gemini + recherche Google), format identique au site
// ---------------------------------------------------------------------------

const score = { type: 'number', description: 'Note de 0 à 10.' };

const analysisSchema = {
  type: 'object',
  properties: {
    score: { ...score, description: 'Faisabilité globale, de 0 (irréalisable) à 10 (pleinement réalisable).' },
    verdict: { type: 'string', description: 'Verdict en une phrase courte, factuelle et neutre.' },
    categoryScores: {
      type: 'object',
      properties: {
        legal: { ...score, description: 'Faisabilité juridique & constitutionnelle.' },
        budget: { ...score, description: 'Soutenabilité budgétaire & économique.' },
        operational: { ...score, description: 'Mise en œuvre & calendrier.' },
      },
      required: ['legal', 'budget', 'operational'],
    },
    strengths: { type: 'array', items: { type: 'string' }, description: 'Atouts et leviers (2 à 4).' },
    weaknesses: { type: 'array', items: { type: 'string' }, description: 'Défis et limites (2 à 4).' },
    alternatives: {
      type: 'array',
      description: 'Solutions alternatives plus réalistes (0 à 3).',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          explanation: { type: 'string' },
          impact: { type: 'string', description: 'Effet attendu en 1 à 3 mots (ex. « Coût réduit »).' },
        },
        required: ['text', 'explanation', 'impact'],
      },
    },
    chartData: {
      type: 'object',
      description: 'Un graphique utile au lecteur (ordres de grandeur, coûts comparés), ou omis.',
      properties: {
        title: { type: 'string' },
        yAxisLabel: { type: 'string' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' }, value: { type: 'number' } },
            required: ['name', 'value'],
          },
        },
      },
      required: ['title', 'data'],
    },
    markdownReport: { type: 'string', description: 'Analyse détaillée en Markdown (300 à 600 mots), sources citées.' },
  },
  required: ['score', 'verdict', 'categoryScores', 'strengths', 'weaknesses', 'alternatives', 'markdownReport'],
};

const QUOTA_ERROR = /\b429\b|quota|RESOURCE_EXHAUSTED/i;

export class GeminiPromiseEvaluator implements PromiseEvaluator {
  readonly id = 'gemini-standalone';
  /** Passe à true dès que la recherche est refusée pour quota (mode "auto"). */
  private searchUnavailable = false;

  constructor(
    private llm: LlmClient,
    private model: string,
    private search: 'auto' | 'on' | 'off' = 'auto',
    private resolveSources: (sources: Source[]) => Promise<Source[]> = resolveGroundingRedirects,
  ) {}

  async evaluate(p: PromiseToEvaluate): Promise<Evaluation> {
    const useSearch = this.search === 'on' || (this.search === 'auto' && !this.searchUnavailable);
    if (!useSearch) return this.run(p, false);
    try {
      return await this.run(p, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (this.search !== 'auto' || !QUOTA_ERROR.test(message)) throw err;
      this.searchUnavailable = true;
      return this.run(p, false);
    }
  }

  private async run(p: PromiseToEvaluate, withSearch: boolean): Promise<Evaluation> {
    const { value, citations } = await this.llm.generateJson<AnalysisData>({
      label: 'evaluate',
      model: this.model,
      googleSearch: withSearch,
      // En mode auto, un refus de quota sur la recherche ne doit pas déclencher de longues attentes.
      ...(withSearch && this.search === 'auto' ? { maxAttempts: 1 } : {}),
      thinking: 'medium',
      system: `Tu es un analyste indépendant des politiques publiques françaises. Tu évalues la FAISABILITÉ d'une
promesse électorale — pas sa désirabilité ni son orientation politique. Tu appliques exactement la même
exigence quel que soit le parti. Tu t'appuies en priorité sur des sources publiques officielles (INSEE,
Cour des comptes, PLF/PLFSS, Conseil constitutionnel, Eurostat, OCDE, Banque de France…), en citant les
chiffres utilisés. Si une donnée manque, tu le dis plutôt que d'estimer sans base.${
        withSearch
          ? ''
          : `
Tu n'as PAS accès à la recherche web : appuie-toi sur tes connaissances, indique l'année des chiffres cités
et signale explicitement ceux qui sont incertains ou susceptibles d'avoir changé.`
      }`,
      input: [
        {
          type: 'text',
          text: `Promesse à évaluer : « ${p.statement} »

Contexte (pour comprendre la promesse, pas pour juger la personne) : formulée par ${p.speakerName}${
            p.affiliation ? ` (${p.affiliation})` : ''
          } lors d'un ${p.occasion ?? 'débat'}${p.debateTitle ? ` (« ${p.debateTitle} »` + (p.airedOn ? `, ${p.airedOn})` : ')') : ''}.
Citation exacte : « ${p.quote} »

Évalue sa faisabilité juridique, budgétaire et opérationnelle d'ici la fin du quinquennat 2027-2032.`,
        },
      ],
      schema: analysisSchema,
    });

    return {
      data: sanitizeAnalysis(value),
      sources: withSearch ? filterOfficialSources(await this.resolveSources(citations)) : [],
      evaluatedAt: new Date().toISOString(),
      evaluator: this.id,
      grounded: withSearch,
    };
  }
}

const clamp = (n: unknown) => Math.min(10, Math.max(0, Math.round(Number(n) * 10) / 10 || 0));

export function sanitizeAnalysis(a: AnalysisData): AnalysisData {
  return {
    ...a,
    score: clamp(a.score),
    categoryScores: {
      legal: clamp(a.categoryScores?.legal),
      budget: clamp(a.categoryScores?.budget),
      operational: clamp(a.categoryScores?.operational),
    },
    strengths: a.strengths ?? [],
    weaknesses: a.weaknesses ?? [],
    alternatives: a.alternatives ?? [],
    ...(a.chartData?.data?.length ? { chartData: a.chartData } : { chartData: undefined }),
  };
}

const REDIRECT_HOSTS = ['vertexaisearch.cloud.google.com'];

/**
 * La recherche Google renvoie parfois des URL de redirection : on suit la
 * redirection pour retrouver le domaine réel (nécessaire au filtrage des sources).
 */
export async function resolveGroundingRedirects(sources: Source[]): Promise<Source[]> {
  return Promise.all(
    sources.map(async (s) => {
      try {
        if (!REDIRECT_HOSTS.includes(new URL(s.uri).hostname)) return s;
        const res = await fetch(s.uri, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) });
        const location = res.headers.get('location');
        return location ? { ...s, uri: location } : s;
      } catch {
        return s;
      }
    }),
  );
}
