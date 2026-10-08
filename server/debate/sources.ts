import type { Source } from '../../shared/debate-types';

/**
 * Listes reprises telles quelles du site en production (fonction de validation du
 * cache). En cas de fusion, utiliser directement les constantes du site.
 */
export const OFFICIAL_SOURCE_DOMAINS = [
  'gouv.fr',
  'europa.eu',
  'insee.fr',
  'ccomptes.fr',
  'conseil-constitutionnel.fr',
  'conseil-etat.fr',
  'courdecassation.fr',
  'assemblee-nationale.fr',
  'senat.fr',
  'banque-france.fr',
  'oecd.org',
  'ocde.org',
  'fipeco.fr',
  'vie-publique.fr',
  'ladocumentationfrancaise.fr',
  'securite-sociale.fr',
  'unedic.org',
  'ameli.fr',
  'cnil.fr',
  'arcom.fr',
  'cre.fr',
  'rte-france.com',
  'ademe.fr',
  'ofce.sciences-po.fr',
  'drees.solidarites-sante.gouv.fr',
  'dares.travail-emploi.gouv.fr',
  'budget.gouv.fr',
];

export const BLOCKED_SOURCE_DOMAINS = [
  'twitter.com',
  'x.com',
  't.co',
  'facebook.com',
  'fb.com',
  'tiktok.com',
  'instagram.com',
  'reddit.com',
  'youtube.com',
  'youtu.be',
  'linkedin.com',
];

const matches = (host: string, domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));

export function isOfficialSource(uri: string): boolean {
  try {
    const host = new URL(uri).hostname.toLowerCase();
    return !matches(host, BLOCKED_SOURCE_DOMAINS) && matches(host, OFFICIAL_SOURCE_DOMAINS);
  } catch {
    return false;
  }
}

/** Garde les sources officielles, sans doublon d'URL. */
export function filterOfficialSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (!isOfficialSource(s.uri) || seen.has(s.uri)) return false;
    seen.add(s.uri);
    return true;
  });
}
