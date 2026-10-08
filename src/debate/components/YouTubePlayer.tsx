import { VideoOff } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { formatTimestamp } from '../../../shared/time-format';

export interface PlayerHandle {
  seekTo(seconds: number): void;
  pause(): void;
}

interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  destroy(): void;
}

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: object) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

/** Charge une seule fois l'API IFrame de YouTube. */
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  apiPromise ??= new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return apiPromise;
}

/**
 * Lecteur YouTube intégré (lecture « nocookie »), pilotable par `seekTo`.
 * Remonte la position de lecture pour la tête de lecture de la timeline.
 * Sans vidéo (démonstration), affiche un cadre neutre et simule la position.
 */
export const YouTubePlayer = forwardRef<PlayerHandle, { videoId: string | null; onTime(seconds: number): void }>(
  function YouTubePlayer({ videoId, onTime }, ref) {
    const host = useRef<HTMLDivElement>(null);
    const player = useRef<YTPlayer | null>(null);
    const [simulated, setSimulated] = useState(0);

    useImperativeHandle(ref, () => ({
      seekTo(seconds) {
        if (player.current) {
          player.current.seekTo(seconds, true);
          player.current.playVideo();
        } else {
          setSimulated(seconds);
        }
        onTime(seconds);
      },
      pause() {
        player.current?.pauseVideo?.();
      },
    }));

    useEffect(() => {
      if (!videoId || !host.current) return;
      let cancelled = false;
      let timer: ReturnType<typeof setInterval>;
      const mount = document.createElement('div');
      host.current.replaceChildren(mount);

      loadYouTubeApi().then(() => {
        if (cancelled || !window.YT) return;
        player.current = new window.YT.Player(mount, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          width: '100%',
          height: '100%',
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        });
        timer = setInterval(() => {
          const t = player.current?.getCurrentTime?.();
          if (typeof t === 'number') onTime(t);
        }, 500);
      });

      return () => {
        cancelled = true;
        clearInterval(timer);
        player.current?.destroy();
        player.current = null;
      };
      // onTime est stable côté appelant (setState).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoId]);

    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-3xl bg-slate-900 shadow-sm">
        {videoId ? (
          <div ref={host} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 p-6 text-center text-white">
            <VideoOff className="h-8 w-8 text-blue-200" />
            <p className="text-sm font-semibold">Pas de vidéo pour cette démonstration</p>
            <p className="font-mono text-3xl font-bold tabular-nums">{formatTimestamp(simulated)}</p>
            <p className="max-w-xs text-xs text-slate-300">
              Avec une vraie vidéo, cliquer sur une promesse lance la vidéo YouTube à cet instant.
            </p>
          </div>
        )}
      </div>
    );
  },
);
