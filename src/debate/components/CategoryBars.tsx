import { Gavel, Timer, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CategoryScores } from '../../../shared/debate-types';
import { BAR_STYLES, bandOf, cn, formatScore } from '../score';

/** Mêmes catégories et libellés que l'analyseur du site. */
const CATEGORIES: Array<{ id: keyof CategoryScores; label: string; icon: ReactNode }> = [
  { id: 'legal', label: 'Juridique & Textes', icon: <Gavel className="h-4 w-4" /> },
  { id: 'budget', label: 'Budget & Économie', icon: <Wallet className="h-4 w-4" /> },
  { id: 'operational', label: 'Opérationnel & Délais', icon: <Timer className="h-4 w-4" /> },
];

export function CategoryBars({ scores, className }: { scores: CategoryScores; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {CATEGORIES.map((c) => {
        const score = scores[c.id];
        const style = BAR_STYLES[bandOf(score)];
        return (
          <div key={c.id} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span className="flex items-center gap-2">
                <span className="text-slate-400">{c.icon}</span>
                {c.label}
              </span>
              <span className={cn('font-bold tabular-nums', style.text)}>{formatScore(score)}/10</span>
            </div>
            <div className={cn('h-2 overflow-hidden rounded-full', style.track)}>
              <div className={cn('h-full rounded-full', style.bar)} style={{ width: `${score * 10}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
