import type {
  DebateAnalysis,
  DebatePromise,
  PromiseSpecificity,
  TranscriptSegment,
} from '../../../shared/debate-types';
import { mapLimit, quoteAppearsIn } from '../text';
import { formatTranscript, kindNoun, speakerById, type StepContext } from './context';

/**
 * Étape 4 — Extraction des promesses, séquence thématique par séquence, puis
 * regroupement des promesses répétées par un même orateur.
 *
 * Garde-fous contre les erreurs d'attribution :
 * - l'orateur est TOUJOURS celui du segment cité, jamais celui que le modèle annonce ;
 * - la citation est recherchée dans le segment (et le suivant du même orateur) ;
 *   si elle n'y figure pas, la promesse est conservée mais marquée `quoteVerified: false`.
 */

interface RawPromise {
  segment_id: string;
  quote: string;
  statement: string;
  theme: string;
  specificity: PromiseSpecificity;
}

const extractSchema = {
  type: 'object',
  properties: {
    promises: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          segment_id: {
            type: 'string',
            description: 'Identifiant du segment (ex. "t42") où la promesse est formulée.',
          },
          quote: {
            type: 'string',
            description: 'Extrait exact, copié du segment, le plus court contenant l’engagement.',
          },
          statement: { type: 'string', description: 'Reformulation autonome et neutre de la mesure.' },
          theme: {
            type: 'string',
            description: 'Domaine : Fiscalité, Retraites, Énergie, Sécurité, Santé, Éducation…',
          },
          specificity: { type: 'string', enum: ['precise', 'vague'] },
        },
        required: ['segment_id', 'quote', 'statement', 'theme', 'specificity'],
      },
    },
  },
  required: ['promises'],
};

const EXTRACTION_RULES = `Une PROMESSE est un engagement sur ce que l'orateur politique fera s'il est élu : une mesure, une loi,
une dépense, une baisse ou hausse d'impôt, une suppression, un objectif chiffré, une réforme.
Ce ne sont PAS des promesses : les critiques de l'adversaire, les constats sur la situation actuelle,
le rappel d'un bilan passé, les déclarations de valeurs sans mesure (« je crois en la France »), les questions.

- specificity = "precise" si la mesure est identifiable et vérifiable (montant, échéance, dispositif nommé),
  "vague" s'il s'agit d'une intention sans mesure concrète.
- statement : une phrase autonome, compréhensible sans le contexte de la vidéo, qui décrit la mesure elle-même
  (ex. « Porter le SMIC à 1 600 € net par mois d'ici 2028 »), sans nommer l'orateur et sans jugement.
  C'est cette phrase qui sera soumise à l'analyse de faisabilité.
- quote : recopie exactement les mots du segment, sans les corriger.
- Les segments marqués « résumé » ne sont pas les mots prononcés mais un résumé à la troisième personne :
  extrais-en aussi les promesses, avec pour quote le passage du résumé qui les décrit.
- N'extrais que des propos d'orateurs politiques (marqués comme tels dans la liste), jamais des modérateurs ni des autres intervenants.
- Si un orateur répète une promesse dans cette séquence, ne la note qu'une fois (première formulation).`;

export async function extractPromises(ctx: StepContext): Promise<void> {
  const { analysis, config } = ctx;
  const batches = batchesByTopic(analysis);
  let done = 0;
  ctx.progress(0, batches.length + 1);

  const perBatch = await mapLimit(batches, config.concurrency, async (segments) => {
    const { value } = await ctx.llm.generateJson<{ promises: RawPromise[] }>({
      label: `extract ${segments[0]?.id}`,
      model: config.textModel,
      input: [
        {
          type: 'text',
          text: `Extrais les promesses électorales de cet extrait de ${kindNoun(analysis)}.

${EXTRACTION_RULES}

Transcription (format [segment | horodatage | orateur] texte) :
${formatTranscript(analysis, segments)}`,
        },
      ],
      schema: extractSchema,
      thinking: 'medium',
    });
    ctx.progress(++done, batches.length + 1);
    return value.promises;
  });

  const promises = validatePromises(perBatch.flat(), analysis, ctx.warn);
  analysis.promises = await mergeRepeats(ctx, promises);
  ctx.progress(batches.length + 1, batches.length + 1);
}

