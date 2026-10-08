# Paroles ? Paroles ! — module « Vidéos »

Extension de [parolesparoles.com](https://www.parolesparoles.com) : à partir d'une vidéo YouTube de
**débat** ou de **discours de campagne**, le module

1. transcrit la vidéo et identifie qui parle ;
2. découpe la prise de parole en thèmes ;
3. extrait les promesses de chaque orateur politique, avec la citation exacte et son horodatage ;
4. évalue chaque promesse avec la même grille que l'analyseur du site (juridique, budget, mise en œuvre) ;
5. affiche le tout sur une **timeline** synchronisée avec la vidéo, puis un **bilan** neutre par orateur.

Ce dépôt est un **module autonome**, conçu pour être fusionné dans le code du site.
→ Guide de fusion : **[docs/INTEGRATION.md](docs/INTEGRATION.md)**

| Document | Contenu |
|---|---|
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | Fusion dans parolesparoles.com : quoi copier, quoi adapter, contrôles |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Pipeline, modèle de données, API, coûts, limites connues |
| [docs/DESIGN.md](docs/DESIGN.md) | Repères visuels relevés sur le site |
| [AGENTS.md](AGENTS.md) | Consignes pour les agents IA qui travaillent sur ce dépôt |

## Démarrer

Prérequis : Node.js 22 (fourni par le dev container).

```bash
npm install
npm run dev          # http://localhost:3000
```

Sans clé Gemini, le serveur démarre en **mode démonstration** : un débat et un discours **fictifs**
(`fixtures/`) sont consultables, et les lancements d'analyse échouent avec un message clair.

Pour analyser de vraies vidéos, définir `GEMINI_API_KEY` (et `DEBATE_ADMIN_TOKEN` dès que le serveur
est accessible à d'autres). Toutes les variables sont listées dans [.env.example](.env.example).

### Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement (Express + Vite) |
| `npm test` | Tests Vitest (pipeline complet avec un faux Gemini, API HTTP) |
| `npm run typecheck` | Vérification TypeScript |
| `npm run build` / `npm start` | Build de production / serveur de production |
| `npm run analyze -- <url> ["Nom 1" "Nom 2"] [--debat\|--discours]` | Analyse en ligne de commande, résultat dans `data/debates/` |

## Dev container

Le conteneur ([`.devcontainer/`](.devcontainer/)) est basé sur le modèle
[`template-container`](https://github.com/jbdaudet/template-container) : Debian 12, Python 3.12, et
Node.js 22 ajouté pour ce projet.

Les secrets viennent de `~/secrets/local-secrets.env` sur la machine hôte, monté en lecture seule
dans le conteneur et chargé dans chaque terminal. Pour activer les analyses réelles, y ajouter :

```bash
GEMINI_API_KEY=...
DEBATE_ADMIN_TOKEN=...   # facultatif en local
```

puis reconstruire ou rouvrir le conteneur. Ce fichier ne doit jamais être commité.

## État

Prototype fonctionnel : interface complète, pipeline testé de bout en bout avec un faux modèle.
**Pas encore validé contre l'API Gemini réelle** (aucune clé disponible pendant le développement) :
voir [docs/ARCHITECTURE.md § Limites connues](docs/ARCHITECTURE.md#limites-connues-et-points-à-valider-sur-de-vrais-débats).
