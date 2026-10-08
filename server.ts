/**
 * Serveur de développement autonome du module « Vidéos » : Express + Vite en middleware, sur le modèle
 * des applications générées par Google AI Studio (comme parolesparoles.com).
 * Lors de la fusion, seul le montage de la route /api/debates est à reprendre.
 */
import express from 'express';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DebateAnalysis } from './shared/debate-types';
import { createDebateModule, type LlmClient } from './server/debate';
import { upgradeAnalysis } from './server/debate/store';

// Charge les secrets locaux si le terminal ne l'a pas fait (ex. ouvert avant l'ajout d'une clé).
// Les variables déjà définies dans l'environnement restent prioritaires.
for (const file of ['local-secrets.env', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // fichier absent : rien à charger
  }
}

const PORT = Number(process.env.PORT ?? 3000);
const isProd = process.env.NODE_ENV === 'production';

// Analyses fictives (fixtures/*.json) : consultables sans clé API.
const demos = await Promise.all(
  (await readdir('fixtures'))
    .filter((f) => f.endsWith('.json'))
    .map(async (f) => upgradeAnalysis(JSON.parse(await readFile(path.join('fixtures', f), 'utf8')) as DebateAnalysis)),
);

// Sans clé, le serveur démarre quand même : la démo reste consultable, seuls les lancements échouent.
const missingKey: LlmClient = {
  generateJson: () => Promise.reject(new Error('GEMINI_API_KEY manquante : impossible de lancer une analyse.')),
};
if (!process.env.GEMINI_API_KEY) console.warn('⚠ GEMINI_API_KEY absente : mode démonstration uniquement.');

const debate = createDebateModule({ demos, ...(process.env.GEMINI_API_KEY ? {} : { llm: missingKey }) });
if (!debate.config.adminToken)
  console.warn('⚠ DEBATE_ADMIN_TOKEN absent : tout visiteur peut lancer une analyse (payante).');

const app = express();
app.set('trust proxy', true);
app.use('/api/debates', express.json({ limit: '10kb' }), debate.router);

if (isProd) {
  app.use(express.static(path.resolve('dist')));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(PORT, () => console.log(`Module Débat : http://localhost:${PORT}`));
