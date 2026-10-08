import type { DebateAnalysis, PipelineStep, VideoKind } from '../../shared/debate-types';
import type { DebateConfig } from './config';
import type { LlmClient } from './gemini';
import type { StepContext } from './steps/context';
import { evaluatePromises, type PromiseEvaluator } from './steps/evaluate';
import { extractPromises } from './steps/extract';
import { summarize } from './steps/summarize';
import { survey } from './steps/survey';
import { segmentTopics } from './steps/topics';
import { transcribe } from './steps/transcribe';
import type { DebateStore } from './store';
import { canonicalYouTubeUrl, fetchYouTubeMeta } from './youtube';

export interface PipelineDeps {
  llm: LlmClient;
  evaluator: PromiseEvaluator;
  store: DebateStore;
  config: DebateConfig;
  /** Titre/chaîne de la vidéo ; remplaçable dans les tests. */
  fetchMeta?: typeof fetchYouTubeMeta;
}

export interface PipelineOptions {
  videoId: string;
  /** Débat ou discours ; détecté au repérage si absent. */
  kind?: VideoKind;
  speakerHints?: string[];
  /** Repart de zéro même si une analyse existe. */
  force?: boolean;
  onProgress?: (step: PipelineStep, done: number, total: number, message?: string) => void;
}

export function emptyAnalysis(videoId: string, config: DebateConfig, kind: VideoKind = 'debate'): DebateAnalysis {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: videoId,
    kind,
    video: { videoId, url: canonicalYouTubeUrl(videoId), durationSec: 0 },
    speakers: [],
    transcript: [],
    topics: [],
    promises: [],
    reports: [],
    completedSteps: [],
    checkpoints: { transcribedWindowStarts: [] },
    models: { video: config.videoModel, text: config.textModel, evaluation: config.evaluationModel },
    warnings: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Enchaîne les six étapes. Chaque étape terminée est enregistrée : relancer le
 * pipeline sur la même vidéo reprend là où il s'était arrêté.
 */
export async function runPipeline(deps: PipelineDeps, opts: PipelineOptions): Promise<DebateAnalysis> {
  const { store, config } = deps;
  const existing = opts.force ? null : await store.get(opts.videoId);
  const analysis = existing ?? emptyAnalysis(opts.videoId, config, opts.kind);

  if (!analysis.video.title) {
    const meta = await (deps.fetchMeta ?? fetchYouTubeMeta)(opts.videoId);
    analysis.video.title = meta.title;
    analysis.video.channel = meta.channel;
  }

  // Les étapes parallèles sauvegardent souvent : on sérialise les écritures.
  let saving: Promise<void> = Promise.resolve();
  const save = () => {
    saving = saving
      .catch(() => {})
      .then(() => {
        analysis.updatedAt = new Date().toISOString();
        return store.save(analysis);
      });
    return saving;
  };

  const steps: Array<[PipelineStep, (ctx: StepContext) => Promise<void>]> = [
    ['survey', (ctx) => survey(ctx, { kind: opts.kind, speakerHints: opts.speakerHints })],
    ['transcribe', transcribe],
    ['topics', segmentTopics],
    ['extract', extractPromises],
    ['evaluate', (ctx) => evaluatePromises(ctx, deps.evaluator)],
    ['summarize', summarize],
  ];

  for (const [step, run] of steps) {
    if (analysis.completedSteps.includes(step)) continue;
    const ctx: StepContext = {
      llm: deps.llm,
      config,
      analysis,
      progress: (done, total, message) => opts.onProgress?.(step, done, total, message),
      checkpoint: save,
      warn: (m) => analysis.warnings.push(`[${step}] ${m}`),
    };
    await run(ctx);
    analysis.completedSteps.push(step);
    await save();
  }
  return analysis;
}
