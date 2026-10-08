/**
 * Contrat de données du module « Vidéos », partagé entre le serveur et le client.
 * Le module analyse deux formats de vidéos YouTube : les débats (plusieurs orateurs
 * politiques) et les discours de campagne (un seul). Les noms de code gardent le mot
 * « debate » ; le champ `kind` distingue les deux formats.
 *
 * Les types `AnalysisData` / `Source` reproduisent la forme de la réponse de
 * `/api/analyze` sur parolesparoles.com (relevée dans le bundle de production),
 * pour que les évaluations du débat puissent être affichées par les composants
 * existants du site et inversement. Voir docs/INTEGRATION.md.
 */

/** Seuils de couleur utilisés par le site : >= 7 vert, >= 4 orange, sinon rouge. */
export const SCORE_GOOD = 7;
export const SCORE_MID = 4;

export type ScoreBand = 'good' | 'mid' | 'bad';

export function scoreBand(score: number): ScoreBand {
  return score >= SCORE_GOOD ? 'good' : score >= SCORE_MID ? 'mid' : 'bad';
}

// ---------------------------------------------------------------------------
// Évaluation d'une promesse — format identique à l'analyseur existant
// ---------------------------------------------------------------------------

export interface CategoryScores {
  /** Faisabilité juridique & constitutionnelle (0-10). */
  legal: number;
  /** Impact budgétaire & économique (0-10). */
  budget: number;
  /** Mise en œuvre & calendrier (0-10). */
  operational: number;
}

export interface Alternative {
  text: string;
  explanation: string;
  impact: string;
}

export interface ChartData {
  title?: string;
  yAxisLabel?: string;
  data: Array<{ name: string; [series: string]: string | number }>;
}

export interface AnalysisData {
  /** Score global de faisabilité, 0-10. */
  score: number;
  verdict: string;
  categoryScores: CategoryScores;
  strengths: string[];
  weaknesses: string[];
  alternatives: Alternative[];
  chartData?: ChartData;
  markdownReport: string;
}

export interface Source {
  uri: string;
  title?: string;
}

export interface Evaluation {
  data: AnalysisData;
  sources: Source[];
  /** ISO 8601. */
  evaluatedAt: string;
  /** Identifiant de l'évaluateur (ex. "gemini-standalone", "parolesparoles-analyze"). */
  evaluator: string;
  /** false si l'évaluation n'a pas pu s'appuyer sur une recherche documentaire (pas de sources). */
  grounded?: boolean;
}

// ---------------------------------------------------------------------------
// Débat
// ---------------------------------------------------------------------------

/** `candidate` = orateur politique dont on analyse les promesses (débatteur ou auteur du discours). */
export type SpeakerRole = 'candidate' | 'moderator' | 'other';

export interface Speaker {
  /** Identifiant stable dans le débat : "s1", "s2", … */
  id: string;
  name: string;
  role: SpeakerRole;
  /** Parti ou étiquette affichée à l'écran, si connue. */
  affiliation?: string;
  /** Indices visuels et vocaux pour reconnaître la personne (servent à la transcription). */
  cue?: string;
}

/** Identifiant utilisé quand l'orateur d'un passage n'a pas pu être déterminé. */
export const UNKNOWN_SPEAKER_ID = 'unknown';

export interface TranscriptSegment {
  id: string;
  /** Secondes depuis le début de la vidéo. */
  start: number;
  end: number;
  speakerId: string;
  text: string;
}

export interface Topic {
  id: string;
  title: string;
  start: number;
  end: number;
}

export type PromiseSpecificity = 'precise' | 'vague';

export interface PromiseOccurrence {
  segmentId: string;
  start: number;
  quote: string;
}

