# Repères visuels

Relevés dans le CSS et le bundle JS de parolesparoles.com (8 octobre 2026), et appliqués tels quels.
Aucun thème Tailwind personnalisé : palette par défaut + quelques valeurs arbitraires.

## Base

| Élément | Classes du site |
|---|---|
| Fond de page | `bg-[#F5F5F7] text-slate-900 font-sans selection:bg-blue-200` |
| Police | pile système de Tailwind (`ui-sans-serif, system-ui…`) |
| En-tête | `bg-white`, conteneur `max-w-[1920px] px-4 sm:px-6 lg:px-8 xl:px-12 py-4` |
| Logo | `bg-blue-600 p-2 rounded-xl shadow-sm` + icône loupe blanche ; titre `text-xl sm:text-2xl font-semibold tracking-tight` |
| Onglets | `bg-slate-100 p-1 rounded-xl` ; onglet actif `bg-white text-blue-600 shadow-sm`, `text-xs font-bold uppercase tracking-wider` |
| Contenu | `max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8` |
| Carte | `bg-white rounded-3xl shadow-sm border border-slate-200/60 p-6 sm:p-10` ; cartes de résultat `rounded-[2.5rem]` |
| Titre de carte | `text-xl font-semibold tracking-tight text-slate-800` |
| Surtitre | `text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em]` |
| Champ | `rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-2xs focus:ring-2` |
| Bouton principal | `rounded-2xl py-4 px-8 text-[16px] font-bold text-white bg-[#0066cc] hover:bg-[#0071e3] shadow-md active:scale-[0.98]` |
| Bouton secondaire | `bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl` |
| Pastille d'action | `rounded-full bg-indigo-50 border-indigo-100 text-indigo-700` (« Suggérer une idée ») |

## Scores (identiques à l'analyseur)

| Tranche | Seuil | Couleur | Badge |
|---|---|---|---|
| Réaliste | `>= 7` | `#34c759` | `bg-[#34c759]/10 text-[#248a3d] border-[#34c759]/30` |
| Incertaine | `>= 4` | `#ff9500` | `bg-[#ff9500]/10 text-[#b26600] border-[#ff9500]/30` |
| Peu réaliste | `< 4` | `#ff3b30` | `bg-[#ff3b30]/10 text-[#d70015] border-[#ff3b30]/30` |

Barres de catégories : `from-emerald-400 to-emerald-500` pour la tranche verte (relevé) ; ambre et rose
par analogie pour les deux autres. Libellés repris du site : « Juridique & Textes », « Budget & Économie »,
« Opérationnel & Délais ». Blocs « Atouts & Leviers » (emerald), « Défis & Limites » (rose),
« Solutions Alternatives » (blue).

## Spécifique au module

- **Format** : sélecteur « Détection auto / Débat / Discours » avec les mêmes pastilles que la navigation.
- **Couloirs de la timeline** : teintes neutres (`indigo-200`, `sky-200`…), jamais de couleur partisane.
  La couleur porte uniquement le score de la promesse.
- **Promesse vague** : pastille creuse (bordure de la couleur du score, fond blanc).
- **Non évaluée** : pastille `slate-300`.
- **Tête de lecture** : trait `blue-600/70` synchronisé avec le lecteur YouTube.
- **Lecteur** : `youtube-nocookie.com`, coins `rounded-3xl`.
- **Mini-vidéo flottante** (`FloatingPlayer`) : quand le lecteur sort de l'écran, il devient une carte blanche
  `rounded-2xl shadow-xl` en bas à droite (22rem, 62vw sur mobile), déplaçable par sa barre ; boutons « revenir à
  la vidéo » et « masquer » (met en pause). Un clic sur une promesse la réaffiche. Position mémorisée (localStorage).
  Le lecteur n'est jamais déplacé dans le DOM : seul son positionnement CSS change, la lecture continue.
