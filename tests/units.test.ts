import { describe, expect, it } from 'vitest';
import type { DebateAnalysis } from '../shared/debate-types';
import { emptyAnalysis } from '../server/debate/pipeline';
import { loadConfig } from '../server/debate/config';
import { filterOfficialSources, isOfficialSource } from '../server/debate/sources';
import { applyGroups, validatePromises } from '../server/debate/steps/extract';
import { computeStats } from '../server/debate/steps/summarize';
import { buildTopics } from '../server/debate/steps/topics';
import { toSegments } from '../server/debate/steps/transcribe';
import { quoteAppearsIn } from '../server/debate/text';
import { chunkWindows, detectTimeBase, formatTimestamp, parseTimestamp, toOffset } from '../server/debate/time';
import { parseYouTubeId } from '../server/debate/youtube';

describe('horodatages', () => {
  it('lit les formats renvoyés par le modèle', () => {
    expect(parseTimestamp('01:15')).toBe(75);
    expect(parseTimestamp('1:02:05')).toBe(3725);
    expect(parseTimestamp('75s')).toBe(75);
    expect(parseTimestamp('12.5')).toBe(12.5);
    expect(() => parseTimestamp('abc')).toThrow();
  });

  it('formate et produit les décalages API', () => {
    expect(formatTimestamp(75)).toBe('1:15');
    expect(formatTimestamp(3725)).toBe('1:02:05');
    expect(toOffset(600.4)).toBe('600s');
  });

  it('découpe la vidéo en tronçons', () => {
    expect(chunkWindows(1500, 600)).toEqual([
      [0, 600],
      [600, 1200],
      [1200, 1500],
    ]);
  });

  it('détecte si les horodatages sont relatifs ou absolus', () => {
    expect(detectTimeBase([5, 120, 590], 600, 1200)).toBe('relative');
    expect(detectTimeBase([610, 900, 1190], 600, 1200)).toBe('absolute');
    expect(detectTimeBase([5, 120], 0, 600)).toBe('absolute');
  });
});

describe('transcription', () => {
  it('ramène un tronçon relatif en absolu et neutralise les orateurs inconnus', () => {
    const warnings: string[] = [];
    const segs = toSegments(
      [
        { start: '00:05', end: '00:40', speaker_id: 's2', text: 'Bonjour.' },
        { start: '01:00', end: '01:30', speaker_id: 's9', text: 'Qui suis-je ?' },
        { start: '02:00', end: '02:10', speaker_id: 's2', text: '   ' },
      ],
      600,
      1200,
      new Set(['s1', 's2']),
      (w) => warnings.push(w),
    );
    expect(segs.map((s) => [s.start, s.end, s.speakerId])).toEqual([
      [605, 640, 's2'],
      [660, 690, 'unknown'],
    ]);
    expect(warnings).toEqual([]);
  });
});

describe('YouTube', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=x', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://vimeo.com/123', null],
    ['https://www.youtube.com/watch?v=trop-court', null],
    ['pas une url', null],
  ])('%s → %s', (url, id) => expect(parseYouTubeId(url)).toBe(id));
});

describe('sources', () => {
  it('applique la même liste blanche que le site', () => {
    expect(isOfficialSource('https://www.insee.fr/fr/statistiques')).toBe(true);
    expect(isOfficialSource('https://www.economie.gouv.fr/x')).toBe(true);
    expect(isOfficialSource('https://www.lemonde.fr/x')).toBe(false);
    expect(isOfficialSource('https://x.com/insee')).toBe(false);
    expect(
      filterOfficialSources([
        { uri: 'https://insee.fr/a' },
        { uri: 'https://insee.fr/a' },
        { uri: 'https://blog.example.com' },
      ]),
    ).toEqual([{ uri: 'https://insee.fr/a' }]);
  });

  it('compare les citations à la ponctuation et aux accents près', () => {
    expect(quoteAppearsIn('je baisserai l’impôt', 'Alors, JE BAISSERAI l impot de 10 %.')).toBe(true);
    expect(quoteAppearsIn('je supprimerai l’impôt', 'Je baisserai l’impôt.')).toBe(false);
  });
});

function sampleAnalysis(): DebateAnalysis {
  const a = emptyAnalysis('dQw4w9WgXcQ', loadConfig({}));
  a.video.durationSec = 600;
  a.speakers = [
    { id: 's1', name: 'Modératrice', role: 'moderator' },
    { id: 's2', name: 'Alice', role: 'candidate' },
    { id: 's3', name: 'Bruno', role: 'candidate' },
  ];
  a.transcript = [
    { id: 't1', start: 0, end: 20, speakerId: 's1', text: 'Je promets de bien animer ce débat.' },
    { id: 't2', start: 20, end: 60, speakerId: 's2', text: 'Je baisserai la TVA sur les pâtes.' },
    { id: 't3', start: 60, end: 90, speakerId: 's3', text: 'Nous construirons dix ponts.' },
    { id: 't4', start: 300, end: 330, speakerId: 's2', text: 'Je le redis : moins de TVA sur les pâtes.' },
  ];
  a.topics = buildTopics(
    [
      { title: 'Économie', start: '00:00' },
      { title: 'Infrastructures', start: '00:55' },
    ],
    600,
  );
  return a;
}

