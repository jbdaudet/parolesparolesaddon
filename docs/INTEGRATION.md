# Intégrer le module « Vidéos » dans parolesparoles.com

Ce document s'adresse à **l'agent IA (ou au développeur) qui fusionnera ce dépôt avec le code de
parolesparoles.com**. Il dit ce qu'il faut copier, ce qu'il faut adapter, et ce qu'il faut vérifier.

> Ce module a été développé **sans accès au code source du site**. Tout ce qui le concerne a été relevé
> depuis le site en production (HTML, bundle JS/CSS, en-têtes HTTP) le 8 octobre 2026. Les points
> marqués **[à vérifier]** doivent être confirmés dans le vrai code avant d'adapter quoi que ce soit.

---

## 1. Ce que fait le module

À partir d'une URL YouTube de **débat** ou de **discours de campagne** :

1. repère le format (débat ou discours, détecté automatiquement ou imposé) et les participants
   (orateurs politiques, modérateurs, autres intervenants) ;
2. transcrit tout le débat en identifiant qui parle ;
3. découpe le débat en séquences thématiques ;
4. extrait les promesses de chaque orateur politique (citation exacte + horodatage) ;
5. évalue chaque promesse **au même format que l'analyseur du site** ;
6. rédige un bilan neutre par orateur politique.

L'interface affiche la vidéo, une **timeline** (un couloir par orateur politique ; pour un débat à deux,
les thèmes sont au milieu, « de part et d'autre » ; pour un discours, un seul couloir sous les thèmes ;
pastilles colorées selon le score), le détail de chaque promesse et le ou les bilans.

Nom affiché : **« Vidéos »** (onglet, titres). Dans le code, tout porte le nom `debate` (routes
`/api/debates`, types `DebateAnalysis`…), historique du premier cas traité ; le champ
`kind: 'debate' | 'speech'` distingue les deux formats. Le discours est un cas particulier du débat
(un seul orateur politique) : aucun chemin de code séparé.

Détails techniques : [ARCHITECTURE.md](ARCHITECTURE.md). Repères visuels : [DESIGN.md](DESIGN.md).

## 2. Ce qui a été relevé sur le site (hypothèses de compatibilité)

| Élément | Constaté en production | Utilisé ici |
|---|---|---|
| Framework | React 19.2.4 (SPA Vite, généré par Google AI Studio) | React 19.2.4 |
| CSS | Tailwind CSS 4.2.2, palette par défaut, police système | Tailwind 4.2.2, mêmes classes |
| Icônes / animations | lucide-react, motion | lucide-react 0.577, motion 12 |
| Routage | react-router | react-router 7 (dans la coquille de démo uniquement) |
| Markdown | react-markdown | react-markdown 10 |
| Serveur | Express (`x-powered-by`) sur Google Cloud (`server: Google Frontend`) | Express 5 |
| IA | Gemini, appelé côté serveur via `POST /api/analyze` | `@google/genai` 2.24, API Interactions **[à vérifier : version et API du site]** |
| Données | Firebase / Firestore, écrit **depuis le navigateur** (collections `analyses`, `suggestions`) | Stockage côté serveur uniquement (voir § 5) |

### Format de résultat de l'analyseur (reproduit à l'identique)

Relevé dans le composant de résultat du bundle. Défini dans `shared/debate-types.ts` (`AnalysisData`, `Source`) :

```ts
{
  score: number;                 // 0–10 (le site lit aussi `feasibilityScore` en repli)
  verdict: string;
  categoryScores: { legal: number; budget: number; operational: number };
  strengths: string[];
  weaknesses: string[];
  alternatives: { text: string; explanation: string; impact: string }[];
  chartData?: { title?: string; yAxisLabel?: string; data: { name: string; [serie: string]: string | number }[] };
  markdownReport: string;
}
// + sources: { uri: string; title?: string }[] filtrées par la liste blanche du site
```

Seuils de couleur du site : `>= 7` vert `#34c759`, `>= 4` orange `#ff9500`, sinon rouge `#ff3b30`.

**[à vérifier]** la forme exacte de `chartData.data` : ici chaque point vaut `{ name, value }`.

## 3. Carte des fichiers

| Chemin | Rôle | À la fusion |
|---|---|---|
| `shared/debate-types.ts` | Contrat de données serveur ↔ client | **Copier** |
| `shared/time-format.ts` | Formatage des horodatages | **Copier** |
| `server/debate/` | Module serveur complet (pipeline, routes, stockage) | **Copier**, puis adapter `gemini.ts`, l'évaluateur et le stockage |
| `src/debate/` | Composants React du module | **Copier**, puis brancher sur le routeur et les composants du site |
| `server.ts` | Serveur de démo (Express + Vite) | Ne pas copier ; reprendre seulement le montage de la route |
| `src/App.tsx`, `src/main.tsx`, `index.html` | Coquille de démo (en-tête recopié du site) | Ne pas copier |
| `scripts/analyze-debate.ts` | Analyse en ligne de commande | Facultatif (pratique pour pré-calculer des débats) |
| `fixtures/*.json` | Débat et discours **fictifs** pour la démo | Ne pas copier en production |
| `tests/` | Tests Vitest (pipeline complet avec faux Gemini, API HTTP) | Copier si le site a des tests |

