import { scoreBand, type ScoreBand } from '../../shared/debate-types';

/**
 * Classes reprises à l'identique de l'indicateur de score du site (seuils 7 / 4).
 * Lors de la fusion, remplacer par le composant de score existant.
 */
export const BAND_STYLES: Record<
  ScoreBand,
  { border: string; solidBorder: string; text: string; badge: string; dot: string; label: string }
> = {
  good: {
    border: 'border-[#34c759]/30',
    solidBorder: 'border-[#34c759]',
    text: 'text-[#34c759]',
    badge: 'bg-[#34c759]/10 text-[#248a3d] border border-[#34c759]/30',
    dot: 'bg-[#34c759]',
    label: 'Réaliste',
  },
  mid: {
    border: 'border-[#ff9500]/30',
    solidBorder: 'border-[#ff9500]',
    text: 'text-[#ff9500]',
    badge: 'bg-[#ff9500]/10 text-[#b26600] border border-[#ff9500]/30',
    dot: 'bg-[#ff9500]',
    label: 'Incertaine',
  },
  bad: {
    border: 'border-[#ff3b30]/30',
    solidBorder: 'border-[#ff3b30]',
    text: 'text-[#ff3b30]',
    badge: 'bg-[#ff3b30]/10 text-[#d70015] border border-[#ff3b30]/30',
    dot: 'bg-[#ff3b30]',
    label: 'Peu réaliste',
  },
};

/** Barres de catégories : mêmes dégradés que le site pour « good », équivalents pour les autres. */
export const BAR_STYLES: Record<ScoreBand, { bar: string; text: string; track: string }> = {
  good: {
    bar: 'bg-gradient-to-r from-emerald-400 to-emerald-500',
    text: 'text-emerald-700',
    track: 'bg-emerald-50/80',
  },
  mid: { bar: 'bg-gradient-to-r from-amber-400 to-amber-500', text: 'text-amber-700', track: 'bg-amber-50/80' },
  bad: { bar: 'bg-gradient-to-r from-rose-400 to-rose-500', text: 'text-rose-700', track: 'bg-rose-50/80' },
};

export const bandOf = scoreBand;

export const formatScore = (score: number) => score.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

export const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');
