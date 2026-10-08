/**
 * Analyse un débat ou un discours en ligne de commande, sans interface :
 *
 *   npm run analyze -- "https://www.youtube.com/watch?v=XXXXXXXXXXX" ["Nom 1" "Nom 2"] [--debat|--discours] [--force]
 *
 * Sans --debat ni --discours, le format est détecté automatiquement.
 *
 * Le résultat est écrit dans data/debates/<videoId>.json (relancer reprend où on s'était arrêté).
 */
import { STEP_LABELS } from '../shared/debate-types';
import { createDebateModule, parseYouTubeId, runPipeline } from '../server/debate';
import { formatTimestamp } from '../server/debate/time';

// Charge les secrets locaux si le terminal ne l'a pas fait (ex. ouvert avant l'ajout d'une clé).
// Les variables déjà définies dans l'environnement restent prioritaires.
for (const file of ['local-secrets.env', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // fichier absent : rien à charger
  }
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const kind = args.includes('--discours') ? 'speech' : args.includes('--debat') ? 'debate' : undefined;
const [url, ...speakerHints] = args.filter((a) => !a.startsWith('--'));
const videoId = url ? parseYouTubeId(url) : null;

if (!videoId) {
  console.error('Usage : npm run analyze -- <url YouTube> ["Nom 1" "Nom 2"] [--debat|--discours] [--force]');
  process.exit(1);
}

const { llm, evaluator, store, config } = createDebateModule();
let lastLine = '';

const analysis = await runPipeline(
  { llm, evaluator, store, config },
  {
    videoId,
    kind,
    speakerHints,
    force,
    onProgress: (step, done, total, message) => {
      const line = `${STEP_LABELS[step]} — ${done}/${total}${message ? ` — ${message.slice(0, 80)}` : ''}`;
      if (line !== lastLine) console.log((lastLine = line));
    },
  },
);

const name = new Map(analysis.speakers.map((s) => [s.id, s.name]));
console.log(`\n${analysis.video.title ?? videoId} — ${formatTimestamp(analysis.video.durationSec)}`);
for (const r of analysis.reports) {
  const s = r.stats;
  console.log(
    `  ${name.get(r.speakerId)} : ${s.promiseCount} promesses, moyenne ${s.averageScore ?? '—'}/10 ` +
      `(${s.bands.good} réalistes, ${s.bands.mid} incertaines, ${s.bands.bad} peu réalistes)`,
  );
}
if (analysis.warnings.length) console.log(`\n${analysis.warnings.length} avertissement(s), voir le fichier JSON.`);
console.log(`\nRésultat : ${config.dataDir}/${videoId}.json`);
