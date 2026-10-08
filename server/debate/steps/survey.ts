import type { Speaker, SpeakerRole, VideoKind } from '../../../shared/debate-types';
import type { StepContext } from './context';

/**
 * Étape 1 — Repérage : un passage rapide sur toute la vidéo (très peu d'images
 * par seconde) pour obtenir le format (débat ou discours), la durée, le titre et
 * la liste des participants. Les identifiants s1, s2… fixés ici sont réutilisés
 * par tous les tronçons de transcription, ce qui garantit des orateurs cohérents
 * d'un tronçon à l'autre.
 */

interface SurveyResult {
  format: VideoKind;
  duration_seconds: number;
  title: string;
  aired_on: string;
  participants: Array<{ name: string; role: SpeakerRole; affiliation: string; how_to_recognize: string }>;
}

const schema = {
  type: 'object',
  properties: {
    format: {
      type: 'string',
      enum: ['debate', 'speech'],
      description: '"debate" si plusieurs responsables politiques se répondent, "speech" pour un discours ou meeting.',
    },
    duration_seconds: { type: 'integer', description: 'Durée totale de la vidéo en secondes.' },
    title: { type: 'string', description: 'Intitulé (émission, meeting, lieu), chaîne vide si inconnu.' },
    aired_on: { type: 'string', description: 'Date de diffusion AAAA-MM-JJ si identifiable, sinon chaîne vide.' },
    participants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Prénom et nom tels que présentés.' },
          role: { type: 'string', enum: ['candidate', 'moderator', 'other'] },
          affiliation: { type: 'string', description: 'Parti ou fonction, chaîne vide si inconnu.' },
          how_to_recognize: { type: 'string', description: 'Indices visuels et vocaux pour le reconnaître.' },
        },
        required: ['name', 'role', 'affiliation', 'how_to_recognize'],
      },
    },
  },
  required: ['format', 'duration_seconds', 'title', 'aired_on', 'participants'],
};

const FORMAT_HINT: Record<VideoKind, string> = {
  debate: 'Il s’agit d’un débat.',
  speech: 'Il s’agit d’un discours de campagne.',
};

export async function survey(
  ctx: StepContext,
  opts: { kind?: VideoKind; speakerHints?: string[] } = {},
): Promise<void> {
  const { analysis, config } = ctx;
  const speakerHints = opts.speakerHints ?? [];
  ctx.progress(0, 1, 'Visionnage rapide de la vidéo');

  const hints = speakerHints.length
    ? `\nL'utilisateur indique que les orateurs politiques sont : ${speakerHints.join(', ')}. Utilise ces noms s'ils correspondent.`
    : '';

  const { value } = await ctx.llm.generateJson<SurveyResult>({
    label: 'survey',
    model: config.videoModel,
    input: [
      {
        type: 'video',
        uri: analysis.video.url,
        resolution: 'low',
        processing: { type: 'static', fps: config.surveyFps },
      },
      {
        type: 'text',
        text: `Cette vidéo est une prise de parole politique française : soit un DÉBAT (plusieurs responsables
politiques se répondent, souvent avec des journalistes), soit un DISCOURS de campagne (un orateur principal,
éventuellement présenté par d'autres personnes). ${opts.kind ? FORMAT_HINT[opts.kind] : 'Détermine lequel.'}

Identifie :
- le format, la durée totale de la vidéo, son intitulé et sa date de diffusion si elle est visible ou annoncée ;
- chaque personne qui prend la parole, avec son rôle :
  · "candidate" : responsable politique dont on analysera les promesses (les débatteurs ; pour un discours, l'orateur principal) ;
  · "moderator" : journalistes, animateurs ;
  · "other" : toute autre personne (personnes qui présentent l'orateur, public, invités).
Appuie-toi sur les présentations orales et les bandeaux à l'écran. N'invente aucun nom : si un nom n'est jamais donné, décris la personne (ex. « Journaliste 1 »).
Pour chacun, note comment le reconnaître (voix, position à l'écran, tenue) afin qu'un autre transcripteur puisse l'identifier.${hints}`,
      },
    ],
    schema,
    thinking: 'low',
  });

  analysis.kind = opts.kind ?? (value.format === 'speech' ? 'speech' : 'debate');

  const duration = Math.round(value.duration_seconds);
  if (!duration || duration <= 0) throw new Error('Durée de la vidéo introuvable.');
  if (duration > config.maxDurationSec) {
    throw new Error(
      `Vidéo trop longue (${Math.round(duration / 60)} min, maximum ${Math.round(config.maxDurationSec / 60)} min).`,
    );
  }

  analysis.video.durationSec = duration;
  analysis.video.title ||= value.title || undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.aired_on)) analysis.video.airedOn = value.aired_on;

  analysis.speakers = value.participants.map(
    (p, i): Speaker => ({
      id: `s${i + 1}`,
      name: p.name.trim(),
      role: p.role,
      ...(p.affiliation ? { affiliation: p.affiliation.trim() } : {}),
      ...(p.how_to_recognize ? { cue: p.how_to_recognize.trim() } : {}),
    }),
  );

  const candidates = analysis.speakers.filter((s) => s.role === 'candidate').length;
  if (analysis.kind === 'debate' && candidates < 2) {
    ctx.warn(`Seulement ${candidates} débatteur(s) identifié(s) : vérifier la liste des participants.`);
  }
  if (analysis.kind === 'speech' && candidates !== 1) {
    ctx.warn(`${candidates} orateurs politiques identifiés pour un discours : vérifier la liste des participants.`);
  }
  ctx.progress(1, 1);
}
