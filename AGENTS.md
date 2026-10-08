# Consignes pour les agents IA

Ce dépôt est le module « Vidéos » de parolesparoles.com : analyse de vidéos YouTube
(débats et discours de campagne), extraction et évaluation des promesses, timeline visuelle.

**Si ta tâche est de fusionner ce module dans le site, lis d'abord [docs/INTEGRATION.md](docs/INTEGRATION.md)
et suis-le.** Il liste les fichiers à copier, les trois points d'adaptation (client Gemini, évaluateur,
stockage) et les contrôles finaux.

## Repères

- Contrat de données unique : `shared/debate-types.ts`. Toute évolution du format passe par là,
  avec une mise à niveau dans `upgradeAnalysis` (`server/debate/store.ts`) pour les analyses déjà enregistrées.
- Accès au modèle : uniquement via l'interface `LlmClient` (`server/debate/gemini.ts`). Les étapes ne
  connaissent pas le SDK.
- Identifiants de modèles et réglages : uniquement dans `server/debate/config.ts`.
- Évaluation : interface `PromiseEvaluator` (`server/debate/steps/evaluate.ts`).
- Stockage : interface `DebateStore` (`server/debate/store.ts`), **côté serveur uniquement**.
- Le code dit `debate` partout ; `kind: 'debate' | 'speech'` distingue débat et discours.

## Règles

- Textes visibles et prompts **en français**, ton neutre. Ne jamais désigner de « gagnant ».
- L'orateur d'une promesse vient **toujours** du segment de transcription cité, jamais d'une affirmation du modèle.
- Garder l'apparence du site : classes de [docs/DESIGN.md](docs/DESIGN.md), pas de couleur partisane.
- Ne pas écrire dans la base depuis le navigateur.
- Avant de terminer : `npm run typecheck` et `npm test` doivent passer ; formater avec Prettier (`.prettierrc`).
- Les fichiers de `fixtures/` sont **fictifs** (personnages inventés) : ne jamais y mettre de vraies personnes.
