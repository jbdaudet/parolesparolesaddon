/**
 * Configuration du module, entièrement surchargeable par variables d'environnement.
 * Les identifiants de modèles changent souvent : ne pas les coder ailleurs qu'ici.
 */
export interface DebateConfig {
  /** Modèle multimodal pour lire la vidéo (repérage + transcription). */
  videoModel: string;
  /** Modèle texte pour thèmes, extraction, dédoublonnage, bilans. */
  textModel: string;
  /** Modèle utilisé par l'évaluateur autonome (avec Google Search). */
  evaluationModel: string;
  /**
   * Recherche Google pendant l'évaluation : "on" toujours, "off" jamais, "auto" (défaut) l'utilise
   * et s'en passe si elle est refusée pour quota (cas des clés gratuites).
   */
  evaluationSearch: 'auto' | 'on' | 'off';
  /** Durée d'un tronçon de transcription, en secondes. */
  chunkSeconds: number;
  /** Images par seconde envoyées au modèle (servent à reconnaître qui parle). */
  transcribeFps: number;
  /** Images par seconde pour le repérage initial sur la vidéo entière. */
  surveyFps: number;
  /** Nombre d'appels Gemini simultanés. */
  concurrency: number;
  /** Durée maximale acceptée (garde-fou de coût). */
  maxDurationSec: number;
  /** Répertoire de stockage des analyses (FileDebateStore). */
  dataDir: string;
  /** Si défini, POST /api/debates exige l'en-tête `x-admin-token`. */
  adminToken?: string;
}

const num = (v: string | undefined, fallback: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : fallback);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DebateConfig {
  return {
    videoModel: env.DEBATE_VIDEO_MODEL ?? 'gemini-3.8-flash',
    textModel: env.DEBATE_TEXT_MODEL ?? 'gemini-3.8-flash',
    evaluationModel: env.DEBATE_EVALUATION_MODEL ?? 'gemini-3.8-flash',
    evaluationSearch: (['on', 'off'] as const).find((v) => v === env.DEBATE_EVALUATION_SEARCH) ?? 'auto',
    chunkSeconds: num(env.DEBATE_CHUNK_SECONDS, 600),
    transcribeFps: num(env.DEBATE_TRANSCRIBE_FPS, 0.2),
    surveyFps: num(env.DEBATE_SURVEY_FPS, 0.05),
    concurrency: num(env.DEBATE_CONCURRENCY, 3),
    maxDurationSec: num(env.DEBATE_MAX_DURATION_SEC, 4 * 3600),
    dataDir: env.DEBATE_DATA_DIR ?? 'data/debates',
    adminToken: env.DEBATE_ADMIN_TOKEN || undefined,
  };
}
