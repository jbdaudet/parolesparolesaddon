import { PIPELINE_STEPS, type DebateJobStatus, type VideoKind } from '../../shared/debate-types';
import { runPipeline, type PipelineDeps } from './pipeline';

/**
 * File de traitement en mémoire : une analyse dure plusieurs minutes, la requête
 * HTTP rend la main tout de suite et le client interroge l'état.
 *
 * Limite connue : sur Cloud Run, une instance peut être arrêtée en cours de
 * traitement. L'analyse étant enregistrée étape par étape, il suffit de relancer
 * la même URL pour reprendre. Pour la production, voir docs/INTEGRATION.md
 * (Cloud Tasks / Cloud Run Jobs).
 */
export class DebateJobs {
  private jobs = new Map<string, DebateJobStatus>();
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(
    private deps: PipelineDeps,
    private maxParallelJobs = 1,
  ) {}

  get(id: string): DebateJobStatus | undefined {
    return this.jobs.get(id);
  }

  /** Lance (ou rejoint) l'analyse d'une vidéo. Idempotent tant qu'un traitement est en cours. */
  start(videoId: string, opts: { kind?: VideoKind; speakerHints?: string[]; force?: boolean } = {}): DebateJobStatus {
    const current = this.jobs.get(videoId);
    if (current && (current.state === 'queued' || current.state === 'running')) return current;

    const job: DebateJobStatus = { id: videoId, state: 'queued', message: "En attente d'un créneau" };
    this.jobs.set(videoId, job);

    const run = async () => {
      this.running++;
      job.state = 'running';
      job.message = 'Démarrage';
      try {
        await runPipeline(this.deps, {
          videoId,
          ...opts,
          onProgress: (step, done, total, message) => {
            job.step = step;
            job.progress = { done, total };
            job.message = message;
          },
        });
        job.state = 'done';
        job.step = PIPELINE_STEPS.at(-1);
        job.message = undefined;
      } catch (err) {
        job.state = 'error';
        job.error = err instanceof Error ? err.message : String(err);
        console.error(`[debate ${videoId}]`, err);
      } finally {
        this.running--;
        this.queue.shift()?.();
      }
    };

    if (this.running < this.maxParallelJobs) void run();
    else this.queue.push(() => void run());
    return job;
  }
}
