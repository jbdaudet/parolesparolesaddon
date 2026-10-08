import { ArrowUp, GripHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { formatTimestamp } from '../../../shared/time-format';
import { cn } from '../score';

const STORAGE_KEY = 'pp-floating-player-position';
const MARGIN = 16;

interface Position {
  x: number;
  y: number;
}

interface Props {
  children: ReactNode;
  /** Position de lecture, affichée dans la barre de la mini-vidéo. */
  currentTime: number;
  /** Incrémenté à chaque saut dans la vidéo : réaffiche la mini-vidéo si elle avait été masquée. */
  revealSignal: number;
  onDismiss?(): void;
}

function loadPosition(): Position | null {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return typeof p?.x === 'number' && typeof p?.y === 'number' ? p : null;
  } catch {
    return null;
  }
}

function savePosition(p: Position) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // stockage indisponible (navigation privée…) : la position ne sera simplement pas retenue
  }
}

/**
 * Garde la vidéo à l'écran pendant la lecture de l'analyse : quand son emplacement
 * sort de l'écran, le lecteur devient une mini-vidéo flottante et déplaçable.
 *
 * Le lecteur n'est jamais déplacé dans le DOM (un iframe déplacé se recharge et
 * coupe la lecture) : seul son positionnement CSS change, l'emplacement d'origine
 * garde sa hauteur pour éviter tout saut de mise en page.
 */
export function FloatingPlayer({ children, currentTime, revealSignal, onDismiss }: Props) {
  const slot = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [offscreen, setOffscreen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);

  const floating = offscreen && !dismissed;

  // Emplacement d'origine visible ou non.
  useEffect(() => {
    const el = slot.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting), { threshold: 0.25 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Revenir à la vidéo (remontée dans la page) annule le masquage ; un saut dans la vidéo aussi.
  useEffect(() => {
    if (!offscreen) setDismissed(false);
  }, [offscreen]);
  useEffect(() => {
    if (revealSignal > 0) setDismissed(false);
  }, [revealSignal]);

  /** Ramène la mini-vidéo dans la fenêtre (après redimensionnement ou position mémorisée hors écran). */
  const clamp = useCallback((p: Position): Position => {
    const el = frame.current;
    const w = el?.offsetWidth ?? 360;
    const h = el?.offsetHeight ?? 240;
    return {
      x: Math.min(Math.max(MARGIN, p.x), window.innerWidth - w - MARGIN),
      y: Math.min(Math.max(MARGIN, p.y), window.innerHeight - h - MARGIN),
    };
  }, []);

  // Position initiale : mémorisée, sinon en bas à droite.
  useLayoutEffect(() => {
    if (!floating || position) return;
    const el = frame.current;
    const fallback = {
      x: window.innerWidth - (el?.offsetWidth ?? 360) - 24,
      y: window.innerHeight - (el?.offsetHeight ?? 240) - 24,
    };
    setPosition(clamp(loadPosition() ?? fallback));
  }, [floating, position, clamp]);

  useEffect(() => {
    const onResize = () => setPosition((p) => (p ? clamp(p) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);

  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || !position) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - position.x, dy: e.clientY - position.y };
    setDragging(true);
  };
  const moveDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setPosition(clamp({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }));
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (position) savePosition(position);
  };

  return (
    <div ref={slot} className="aspect-video w-full">
      <div
        ref={frame}
        className={cn(
          floating
            ? 'fixed z-50 w-[min(22rem,62vw)] overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-xl'
            : 'h-full w-full',
          floating && !position && 'invisible',
        )}
        style={floating && position ? { left: position.x, top: position.y } : undefined}
      >
        {floating && (
          <div
            className={cn(
              'flex touch-none items-center gap-2 border-b border-slate-100 px-3 py-1.5 select-none',
              dragging ? 'cursor-grabbing' : 'cursor-grab',
            )}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <GripHorizontal className="h-4 w-4 shrink-0 text-slate-300" />
            <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums">
              {formatTimestamp(currentTime)}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => slot.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600"
              aria-label="Revenir à la vidéo dans la page"
              title="Revenir à la vidéo"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setDismissed(true);
                onDismiss?.();
              }}
              className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Masquer la mini-vidéo"
              title="Masquer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {/* Pendant un déplacement, l'iframe ne doit pas capter le pointeur. */}
        <div className={cn(floating && '[&_.rounded-3xl]:rounded-none', dragging && 'pointer-events-none')}>
          {children}
        </div>
      </div>
    </div>
  );
}
