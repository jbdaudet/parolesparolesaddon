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
  const target = targetTopicCount(analysis.video.durationSec);
  ctx.progress(0, 1);
  const { value } = await ctx.llm.generateJson<{ topics: Array<{ title: string; start: string }> }>({
    label: 'topics',
    model: config.textModel,
    input: [
      {
        type: 'text',
        text: `Voici la transcription horodatée d'un ${kindNoun(analysis)} politique. Découpe-le en grandes séquences thématiques
successives, dans l'ordre chronologique, sans chevauchement : environ ${target}, jamais plus de ${target + 2}.
Regroupe les sujets voisins plutôt que de multiplier les séquences courtes.
Titres neutres, sans jugement, de 1 à 3 mots (ex. « Retraites », « Pouvoir d'achat »).

${formatTranscript(analysis)}`,
      },
    ],
    schema,
    thinking: 'low',
  });
  analysis.topics = buildTopics(value.topics, analysis.video.durationSec);
  ctx.progress(1, 1);
}

/** Environ une séquence pour 10 minutes, entre 3 et 12. */
export const targetTopicCount = (durationSec: number) => Math.min(12, Math.max(3, Math.round(durationSec / 600)));

/**
 * Trie, dédoublonne, ferme chaque séquence au début de la suivante, et fusionne dans la
 * précédente toute séquence trop courte pour être lisible sur la timeline (< 1/30 de la durée).
 */
export function buildTopics(raw: Array<{ title: string; start: string }>, durationSec: number): Topic[] {
  const minLength = durationSec / 30;
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

  const kept: Array<{ title: string; start: number }> = [];
  starts.forEach((t, i) => {
    const end = starts[i + 1]?.start ?? durationSec;
    if (kept.length > 0 && end - t.start < minLength) return; // absorbée par la précédente
    kept.push(t);
  });

  return kept.map((t, i) => ({
    id: `topic${i + 1}`,
    title: t.title,
    start: i === 0 ? 0 : t.start,
    end: kept[i + 1]?.start ?? durationSec,
  }));
}
