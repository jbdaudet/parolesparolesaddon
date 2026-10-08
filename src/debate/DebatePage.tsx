import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DebateJobStatus } from '../../shared/debate-types';
import { createDebate, getDebate } from './api';
import { DebateProgress } from './components/DebateProgress';
import { DebateView } from './DebateView';

/**
 * Page d'un débat, indépendante du routeur : l'identifiant est passé en prop
 * (lors de la fusion : `const { id } = useParams()` dans la route du site).
 * Interroge le serveur toutes les 3 s tant que l'analyse n'est pas terminée.
 */
export function DebatePage({ id }: { id: string }) {
  const [status, setStatus] = useState<DebateJobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const s = await getDebate(id);
        if (cancelled) return;
        setStatus(s);
        setError(null);
        if (s.state === 'queued' || s.state === 'running') timer = setTimeout(poll, 3000);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, tick]);

  const retry = async () => {
    if (!status?.analysis) return;
    try {
      await createDebate({ url: status.analysis.video.url });
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (error && !status) return <p className="py-20 text-center text-sm text-rose-600">{error}</p>;
  if (!status) {
    return (
      <div className="flex justify-center py-20">
        <LoaderCircle className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }
  if (status.state === 'done' && status.analysis) return <DebateView analysis={status.analysis} />;
  return <DebateProgress status={status} onRetry={status.analysis ? retry : undefined} />;
}