function batchesByTopic(analysis: DebateAnalysis): TranscriptSegment[][] {
  if (analysis.topics.length === 0) return [analysis.transcript];
  return analysis.topics
    .map((t) => analysis.transcript.filter((s) => s.start >= t.start && s.start < t.end))
    .filter((b) => b.length > 0);
}

/** Rattache chaque promesse à son segment, son orateur réel et sa séquence ; vérifie la citation. */
export function validatePromises(
  raw: RawPromise[],
  analysis: DebateAnalysis,
  warn: (m: string) => void,
): DebatePromise[] {
  const segments = new Map(analysis.transcript.map((s, i) => [s.id, i]));
  const speakers = speakerById(analysis);
  const out: DebatePromise[] = [];

  for (const r of raw) {
    const index = segments.get(r.segment_id);
    if (index === undefined) {
      warn(`Promesse ignorée (segment ${r.segment_id} introuvable) : « ${r.statement} »`);
      continue;
    }
    const segment = analysis.transcript[index];
    if (speakers.get(segment.speakerId)?.role !== 'candidate') {
      warn(`Promesse ignorée (segment ${segment.id} attribué à un intervenant non politique) : « ${r.statement} »`);
      continue;
    }
    const next = analysis.transcript[index + 1];
    const context = next?.speakerId === segment.speakerId ? `${segment.text} ${next.text}` : segment.text;

    out.push({
      id: '',
      speakerId: segment.speakerId,
      start: segment.start,
      segmentId: segment.id,
      quote: r.quote.trim(),
      // Un résumé n'est pas une citation : on ne la présente jamais comme vérifiée.
      quoteVerified: !segment.paraphrased && quoteAppearsIn(r.quote, context),
      ...(segment.paraphrased ? { paraphrased: true } : {}),
      statement: r.statement.trim(),
      theme: r.theme.trim(),
      topicId: analysis.topics.find((t) => segment.start >= t.start && segment.start < t.end)?.id,
      specificity: r.specificity === 'precise' ? 'precise' : 'vague',
      repeats: [],
    });
  }
  out.sort((a, b) => a.start - b.start);
  out.forEach((p, i) => (p.id = `p${i + 1}`));
  return out;
}

const groupSchema = {
  type: 'object',
  properties: {
    groups: {
      type: 'array',
      description: 'Uniquement les groupes de 2 promesses ou plus qui désignent la même mesure.',
      items: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
    },
  },
  required: ['groups'],
};

/** Fusionne, par orateur, les promesses qui désignent la même mesure (la première occurrence est gardée). */
async function mergeRepeats(ctx: StepContext, promises: DebatePromise[]): Promise<DebatePromise[]> {
  const bySpeaker = Map.groupBy(promises, (p) => p.speakerId);
  const groups: string[][] = [];
  for (const list of bySpeaker.values()) {
    if (list.length < 2) continue;
    const { value } = await ctx.llm.generateJson<{ groups: Array<{ ids: string[] }> }>({
      label: 'dedupe',
      model: ctx.config.textModel,
      input: [
        {
          type: 'text',
          text: `Voici les promesses d'un même orateur politique. Regroupe celles qui désignent exactement la même mesure
(reformulations ou répétitions). Ne regroupe pas des mesures simplement voisines.

${list.map((p) => `${p.id} : ${p.statement}`).join('\n')}`,
        },
      ],
      schema: groupSchema,
      thinking: 'low',
    });
    groups.push(...value.groups.map((g) => g.ids));
  }
  return applyGroups(promises, groups);
}

export function applyGroups(promises: DebatePromise[], groups: string[][]): DebatePromise[] {
  const byId = new Map(promises.map((p) => [p.id, p]));
  const absorbed = new Set<string>();
  for (const ids of groups) {
    const members = [...new Set(ids)]
      .map((id) => byId.get(id))
      .filter((p): p is DebatePromise => !!p && !absorbed.has(p.id));
    // On ne fusionne que des promesses d'un même orateur.
    const same = members.filter((p) => p.speakerId === members[0]?.speakerId).sort((a, b) => a.start - b.start);
    if (same.length < 2) continue;
    const [first, ...rest] = same;
    for (const r of rest) {
      first.repeats.push({ segmentId: r.segmentId, start: r.start, quote: r.quote }, ...r.repeats);
      absorbed.add(r.id);
    }
    first.repeats.sort((a, b) => a.start - b.start);
    if (rest.some((r) => r.specificity === 'precise')) first.specificity = 'precise';
  }
  return promises.filter((p) => !absorbed.has(p.id));
}