describe('extraction', () => {
  it("prend l'orateur du segment, écarte les modérateurs, vérifie les citations", () => {
    const a = sampleAnalysis();
    const warnings: string[] = [];
    const promises = validatePromises(
      [
        { segment_id: 't1', quote: 'bien animer', statement: 'Animer', theme: 'x', specificity: 'vague' },
        {
          segment_id: 't3',
          quote: 'dix ponts',
          statement: 'Construire dix ponts',
          theme: 'Transports',
          specificity: 'precise',
        },
        {
          segment_id: 't2',
          quote: 'je baisserai la TVA sur les pâtes',
          statement: 'Baisser la TVA',
          theme: 'Fiscalité',
          specificity: 'precise',
        },
        {
          segment_id: 't4',
          quote: 'une phrase jamais dite',
          statement: 'Baisser la TVA',
          theme: 'Fiscalité',
          specificity: 'vague',
        },
        { segment_id: 't99', quote: '…', statement: 'Fantôme', theme: 'x', specificity: 'vague' },
      ],
      a,
      (w) => warnings.push(w),
    );
    expect(promises.map((p) => [p.id, p.speakerId, p.segmentId, p.quoteVerified, p.topicId])).toEqual([
      ['p1', 's2', 't2', true, 'topic1'],
      ['p2', 's3', 't3', true, 'topic2'],
      ['p3', 's2', 't4', false, 'topic2'],
    ]);
    expect(warnings).toHaveLength(2);
  });

  it('fusionne les répétitions d’un même orateur seulement', () => {
    const a = sampleAnalysis();
    const promises = validatePromises(
      [
        { segment_id: 't2', quote: 'TVA', statement: 'Baisser la TVA', theme: 'F', specificity: 'vague' },
        { segment_id: 't3', quote: 'ponts', statement: 'Ponts', theme: 'T', specificity: 'precise' },
        { segment_id: 't4', quote: 'TVA', statement: 'Baisser la TVA', theme: 'F', specificity: 'precise' },
      ],
      a,
      () => {},
    );
    const merged = applyGroups(promises, [
      ['p3', 'p1'],
      ['p1', 'p2'],
    ]);
    expect(merged.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(merged[0].repeats).toEqual([{ segmentId: 't4', start: 300, quote: 'TVA' }]);
    expect(merged[0].specificity).toBe('precise');
  });
});

describe('thèmes', () => {
  it('fusionne les séquences trop courtes dans la précédente', () => {
    const topics = buildTopics(
      [
        { title: 'Ouverture', start: '00:00' },
        { title: 'Retraites', start: '05:00' },
        { title: 'Aparté', start: '20:00' }, // 1 min sur 60 : trop courte
        { title: 'Santé', start: '21:00' },
      ],
      3600,
    );
    expect(topics.map((t) => [t.title, t.start, t.end])).toEqual([
      ['Ouverture', 0, 300],
      ['Retraites', 300, 1260],
      ['Santé', 1260, 3600],
    ]);
  });
});

describe('bilan', () => {
  it('calcule les statistiques de façon déterministe', () => {
    const a = sampleAnalysis();
    const evaluation = (score: number) => ({
      data: {
        score,
        verdict: '',
        categoryScores: { legal: score, budget: score, operational: score },
        strengths: [],
        weaknesses: [],
        alternatives: [],
        markdownReport: '',
      },
      sources: [],
      evaluatedAt: '',
      evaluator: 'test',
    });
    a.promises = validatePromises(
      [
        { segment_id: 't2', quote: 'x', statement: 'A', theme: 'F', specificity: 'precise' },
        { segment_id: 't4', quote: 'x', statement: 'B', theme: 'F', specificity: 'vague' },
      ],
      a,
      () => {},
    );
    a.promises[0].evaluation = evaluation(8);
    a.promises[1].evaluation = evaluation(3);
    expect(computeStats(a, 's2')).toEqual({
      promiseCount: 2,
      evaluatedCount: 2,
      preciseCount: 1,
      averageScore: 5.5,
      bands: { good: 1, mid: 0, bad: 1 },
      categoryAverages: { legal: 5.5, budget: 5.5, operational: 5.5 },
      speakingTimeSec: 70,
    });
    expect(computeStats(a, 's3').averageScore).toBeNull();
  });
});
