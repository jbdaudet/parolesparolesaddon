import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DebateAnalysis, DebateListItem } from '../../shared/debate-types';

/**
 * Persistance des analyses. `FileDebateStore` écrit un fichier JSON par débat ;
 * lors de la fusion, implémenter la même interface sur Firestore via le SDK
 * Admin, côté serveur uniquement (voir docs/INTEGRATION.md, § Sécurité).
 */
export interface DebateStore {
  get(id: string): Promise<DebateAnalysis | null>;
  save(analysis: DebateAnalysis): Promise<void>;
  list(): Promise<DebateListItem[]>;
}

/** Met à niveau une analyse enregistrée par une version antérieure du module. */
export function upgradeAnalysis(a: DebateAnalysis): DebateAnalysis {
  a.kind ??= 'debate'; // champ ajouté avec la prise en charge des discours
  a.checkpoints ??= { transcribedWindowStarts: [] };
  return a;
}

export function toListItem(a: DebateAnalysis): DebateListItem {
  return {
    id: a.id,
    kind: a.kind,
    title: a.video.title,
    speakers: a.speakers.filter((s) => s.role === 'candidate').map((s) => s.name),
    promiseCount: a.promises.length,
    complete: a.completedSteps.includes('summarize'),
    updatedAt: a.updatedAt,
  };
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export class FileDebateStore implements DebateStore {
  constructor(private dir: string) {}

  private file(id: string) {
    if (!SAFE_ID.test(id)) throw new Error(`Identifiant invalide : ${id}`);
    return path.join(this.dir, `${id}.json`);
  }

  async get(id: string): Promise<DebateAnalysis | null> {
    try {
      return upgradeAnalysis(JSON.parse(await readFile(this.file(id), 'utf8')) as DebateAnalysis);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async save(analysis: DebateAnalysis): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const target = this.file(analysis.id);
    // Écriture atomique : un arrêt brutal ne laisse jamais un fichier tronqué.
    const tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(analysis, null, 2));
    await rename(tmp, target);
  }

  async list(): Promise<DebateListItem[]> {
    let files: string[];
    try {
      files = (await readdir(this.dir)).filter((f) => f.endsWith('.json'));
    } catch {
      return [];
    }
    const items = await Promise.all(files.map((f) => this.get(f.slice(0, -5))));
    return items
      .filter((a): a is DebateAnalysis => a !== null)
      .map(toListItem)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}
