import express from 'express';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { DebateAnalysis, DebateJobStatus } from '../shared/debate-types';
import { loadConfig } from '../server/debate/config';
import type { JsonRequest, JsonResponse, LlmClient } from '../server/debate/gemini';
import { DebateJobs } from '../server/debate/jobs';
import { runPipeline } from '../server/debate/pipeline';
import { createDebateRouter } from '../server/debate/router';
import { GeminiPromiseEvaluator } from '../server/debate/steps/evaluate';
import type { DebateStore } from '../server/debate/store';

const VIDEO = 'dQw4w9WgXcQ';

class MemoryStore implements DebateStore {
  data = new Map<string, DebateAnalysis>();
  async get(id: string) {
    const a = this.data.get(id);
    return a ? structuredClone(a) : null;
  }
  async save(a: DebateAnalysis) {
    this.data.set(a.id, structuredClone(a));
  }
  async list() {
    return [];
  }
}

/** Faux Gemini : répond selon l'étape (libellé de la requête). */
class FakeLlm implements LlmClient {
  calls: JsonRequest[] = [];
  failEvaluations = false;
  /** Simule une clé gratuite : la recherche Google est refusée pour quota. */
  searchQuotaExceeded = false;
  format: 'debate' | 'speech' = 'debate';

  async generateJson<T>(req: JsonRequest): Promise<JsonResponse<T>> {
    this.calls.push(req);
    const respond = (value: unknown, citations: JsonResponse<T>['citations'] = []) => ({
      value: value as T,
      citations,
    });
    const label = req.label.split(' ')[0];
    switch (label) {
      case 'survey':
        return respond({
          format: this.format,
          duration_seconds: 900,
          title: 'Débat test',
          aired_on: '2027-04-20',
          participants: [
            { name: 'Modératrice', role: 'moderator', affiliation: '', how_to_recognize: 'au centre' },
            { name: 'Alice', role: 'candidate', affiliation: 'Parti A', how_to_recognize: 'à gauche' },
            { name: 'Bruno', role: 'candidate', affiliation: 'Parti B', how_to_recognize: 'à droite' },
          ],
        });
      case 'transcribe': {
        // Tronçons de 600 s, horodatages relatifs à l'extrait.
        const first = req.input[0].type === 'video' && req.input[0].processing?.start_offset === '0s';
        return respond({
          segments: first
            ? [
                { start: '00:00', end: '00:20', speaker_id: 's1', text: 'Bienvenue.' },
                { start: '00:20', end: '01:00', speaker_id: 's2', text: 'Je créerai 10 000 places de crèche.' },
              ]
            : [{ start: '00:10', end: '00:50', speaker_id: 's3', text: 'Nous baisserons la TVA de deux points.' }],
        });
      }
      case 'topics':
        return respond({
          topics: [
            { title: 'Famille', start: '00:00' },
            { title: 'Fiscalité', start: '10:00' },
          ],
        });
      case 'extract': {
        const text = req.input.map((p) => (p.type === 'text' ? p.text : '')).join();
        const promises = [];
        if (text.includes('[t2 |'))
          promises.push({
            segment_id: 't2',
            quote: '10 000 places de crèche',
            statement: 'Créer 10 000 places de crèche',
            theme: 'Famille',
            specificity: 'precise',
          });
        if (text.includes('[t3 |'))
          promises.push({
            segment_id: 't3',
            quote: 'baisserons la TVA de deux points',
            statement: 'Baisser la TVA de deux points',
            theme: 'Fiscalité',
            specificity: 'precise',
          });
        return respond({ promises });
      }
      case 'evaluate':
        if (this.failEvaluations) throw new Error('panne');
        if (req.googleSearch && this.searchQuotaExceeded)
          throw new Error('[evaluate] 429 You exceeded your current quota');
        return respond(
          {
            score: 12, // hors bornes : doit être ramené à 10
            verdict: 'Faisable',
            categoryScores: { legal: 8, budget: 6, operational: 7 },
            strengths: ['a'],
            weaknesses: ['b'],
            alternatives: [],
            markdownReport: '# Rapport',
          },
          [{ uri: 'https://www.insee.fr/x', title: 'INSEE' }, { uri: 'https://example.com/y' }],
        );
      case 'summarize':
        return respond({ summary: 'Synthèse neutre.', strengths: ['s'], weaknesses: ['w'] });
      default:
        throw new Error(`Appel inattendu : ${req.label}`);
    }
  }
}

function setup() {
  const llm = new FakeLlm();
  const store = new MemoryStore();
  const config = { ...loadConfig({}), concurrency: 2 };
  const evaluator = new GeminiPromiseEvaluator(llm, config.evaluationModel, 'auto', async (s) => s);
  return { llm, store, config, evaluator, fetchMeta: async () => ({}) };
}