export interface DebatePromise {
  id: string;
  /** Toujours déduit du segment cité, jamais de l'affirmation du modèle. */
  speakerId: string;
  /** Première occurrence. */
  start: number;
  segmentId: string;
  /** Citation exacte tirée de la transcription. */
  quote: string;
  /** false si la citation n'a pas été retrouvée telle quelle dans le segment. */
  quoteVerified: boolean;
  /** Reformulation autonome, telle qu'on la taperait dans l'analyseur du site. */
  statement: string;
  theme: string;
  topicId?: string;
  specificity: PromiseSpecificity;
  /** Répétitions ultérieures de la même promesse dans le débat. */
  repeats: PromiseOccurrence[];
  evaluation?: Evaluation;
  evaluationError?: string;
}

export interface SpeakerStats {
  promiseCount: number;
  evaluatedCount: number;
  preciseCount: number;
  /** Moyenne des scores évalués, null si aucun. */
  averageScore: number | null;
  bands: Record<ScoreBand, number>;
  categoryAverages: CategoryScores | null;
  /** Temps de parole en secondes, d'après la transcription. */
  speakingTimeSec: number;
}

export interface SpeakerReport {
  speakerId: string;
  stats: SpeakerStats;
  /** Synthèse rédigée, neutre, sans désigner de « gagnant ». */
  summary: string;
  strengths: string[];
  weaknesses: string[];
}

export interface VideoInfo {
  videoId: string;
  url: string;
  title?: string;
  channel?: string;
  durationSec: number;
  /** Date de diffusion si identifiable (YYYY-MM-DD). */
  airedOn?: string;
}

/** Format de la vidéo analysée. */
export type VideoKind = 'debate' | 'speech';

export const KIND_LABELS: Record<VideoKind, { singular: string; analyzed: string }> = {
  debate: { singular: 'débat', analyzed: 'Débat analysé' },
  speech: { singular: 'discours', analyzed: 'Discours analysé' },
};

export type PipelineStep = 'survey' | 'transcribe' | 'topics' | 'extract' | 'evaluate' | 'summarize';

export const PIPELINE_STEPS: PipelineStep[] = ['survey', 'transcribe', 'topics', 'extract', 'evaluate', 'summarize'];

export const STEP_LABELS: Record<PipelineStep, string> = {
  survey: 'Repérage des participants',
  transcribe: 'Transcription et identification des orateurs',
  topics: 'Découpage thématique',
  extract: 'Extraction des promesses',
  evaluate: 'Évaluation des promesses',
  summarize: 'Bilan par orateur',
};

export interface DebateAnalysis {
  schemaVersion: 1;
  /** = videoId YouTube. */
  id: string;
  /** Débat ou discours : imposé à la création ou détecté au repérage. */
  kind: VideoKind;
  video: VideoInfo;
  speakers: Speaker[];
  transcript: TranscriptSegment[];
  topics: Topic[];
  promises: DebatePromise[];
  reports: SpeakerReport[];
  /** Étapes terminées, dans l'ordre. Sert à reprendre une analyse interrompue. */
  completedSteps: PipelineStep[];
  /** Avancement fin d'une étape longue, pour reprendre sans tout refaire. */
  checkpoints: { transcribedWindowStarts: number[] };
  models: Record<string, string>;
  warnings: string[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// API HTTP
// ---------------------------------------------------------------------------

export interface CreateDebateRequest {
  url: string;
  /** Format de la vidéo ; détecté automatiquement si absent. */
  kind?: VideoKind;
  /** Noms des orateurs politiques, pour aider l'identification (facultatif). */
  speakerHints?: string[];
  /** Relance l'analyse même si elle existe déjà. */
  force?: boolean;
}

export type JobState = 'queued' | 'running' | 'done' | 'error';

export interface DebateJobStatus {
  id: string;
  state: JobState;
  step?: PipelineStep;
  progress?: { done: number; total: number };
  message?: string;
  error?: string;
  /** Présent dès que l'analyse (même partielle) existe. */
  analysis?: DebateAnalysis;
}

export interface DebateListItem {
  id: string;
  kind: VideoKind;
  title?: string;
  speakers: string[];
  promiseCount: number;
  complete: boolean;
  updatedAt: string;
}
