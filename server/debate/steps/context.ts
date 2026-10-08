import { KIND_LABELS, type DebateAnalysis, type Speaker } from '../../../shared/debate-types';
import type { DebateConfig } from '../config';
import type { LlmClient } from '../gemini';
import { formatTimestamp } from '../time';

export interface StepContext {
  llm: LlmClient;
  config: DebateConfig;
  /** Analyse en cours, modifiée en place par chaque étape. */
  analysis: DebateAnalysis;
  progress(done: number, total: number, message?: string): void;
  /** Sauvegarde intermédiaire (étapes longues). */
  checkpoint(): Promise<void>;
  warn(message: string): void;
}

export const speakerById = (analysis: DebateAnalysis) => new Map(analysis.speakers.map((s) => [s.id, s]));

const ROLE_LABEL: Record<Speaker['role'], string> = {
  candidate: 'orateur politique',
  moderator: 'modérateur',
  other: 'autre',
};

/** « débat » ou « discours », pour les prompts. */
export const kindNoun = (analysis: DebateAnalysis) => KIND_LABELS[analysis.kind].singular;

export function describeSpeakers(speakers: Speaker[]): string {
  return speakers
    .map(
      (s) =>
        `- ${s.id} : ${s.name} (${ROLE_LABEL[s.role]}${s.affiliation ? `, ${s.affiliation}` : ''})` +
        (s.cue ? ` — repères : ${s.cue}` : ''),
    )
    .join('\n');
}

/** Transcription condensée « [id | horodatage | nom] texte » pour les étapes texte. */
export function formatTranscript(analysis: DebateAnalysis, segments = analysis.transcript): string {
  const speakers = speakerById(analysis);
  return segments
    .map(
      (t) =>
        `[${t.id} | ${formatTimestamp(t.start)} | ${speakers.get(t.speakerId)?.name ?? 'Inconnu'}${
          t.paraphrased ? ' | résumé' : ''
        }] ${t.text}`,
    )
    .join('\n');
}
