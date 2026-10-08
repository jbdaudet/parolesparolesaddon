import { UNKNOWN_SPEAKER_ID, type TranscriptSegment } from '../../../shared/debate-types';
import { mapLimit } from '../text';
import { chunkWindows, detectTimeBase, formatTimestamp, parseTimestamp, toOffset } from '../time';
import { describeSpeakers, kindNoun, type StepContext } from './context';

/**
 * Étape 2 — Transcription avec identification des orateurs, tronçon par tronçon
 * (10 min par défaut). Les images (0,2 par seconde) aident le modèle à voir qui
 * parle ; la liste des participants fixée à l'étape 1 garde les noms cohérents.
 * Chaque tronçon terminé est enregistré, pour reprendre sans tout refaire.
 *
 * Constaté sur l'API réelle : le modèle répond en horodatages absolus (depuis le
 * début de la vidéo). On les demande donc ainsi ; `detectTimeBase` reste un filet
 * de sécurité si un tronçon revient en temps relatifs.
 */

interface RawSegment {
  start: string;
  end: string;
  speaker_id: string;
  text: string;
}

const schema = {
  type: 'object',
  properties: {
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'Horodatage de début, MM:SS ou H:MM:SS.' },
          end: { type: 'string', description: 'Horodatage de fin, MM:SS ou H:MM:SS.' },
          speaker_id: { type: 'string', description: 'Identifiant du participant, ou "unknown".' },
          text: { type: 'string', description: 'Paroles exactes, en français.' },
        },
        required: ['start', 'end', 'speaker_id', 'text'],
      },
    },
  },
  required: ['segments'],
};

export async function transcribe(ctx: StepContext): Promise<void> {
  const { analysis, config } = ctx;
  const windows = chunkWindows(analysis.video.durationSec, config.chunkSeconds);
  const done = new Set(analysis.checkpoints.transcribedWindowStarts);
  const knownIds = new Set(analysis.speakers.map((s) => s.id));
  let completed = done.size;
  ctx.progress(completed, windows.length);

  await mapLimit(
    windows.filter(([start]) => !done.has(start)),
    config.concurrency,
    async ([start, end]) => {
      const range = `${formatTimestamp(start)} – ${formatTimestamp(end)}`;
      let raw: RawSegment[];
      let paraphrased = false;
      try {
        raw = await transcribeWindow(ctx, start, end, 'verbatim');
      } catch (err) {
        if (!RECITATION_BLOCK.test(err instanceof Error ? err.message : String(err))) throw err;
        // Gemini refuse de reproduire mot pour mot un contenu qu'il reconnaît (émission télévisée…).
        // On ne contourne pas ce filtre : on résume les prises de parole, et on le signale.
        raw = await transcribeWindow(ctx, start, end, 'summary');
        paraphrased = true;
        ctx.warn(
          `Passage ${range} : transcription mot pour mot refusée par Gemini (droits d’auteur) ; propos résumés à la place.`,
        );
      }

      const segments = toSegments(raw, start, end, knownIds, ctx.warn).map((seg) =>
        paraphrased ? { ...seg, paraphrased: true } : seg,
      );
      analysis.transcript.push(...segments);
      analysis.checkpoints.transcribedWindowStarts.push(start);
      await ctx.checkpoint();
      ctx.progress(++completed, windows.length, `Tronçon ${range}`);
    },
  );

  // Ordre chronologique et identifiants stables t1, t2, …
  analysis.transcript.sort((a, b) => a.start - b.start);
  analysis.transcript.forEach((seg, i) => (seg.id = `t${i + 1}`));
}

/** Refus de Gemini de reproduire un contenu protégé (erreur 400 « recitation »). */
const RECITATION_BLOCK = /recitation|copyright/i;

async function transcribeWindow(
  ctx: StepContext,
  start: number,
  end: number,
  mode: 'verbatim' | 'summary',
): Promise<RawSegment[]> {
  const { analysis, config } = ctx;
  const timing = `Horodatages au format MM:SS (ou H:MM:SS), mesurés depuis le début de la vidéo complète
  (cet extrait commence à ${formatTimestamp(start)} et se termine à ${formatTimestamp(end)}).`;
  const instructions =
    mode === 'verbatim'
      ? `Transcris intégralement et mot pour mot cet extrait d'un ${kindNoun(analysis)} politique français.

Participants (utilise exclusivement ces identifiants) :
${describeSpeakers(analysis.speakers)}

Règles :
- Un segment par prise de parole ; découpe les longues interventions en segments de 60 secondes maximum.
- speaker_id : l'identifiant de la personne qui parle. Si tu n'es pas certain, utilise "unknown" plutôt que de deviner.
- Quand deux personnes parlent en même temps, transcris la voix principale et attribue-la correctement.
- Conserve les chiffres, montants et dates exactement comme prononcés.
- ${timing}
- N'ajoute ni résumé ni commentaire.`
      : `Résume, prise de parole par prise de parole, ce que dit chaque participant dans cet extrait d'un
${kindNoun(analysis)} politique français.

Participants (utilise exclusivement ces identifiants) :
${describeSpeakers(analysis.speakers)}

Règles :
- Un segment par prise de parole : qui parle (speaker_id, ou "unknown" en cas de doute) et quand.
- text : résumé de 1 à 3 phrases à la troisième personne, avec ses propositions concrètes (mesures, chiffres,
  échéances) telles qu'annoncées. Ne recopie pas les phrases prononcées : reformule.
- ${timing}`;

  const { value } = await ctx.llm.generateJson<{ segments: RawSegment[] }>({
    label: `transcribe${mode === 'summary' ? '-summary' : ''} ${formatTimestamp(start)}`,
    model: config.videoModel,
    input: [
      {
        type: 'video',
        uri: analysis.video.url,
        resolution: 'low',
        processing: {
          type: 'static',
          start_offset: toOffset(start),
          end_offset: toOffset(end),
          fps: config.transcribeFps,
        },
      },
      { type: 'text', text: instructions },
    ],
    schema,
    thinking: 'low',
    maxOutputTokens: 32768,
  });
  return value.segments;
}

/** Convertit la réponse brute d'un tronçon en segments absolus et validés. */
export function toSegments(
  raw: RawSegment[],
  windowStart: number,
  windowEnd: number,
  knownSpeakerIds: Set<string>,
  warn: (m: string) => void,
): TranscriptSegment[] {
  const parsed = raw
    .map((r) => {
      try {
        return { ...r, s: parseTimestamp(r.start), e: parseTimestamp(r.end) };
      } catch {
        return null;
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && r.text.trim().length > 0);

  const base = detectTimeBase(
    parsed.map((p) => p.s),
    windowStart,
    windowEnd,
  );
  if (base === 'ambiguous') {
    warn(`Horodatages ambigus sur le tronçon ${formatTimestamp(windowStart)} : interprétés comme relatifs.`);
  }
  const shift = base === 'absolute' ? 0 : windowStart;

  return parsed.map((p) => {
    const start = Math.min(Math.max(p.s + shift, windowStart), windowEnd);
    const end = Math.min(Math.max(p.e + shift, start), windowEnd);
    return {
      id: '',
      start,
      end,
      speakerId: knownSpeakerIds.has(p.speaker_id) ? p.speaker_id : UNKNOWN_SPEAKER_ID,
      text: p.text.trim(),
    };
  });
}
