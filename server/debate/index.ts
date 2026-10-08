/**
 * Point d'entrée du module serveur « Vidéos ».
 *
 *   import { createDebateModule } from './server/debate';
 *   app.use('/api/debates', express.json(), createDebateModule().router);
 */
import type { DebateAnalysis } from '../../shared/debate-types';
import { loadConfig, type DebateConfig } from './config';
import { GeminiClient, type LlmClient } from './gemini';
import { DebateJobs } from './jobs';
import { createDebateRouter } from './router';
import { GeminiPromiseEvaluator, type PromiseEvaluator } from './steps/evaluate';
import { FileDebateStore, type DebateStore } from './store';

export interface DebateModuleOptions {
  config?: DebateConfig;
  llm?: LlmClient;
  /** À remplacer, lors de la fusion, par un adaptateur vers l'analyseur du site. */
  evaluator?: PromiseEvaluator;
  /** À remplacer, lors de la fusion, par un stockage Firestore côté serveur. */
  store?: DebateStore;
  /** Analyses fictives de démonstration. */
  demos?: DebateAnalysis[];
}

export function createDebateModule(opts: DebateModuleOptions = {}) {
  const config = opts.config ?? loadConfig();
  const llm = opts.llm ?? new GeminiClient();
  const evaluator = opts.evaluator ?? new GeminiPromiseEvaluator(llm, config.evaluationModel, config.evaluationSearch);
  const store = opts.store ?? new FileDebateStore(config.dataDir);
  const jobs = new DebateJobs({ llm, evaluator, store, config });
  const router = createDebateRouter({ jobs, store, adminToken: config.adminToken, demos: opts.demos });
  return { config, llm, evaluator, store, jobs, router };
}

export { loadConfig } from './config';
export type { DebateConfig } from './config';
export { GeminiClient } from './gemini';
export type { LlmClient, JsonRequest, JsonResponse } from './gemini';
export { runPipeline } from './pipeline';
export { GeminiPromiseEvaluator } from './steps/evaluate';
export type { PromiseEvaluator, PromiseToEvaluate } from './steps/evaluate';
export { FileDebateStore } from './store';
export type { DebateStore } from './store';
export { parseYouTubeId } from './youtube';
