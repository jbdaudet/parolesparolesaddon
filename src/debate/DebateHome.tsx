import { LoaderCircle, Mic } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { KIND_LABELS, type DebateListItem, type VideoKind } from '../../shared/debate-types';
import { createDebate, listDebates } from './api';
import { cn } from './score';

const KIND_OPTIONS: Array<{ value: VideoKind | 'auto'; label: string }> = [
  { value: 'auto', label: 'Détection auto' },
  { value: 'debate', label: 'Débat' },
  { value: 'speech', label: 'Discours' },
];

/**
 * Accueil du module : formulaire de lancement et liste des vidéos déjà analysées.
 * `onOpen` reçoit l'identifiant de la vidéo (lors de la fusion : navigate(`/video/${id}`)).
 */
export function DebateHome({ onOpen }: { onOpen(id: string): void }) {
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<VideoKind | 'auto'>('auto');
  const [names, setNames] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debates, setDebates] = useState<DebateListItem[] | null>(null);

  useEffect(() => {
    listDebates().then(setDebates, () => setDebates([]));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const speakerHints = names
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      const job = await createDebate(
        { url, speakerHints, ...(kind === 'auto' ? {} : { kind }) },
        adminToken || undefined,
      );
      onOpen(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Mêmes classes que le champ et le bouton principal de l'analyseur du site.
  const input =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-2xs transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-hidden';

  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-slate-200/60 bg-white p-6 shadow-sm sm:p-10">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-800">
          <Mic className="h-5 w-5 text-blue-600" /> Quel débat ou discours faut-il décrypter ?
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          Collez le lien YouTube d’un débat ou d’un discours de campagne : chaque promesse est repérée, attribuée à son
          auteur, placée sur une timeline et évaluée avec la même méthode que l’analyseur.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-3">
          {/* Même sélecteur à pastilles que la navigation du site. */}
          <div
            role="radiogroup"
            aria-label="Format de la vidéo"
            className="inline-flex gap-1 rounded-xl bg-slate-100 p-1"
          >
            {KIND_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={kind === o.value}
                onClick={() => setKind(o.value)}
                className={cn(
                  'rounded-lg px-4 py-1.5 text-xs font-bold tracking-wider uppercase transition-all',
                  kind === o.value ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-900',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <input
            className={input}
            type="url"
            required
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Lien YouTube de la vidéo"
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              className={input}
              placeholder="Noms des orateurs politiques (facultatif, séparés par des virgules)"
              value={names}
              onChange={(e) => setNames(e.target.value)}
              aria-label="Noms des orateurs politiques"
            />
            <input
              className={`${input} sm:max-w-[12rem]`}
              type="password"
              placeholder="Jeton admin"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              aria-label="Jeton administrateur"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !url}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#0066cc] px-8 py-4 text-[16px] font-bold text-white shadow-md transition-all hover:bg-[#0071e3] focus:ring-4 focus:ring-blue-200 focus:outline-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
            Analyser la vidéo
          </button>
          {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-slate-800">Vidéos analysées</h2>
        {debates === null ? (
          <LoaderCircle className="h-5 w-5 animate-spin text-blue-600" />
        ) : debates.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune vidéo analysée pour l’instant.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {debates.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onOpen(d.id)}
                  className="group flex h-full w-full flex-col gap-2 rounded-3xl border border-slate-200/60 bg-white p-6 text-left shadow-sm transition-colors hover:border-blue-200"
                >
                  <span className="text-[10px] font-bold tracking-[0.2em] text-blue-600 uppercase">
                    {KIND_LABELS[d.kind].singular} · {d.complete ? `${d.promiseCount} promesses` : 'analyse en cours'}
                  </span>
                  <span className="font-bold text-slate-900 group-hover:text-blue-700">{d.title ?? d.id}</span>
                  <span className="text-xs text-slate-500">{d.speakers.join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
