import { Router, type Request } from 'express';
import type { CreateDebateRequest, DebateAnalysis, DebateJobStatus, VideoKind } from '../../shared/debate-types';
import type { DebateJobs } from './jobs';
import { toListItem, type DebateStore } from './store';
import { parseYouTubeId } from './youtube';

export interface RouterOptions {
  jobs: DebateJobs;
  store: DebateStore;
  /** Si défini, lancer une analyse exige l'en-tête `x-admin-token` (la consultation reste publique). */
  adminToken?: string;
  /** Analyses fictives servies sous leur identifiant (démonstration sans clé API). */
  demos?: DebateAnalysis[];
  /** Lancements autorisés par IP et par heure. */
  launchesPerHour?: number;
}

/**
 * À monter sous `/api/debates` :
 *   GET  /api/debates       → liste des analyses
 *   GET  /api/debates/:id   → état du traitement + analyse (partielle ou complète)
 *   POST /api/debates       → { url, kind?, speakerHints?, force? } lance l'analyse (202)
 */
export function createDebateRouter(opts: RouterOptions): Router {
  const router = Router();
  const launches = new Map<string, number[]>();
  const limit = opts.launchesPerHour ?? 5;

  router.get('/', async (_req, res) => {
    const items = await opts.store.list();
    res.json([...items, ...(opts.demos ?? []).map(toListItem)]);
  });

  router.get('/:id', async (req, res) => {
    const status = await statusFor(req.params.id, opts);
    if (!status) return void res.status(404).json({ error: 'Analyse introuvable.' });
    res.json(status);
  });

  router.post('/', async (req, res) => {
    if (opts.adminToken && req.get('x-admin-token') !== opts.adminToken) {
      return void res.status(403).json({ error: 'Lancement réservé aux administrateurs.' });
    }
    const body = (req.body ?? {}) as Partial<CreateDebateRequest>;
    const videoId = typeof body.url === 'string' ? parseYouTubeId(body.url) : null;
    if (!videoId) return void res.status(400).json({ error: 'URL YouTube invalide.' });

    const speakerHints = Array.isArray(body.speakerHints)
      ? body.speakerHints
          .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
          .slice(0, 6)
          .map((s) => s.trim().slice(0, 80))
      : [];

    const kind: VideoKind | undefined = body.kind === 'debate' || body.kind === 'speech' ? body.kind : undefined;

    const existing = await opts.store.get(videoId);
    if (existing?.completedSteps.includes('summarize') && !body.force) {
      return void res.json({ id: videoId, state: 'done', analysis: existing } satisfies DebateJobStatus);
    }

    if (!opts.adminToken && !allowLaunch(launches, clientIp(req), limit)) {
      return void res.status(429).json({ error: 'Trop de lancements, réessayez plus tard.' });
    }

    const job = opts.jobs.start(videoId, { kind, speakerHints, force: body.force === true });
    res.status(202).json({ ...job, analysis: existing ?? undefined } satisfies DebateJobStatus);
  });

  return router;
}

async function statusFor(id: string, opts: RouterOptions): Promise<DebateJobStatus | null> {
  const demo = opts.demos?.find((d) => d.id === id);
  if (demo) return { id, state: 'done', analysis: demo };
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  const job = opts.jobs.get(id);
  const analysis = (await opts.store.get(id)) ?? undefined;
  if (job) return { ...job, analysis };
  if (!analysis) return null;
  const complete = analysis.completedSteps.includes('summarize');
  return complete
    ? { id, state: 'done', analysis }
    : {
        id,
        state: 'error',
        error: 'Analyse interrompue : relancez-la pour reprendre où elle s’était arrêtée.',
        analysis,
      };
}

const clientIp = (req: Request) => req.ip ?? 'unknown';

function allowLaunch(launches: Map<string, number[]>, ip: string, perHour: number): boolean {
  const now = Date.now();
  const recent = (launches.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= perHour) return false;
  recent.push(now);
  launches.set(ip, recent);
  return true;
}