## 4. Étapes de fusion

### 4.1 Copier et installer

```bash
cp -r shared/debate-types.ts shared/time-format.ts <site>/shared/   # ou l'équivalent dans le site
cp -r server/debate <site>/server/
cp -r src/debate <site>/src/
```

Ajuster les chemins d'import relatifs (`../../shared/...`) si l'arborescence diffère.
Dépendances éventuellement manquantes : `@google/genai` (≥ 2.x), `react-markdown`, `lucide-react`, `motion`.

### 4.2 Client Gemini — un seul fichier à adapter si besoin

Tout l'accès au modèle passe par `server/debate/gemini.ts` (interface `LlmClient`, méthode unique `generateJson`).
Le reste du module ne connaît pas le SDK.

- Si le site utilise déjà `@google/genai` ≥ 2.x : rien à faire.
- S'il utilise `ai.models.generateContent` (API historique), réécrire uniquement `GeminiClient.generateJson`.
  Correspondance **[à vérifier sur la doc du SDK du site]** :

| Ici (API Interactions) | API `generateContent` |
|---|---|
| `{ type: 'video', uri }` | `{ fileData: { fileUri: uri } }` |
| `processing: { start_offset: '600s', end_offset: '1200s', fps }` | `videoMetadata: { startOffset: '600s', endOffset: '1200s', fps }` |
| `resolution: 'low'` | `config.mediaResolution: MEDIA_RESOLUTION_LOW` |
| `response_format: { type: 'text', mime_type: 'application/json', schema }` | `config.responseMimeType` + `config.responseJsonSchema` |
| `tools: [{ type: 'google_search' }]` | `config.tools: [{ googleSearch: {} }]` |
| citations `url_citation` dans `steps[].content[].annotations` | `candidates[0].groundingMetadata.groundingChunks[].web` |
| `generation_config.thinking_level` | `config.thinkingConfig.thinkingLevel` |

### 4.3 Monter la route serveur

```ts
import { createDebateModule } from './server/debate';

const debate = createDebateModule({
  evaluator: siteEvaluator,   // § 4.4
  store: firestoreDebateStore // § 4.5
});
app.use('/api/debates', express.json({ limit: '10kb' }), debate.router);
```

Variables d'environnement : voir `.env.example`. **Définir `DEBATE_ADMIN_TOKEN`** en production :
une analyse de vidéo coûte bien plus qu'une analyse de promesse (voir ARCHITECTURE.md § Coûts).

### 4.4 Réutiliser l'analyseur du site (recommandé)

Ce dépôt contient un évaluateur autonome (`GeminiPromiseEvaluator`) qui imite l'analyseur du site.
Une fois fusionné, il est préférable d'évaluer chaque promesse **avec l'analyseur existant**, pour
garantir la même méthode, les mêmes prompts et le même cache. Écrire un adaptateur :

```ts
import type { PromiseEvaluator } from './server/debate';

export const siteEvaluator: PromiseEvaluator = {
  id: 'parolesparoles-analyze',
  async evaluate({ statement }) {
    // Appeler la fonction serveur derrière POST /api/analyze (pas la route HTTP elle-même).
    const { data, sources } = await analyzePromise(statement); // [à vérifier : nom réel]
    return { data, sources, evaluatedAt: new Date().toISOString(), evaluator: 'parolesparoles-analyze' };
  },
};
```

- `statement` est une reformulation autonome de la promesse, rédigée comme ce qu'un visiteur taperait
  dans l'analyseur. La citation exacte et le nom du débatteur sont aussi fournis (`quote`, `speakerName`)
  mais ne devraient pas influencer l'évaluation.
- Pour profiter du cache existant, appliquer la même normalisation que le site sur la clé de recherche
  (fonction relevée : minuscules, suppression de la ponctuation hors lettres accentuées, `trim`).

### 4.5 Stockage : Firestore, mais côté serveur

`DebateStore` (`get`, `save`, `list`) est implémenté ici sur fichiers JSON. En production, l'implémenter
sur Firestore **avec le SDK Admin**, côté serveur :

```ts
import { getFirestore } from 'firebase-admin/firestore';
import { toListItem, type DebateStore } from './server/debate/store';

const col = getFirestore().collection('debates');
export const firestoreDebateStore: DebateStore = {
  async get(id) { const d = await col.doc(id).get(); return d.exists ? (d.data() as any) : null; },
  async save(a) { await col.doc(a.id).set(a); },
  async list() { const s = await col.orderBy('updatedAt', 'desc').limit(50).get(); return s.docs.map((d) => toListItem(d.data() as any)); },
};
```

