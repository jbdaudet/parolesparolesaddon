const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Extrait l'identifiant d'une URL YouTube (watch, youtu.be, shorts, live, embed). null si invalide. */
export function parseYouTubeId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = /^\/(?:shorts|live|embed|v)\/([^/?#]+)/.exec(url.pathname);
      id = m?.[1] ?? null;
    }
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

export const canonicalYouTubeUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

/** Titre et chaîne via l'oEmbed public de YouTube (sans clé). Ne lève jamais. */
export async function fetchYouTubeMeta(videoId: string): Promise<{ title?: string; channel?: string }> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonicalYouTubeUrl(videoId))}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return {};
    const json = (await res.json()) as { title?: string; author_name?: string };
    return { title: json.title, channel: json.author_name };
  } catch {
    return {};
  }
}