describe('pipeline complet (faux Gemini)', () => {
  it('produit une analyse cohérente', async () => {
    const deps = setup();
    const a = await runPipeline(deps, { videoId: VIDEO });

    expect(a.kind).toBe('debate');
    expect(a.completedSteps).toEqual(['survey', 'transcribe', 'topics', 'extract', 'evaluate', 'summarize']);
    expect(a.video).toMatchObject({
      durationSec: 900,
      airedOn: '2027-04-20',
      url: `https://www.youtube.com/watch?v=${VIDEO}`,
    });
    // Second tronçon : 00:10 relatif → 610 s absolu.
    expect(a.transcript.map((t) => [t.id, t.start, t.speakerId])).toEqual([
      ['t1', 0, 's1'],
      ['t2', 20, 's2'],
      ['t3', 610, 's3'],
    ]);
    expect(a.topics.map((t) => [t.title, t.start, t.end])).toEqual([
      ['Famille', 0, 600],
      ['Fiscalité', 600, 900],
    ]);
    expect(a.promises.map((p) => [p.speakerId, p.quoteVerified, p.evaluation?.data.score])).toEqual([
      ['s2', true, 10],
      ['s3', true, 10],
    ]);
    expect(a.promises[0].evaluation?.sources).toEqual([{ uri: 'https://www.insee.fr/x', title: 'INSEE' }]);
    expect(a.reports.map((r) => [r.speakerId, r.stats.promiseCount, r.stats.averageScore])).toEqual([
      ['s2', 1, 10],
      ['s3', 1, 10],
    ]);

    // Les tronçons vidéo utilisent le format de décalage de l'API ("600s").
    const offsets = deps.llm.calls
      .filter((c) => c.label.startsWith('transcribe'))
      .map((c) => (c.input[0].type === 'video' ? c.input[0].processing : undefined));
    expect(offsets).toContainEqual({ type: 'static', start_offset: '600s', end_offset: '900s', fps: 0.2 });
  });

  it('reprend une analyse interrompue sans refaire les étapes terminées', async () => {
    const deps = setup();
    deps.llm.failEvaluations = true;
    const first = await runPipeline(deps, { videoId: VIDEO });
    // Les erreurs d'évaluation n'interrompent pas le pipeline : elles sont notées par promesse.
    expect(first.promises.every((p) => p.evaluationError?.includes('panne'))).toBe(true);

    // On simule une interruption avant l'évaluation, puis une reprise.
    const stored = (await deps.store.get(VIDEO))!;
    stored.completedSteps = ['survey', 'transcribe', 'topics', 'extract'];
    stored.promises.forEach((p) => delete p.evaluationError);
    await deps.store.save(stored);

    deps.llm.failEvaluations = false;
    deps.llm.calls = [];
    const resumed = await runPipeline(deps, { videoId: VIDEO });
    expect(deps.llm.calls.map((c) => c.label.split(' ')[0]).sort()).toEqual([
      'evaluate',
      'evaluate',
      'summarize',
      'summarize',
    ]);
    expect(resumed.promises.every((p) => p.evaluation)).toBe(true);
  });
});

describe('évaluation sans recherche Google', () => {
  it('se passe de la recherche refusée pour quota et le signale', async () => {
    const deps = setup();
    deps.llm.searchQuotaExceeded = true;
    const a = await runPipeline(deps, { videoId: VIDEO });
    expect(a.promises.map((p) => [p.evaluation?.grounded, p.evaluation?.sources.length])).toEqual([
      [false, 0],
      [false, 0],
    ]);
    // Au plus une tentative avec recherche par évaluation lancée en parallèle, puis plus jamais.
    const evaluations = deps.llm.calls.filter((c) => c.label === 'evaluate');
    expect(evaluations.filter((c) => c.googleSearch).length).toBeLessThanOrEqual(deps.config.concurrency);
    expect(evaluations.filter((c) => !c.googleSearch)).toHaveLength(2);
  });
});

describe('discours de campagne', () => {
  it('détecte le format au repérage', async () => {
    const deps = setup();
    deps.llm.format = 'speech';
    const a = await runPipeline(deps, { videoId: VIDEO });
    expect(a.kind).toBe('speech');
    const transcribePrompt = deps.llm.calls.find((c) => c.label.startsWith('transcribe'))!.input[1];
    expect(transcribePrompt.type === 'text' && transcribePrompt.text).toContain('discours politique');
  });

  it('respecte le format imposé par l’utilisateur', async () => {
    const deps = setup();
    deps.llm.format = 'debate';
    const a = await runPipeline(deps, { videoId: VIDEO, kind: 'speech' });
    expect(a.kind).toBe('speech');
    const surveyPrompt = deps.llm.calls[0].input[1];
    expect(surveyPrompt.type === 'text' && surveyPrompt.text).toContain('Il s’agit d’un discours de campagne.');
  });
});

describe('API HTTP', () => {
  async function serve(adminToken?: string) {
    const deps = setup();
    const jobs = new DebateJobs(deps);
    const app = express();
    app.use('/api/debates', express.json(), createDebateRouter({ jobs, store: deps.store, adminToken }));
    const server = app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/debates`;
    return { base, close: () => server.close(), deps };
  }

  const post = (base: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  it('valide l’URL, lance le traitement et expose son état', async () => {
    const { base, close } = await serve();
    try {
      expect((await post(base, { url: 'https://vimeo.com/1' })).status).toBe(400);

      const res = await post(base, { url: `https://youtu.be/${VIDEO}` });
      expect(res.status).toBe(202);

      let status: DebateJobStatus;
      do {
        await new Promise((r) => setTimeout(r, 20));
        status = await (await fetch(`${base}/${VIDEO}`)).json();
      } while (status.state !== 'done' && status.state !== 'error');
      expect(status.state).toBe('done');
      expect(status.analysis?.promises).toHaveLength(2);

      // Déjà analysé : renvoyé directement.
      const again = await post(base, { url: `https://www.youtube.com/watch?v=${VIDEO}` });
      expect(again.status).toBe(200);
      expect((await fetch(`${base}/inconnu`)).status).toBe(404);
    } finally {
      close();
    }
  });

  it('exige le jeton admin quand il est configuré', async () => {
    const { base, close } = await serve('secret');
    try {
      expect((await post(base, { url: `https://youtu.be/${VIDEO}` })).status).toBe(403);
      expect((await post(base, { url: `https://youtu.be/${VIDEO}` }, { 'x-admin-token': 'secret' })).status).toBe(202);
    } finally {
      close();
    }
  });
});
