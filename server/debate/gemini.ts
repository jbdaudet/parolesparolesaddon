import { GoogleGenAI } from '@google/genai';
import type { Source } from '../../shared/debate-types';

/**
 * Accès au modèle derrière une interface minimale `LlmClient`, pour pouvoir
 * substituer un faux client dans les tests (voir tests/pipeline.test.ts).
 *
 * Utilise l'API Interactions du SDK @google/genai (2.x), celle de la documentation
 * actuelle de Gemini. Si le site utilise encore `ai.models.generateContent`, les deux
 * cohabitent dans le même SDK : seule `GeminiClient` est à adapter.
 */

export type InputPart =
  | { type: 'text'; text: string }
  | {
      type: 'video';
      uri: string;
      resolution?: 'low' | 'medium' | 'high';
      /** Décalages au format "123s". */
      processing?: { type: 'static'; start_offset?: string; end_offset?: string; fps?: number };
    };

export interface JsonRequest {
  /** Libellé pour les journaux et les messages d'erreur. */
  label: string;
  model: string;
  system?: string;
  input: InputPart[];
  /** JSON Schema de la réponse attendue. */
  schema: Record<string, unknown>;
  googleSearch?: boolean;
  thinking?: 'minimal' | 'low' | 'medium' | 'high';
  maxOutputTokens?: number;
  /** Nombre maximal de tentatives (défaut : celui du client). */
  maxAttempts?: number;
}

export interface JsonResponse<T> {
  value: T;
  /** Citations `url_citation` renvoyées avec la recherche Google. */
  citations: Source[];
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface LlmClient {
  generateJson<T>(req: JsonRequest): Promise<JsonResponse<T>>;
}

/** Sous-ensemble de la réponse `Interaction` du SDK dont on a besoin. */
interface InteractionResult {
  status: string;
  errors?: unknown[];
  output_text?: string;
  steps?: unknown[];
  usage?: { total_input_tokens?: number; total_output_tokens?: number };
}

const RETRYABLE = /\b(429|500|502|503|504)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|fetch failed/i;

export class GeminiClient implements LlmClient {
  private create: (params: object) => Promise<InteractionResult>;

  constructor(
    apiKey: string | undefined = process.env.GEMINI_API_KEY,
    private maxAttempts = 4,
  ) {
    if (!apiKey) throw new Error('GEMINI_API_KEY manquante');
    const ai = new GoogleGenAI({ apiKey });
    // Appel non-streaming ; on type la réponse localement pour ne pas dépendre des surcharges du SDK.
    // Les nouvelles tentatives sont gérées ici (et non par le SDK) ; délai long pour les tronçons vidéo.
    const options = { retries: { strategy: 'none' }, timeout_ms: 10 * 60_000 };
    this.create = (params) => ai.interactions.create(params as never, options as never) as Promise<InteractionResult>;
  }

  async generateJson<T>(req: JsonRequest): Promise<JsonResponse<T>> {
    const params = {
      model: req.model,
      input: req.input,
      ...(req.system ? { system_instruction: req.system } : {}),
      response_format: { type: 'text', mime_type: 'application/json', schema: req.schema },
      ...(req.googleSearch ? { tools: [{ type: 'google_search' }] } : {}),
      generation_config: {
        ...(req.thinking ? { thinking_level: req.thinking } : {}),
        ...(req.maxOutputTokens ? { max_output_tokens: req.maxOutputTokens } : {}),
      },
      stream: false,
    };

    for (let attempt = 1; ; attempt++) {
      try {
        const interaction = await this.create(params);
        if (interaction.status !== 'completed') {
          const details = interaction.errors?.map((e) => JSON.stringify(e)).join('; ');
          throw new Error(`statut ${interaction.status}${details ? ` (${details})` : ''}`);
        }
        return {
          value: parseJson<T>(interaction.output_text ?? '', req.label),
          citations: collectCitations(interaction.steps),
          usage: {
            inputTokens: interaction.usage?.total_input_tokens,
            outputTokens: interaction.usage?.total_output_tokens,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (attempt >= (req.maxAttempts ?? this.maxAttempts) || !RETRYABLE.test(message)) {
          throw new Error(`[${req.label}] échec de l'appel Gemini : ${message}`);
        }
        await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
      }
    }
  }
}

/** Tolère un éventuel bloc ```json … ``` autour de la réponse. */
export function parseJson<T>(text: string, label: string): T {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`[${label}] réponse JSON invalide : ${trimmed.slice(0, 200)}…`);
  }
}

function collectCitations(steps: unknown): Source[] {
  const out: Source[] = [];
  if (!Array.isArray(steps)) return out;
  for (const step of steps) {
    if (step?.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (const content of step.content) {
      for (const a of content?.annotations ?? []) {
        if (a?.type === 'url_citation' && a.url) out.push({ uri: a.url, title: a.title });
      }
    }
  }
  return out;
}