Règles Firestore associées : `allow read: if true; allow write: if false;` sur `debates/{id}`.

> Un document Firestore est limité à 1 Mio. La transcription d'un débat de 3 h fait environ 200 à 300 Ko de
> JSON : ça passe, mais pour des débats plus longs, déplacer `transcript` dans une sous-collection.

### 4.6 Intégrer l'interface

- **Routes** : ajouter `/videos` (liste des vidéos analysées) → `<DebateHome onOpen={(id) => navigate(`/video/${id}`)} />` et
  `/video/:id` → `<DebatePage id={id} />`. Les composants n'importent pas le routeur.
- **Navigation** : ajouter un onglet « Vidéos » dans la `nav` de l'en-tête (pastilles « Analyseur / Le Projet »).
- **Composants de score** : `src/debate/components/ScoreRing.tsx` et `CategoryBars.tsx` recopient le rendu
  des composants du site. Les remplacer par les composants existants (mêmes données en entrée).
- **Détail d'une promesse** : la partie « évaluation » de `PromiseDetail.tsx` peut être remplacée par le
  composant de résultat de l'analyseur, qui consomme le même `AnalysisData`.
- **Formulaire de lancement** : en production, le réserver à un écran d'administration (le champ « Jeton admin »
  de `DebateHome` envoie l'en-tête `x-admin-token`). Le public consulte les débats déjà analysés.
- **SEO** : comme pour `/analyse/:id`, injecter côté serveur titre, description et canonique de `/video/:id`,
  et ajouter les débats au `sitemap.xml`.

### 4.7 Traitement long sur Cloud Run

Une analyse dure plusieurs minutes et tourne **après** la réponse HTTP (`DebateJobs`, en mémoire).
Sur Cloud Run en facturation à la requête, le CPU est fortement réduit hors requête : le traitement
ralentirait ou s'arrêterait. Options, de la plus simple à la plus robuste :

1. instance avec « CPU toujours alloué » (facturation à l'instance) et `min-instances=1` ;
2. lancer `scripts/analyze-debate.ts` en **Cloud Run Job** et ne garder dans le site que la lecture ;
3. Cloud Tasks qui rappelle le serveur étape par étape.

Le pipeline enregistre chaque étape : relancer la même URL **reprend** là où le traitement s'était arrêté.

## 5. Sécurité : à traiter avant ou pendant la fusion

Constaté sur le site en production (signalé à part au propriétaire) :

- le navigateur **écrit et supprime** directement des documents Firestore `analyses`, qui sont ensuite
  montrés à tous les visiteurs. N'importe qui peut donc publier une fausse analyse. Le module Débats
  n'écrit **que côté serveur** ; ne pas reproduire le schéma existant pour les débats ;
- la clé Firebase du bundle appartient au projet Google Cloud créé par AI Studio pour Gemini : vérifier
  qu'elle est restreinte aux API Firebase ;
- Google Analytics se charge avant le consentement : si les pages Débats ajoutent des événements, les
  conditionner au consentement.

Côté module : jeton admin pour lancer une analyse, limite de 5 lancements/heure/IP sans jeton, URL
validée (YouTube uniquement), corps JSON limité à 10 Ko, identifiants de fichiers contrôlés.

## 6. Contrôles après fusion

- [ ] `npm test` passe (copier `tests/` et adapter les imports).
- [ ] Les deux démonstrations s'affichent (`fixtures/*.json`, servies sous `/api/debates/demo` et `/api/debates/demo-discours`), puis les retirer.
- [ ] Un vrai discours court s'analyse de bout en bout et est bien détecté comme `speech`.
- [ ] Un vrai débat court (10–20 min) s'analyse de bout en bout ; vérifier à la main 5 citations
      en cliquant sur leur horodatage (bon orateur, bon instant, mots exacts).
- [ ] Les évaluations passent bien par l'analyseur du site (`evaluator: 'parolesparoles-analyze'` dans le JSON).
- [ ] Les écritures Firestore des débats sont refusées depuis le navigateur.
- [ ] `DEBATE_ADMIN_TOKEN` est défini en production.

## 7. Consigne suggérée pour l'agent qui fusionne

> Intègre le module « Vidéos » du dépôt `parolesparolesaddon` dans ce projet en suivant
> `docs/INTEGRATION.md`. Commence par vérifier les points marqués [à vérifier] dans notre code
> (version du SDK Gemini, fonction derrière /api/analyze, composants de score, routeur). Copie
> `shared/`, `server/debate/` et `src/debate/` ; branche l'évaluateur sur notre analyseur (§ 4.4) et le
> stockage sur Firestore côté serveur (§ 4.5) ; ajoute les routes et l'onglet « Vidéos » (§ 4.6).
> Ne modifie pas le comportement de l'analyseur existant. Termine par la liste de contrôle du § 6.
