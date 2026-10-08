import type { Topic } from '../../../shared/debate-types';
import { parseTimestamp } from '../time';
import { formatTranscript, kindNoun, type StepContext } from './context';

/** Étape 3 — Découpage en grandes séquences thématiques (bande « Thèmes » de la timeline). */

const schema = {
  type: 'object',
  properties: {
    topics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Thème court, 2 à 5 mots (ex. « Retraites », « Pouvoir d’achat »).' },
          start: { type: 'string', description: 'Horodatage de début, tel qu’il apparaît dans la transcription.' },
        },
        required: ['title', 'start'],
      },
    },
  },
  required: ['topics'],
};

export async function segmentTopics(ctx: StepContext): Promise<void> {
  const { analysis, config } = ctx;
  ctx.progress(0, 1);
  const { value } = await ctx.llm.generateJson<{ topics: Array<{ title: string; start: string }> }>({
    label: 'topics',
    model: config.textModel,
    input: [
      {
        type: 'text',
        text: `Voici la transcription horodatée d'un ${kindNoun(analysis)} politique. Découpe-le en séquences thématiques
successives (typiquement 5 à 15 pour 2 heures), dans l'ordre chronologique, sans chevauchement.
Une séquence commence quand un nouveau sujet est abordé. Titres neutres, sans jugement.

${formatTranscript(analysis)}`,
      },
    ],
    schema,
    thinking: 'low',
  });
  analysis.topics = buildTopics(value.topics, analysis.video.durationSec);
  ctx.progress(1, 1);
}

/** Trie, dédoublonne et ferme chaque séquence au début de la suivante. */
export function buildTopics(raw: Array<{ title: string; start: string }>, durationSec: number): Topic[] {
  const starts = raw
    .map((t) => {
      try {
        return { title: t.title.trim(), start: parseTimestamp(t.start) };
      } catch {
        return null;
      }
    })
    .filter((t): t is { title: string; start: number } => t !== null && t.start < durationSec)
    .sort((a, b) => a.start - b.start)
    .filter((t, i, arr) => i === 0 || t.start > arr[i - 1].start);

  return starts.map((t, i) => ({
    id: `topic${i + 1}`,
    title: t.title,
    start: i === 0 ? 0 : t.start,
    end: starts[i + 1]?.start ?? durationSec,
  }));
}
