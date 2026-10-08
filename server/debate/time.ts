export { formatTimestamp } from '../../shared/time-format';

/** Conversion des horodatages renvoyés par le modèle ("MM:SS", "H:MM:SS", "75s", 75). */
export function parseTimestamp(value: string | number): number {
  if (typeof value === 'number') return value;
  const v = value.trim();
  const secondsSuffix = /^(\d+(?:\.\d+)?)s$/.exec(v);
  if (secondsSuffix) return Number(secondsSuffix[1]);
  if (/^\d+(?:\.\d+)?$/.test(v)) return Number(v);
  const parts = v.split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => Number.isNaN(p))) {
    throw new Error(`Horodatage illisible : "${value}"`);
  }
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/** Format attendu par `processing.start_offset` / `end_offset` de l'API Gemini. */
export const toOffset = (seconds: number) => `${Math.round(seconds)}s`;

export type TimeBase = 'absolute' | 'relative' | 'ambiguous';

/**
 * Quand on envoie un extrait [chunkStart, chunkEnd] de la vidéo, le modèle peut
 * répondre avec des horodatages relatifs à l'extrait OU absolus. On détecte lequel
 * pour ramener tout en absolu. Pour le premier tronçon les deux coïncident.
 */
export function detectTimeBase(times: number[], chunkStart: number, chunkEnd: number, tolerance = 30): TimeBase {
  if (times.length === 0 || chunkStart === 0) return 'absolute';
  const length = chunkEnd - chunkStart;
  const allAbsolute = times.every((t) => t >= chunkStart - tolerance && t <= chunkEnd + tolerance);
  const allRelative = times.every((t) => t >= 0 && t <= length + tolerance);
  if (allAbsolute && !allRelative) return 'absolute';
  if (allRelative && !allAbsolute) return 'relative';
  return 'ambiguous';
}

/** Découpe [0, duration] en fenêtres de `chunkSeconds`. */
export function chunkWindows(durationSec: number, chunkSeconds: number): Array<[number, number]> {
  const windows: Array<[number, number]> = [];
  for (let start = 0; start < durationSec; start += chunkSeconds) {
    windows.push([start, Math.min(start + chunkSeconds, durationSec)]);
  }
  return windows;
}
