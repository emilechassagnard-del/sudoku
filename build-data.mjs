// Produit les deux fichiers de données livrés avec le site :
//
//   puzzles.json   le stock de grilles, prêtes à jouer sans attente
//   examples.json  de vraies positions illustrant chaque technique
//
// Usage : node build-data.mjs [grilles par niveau] [exemples par technique]

import { writeFileSync } from "node:fs";
import {
  Board,
  Geometry,
  COST,
  DISPLAY_NAME,
  DIFFICULTIES,
  TECHNIQUES,
  countBits,
  generate,
  makeRandom,
  nextStep,
  finderFor,
} from "./engine.js";

const perLevel = Number(process.argv[2] ?? 60);
const perTechnique = Number(process.argv[3] ?? 3);

// MARK: - Stock de grilles

console.log(`Génération de ${perLevel} grilles par niveau…\n`);

const rand = makeRandom(20260818);
const records = [];
const puzzles = [];

for (const level of DIFFICULTIES) {
  const started = Date.now();
  let produced = 0;
  for (let i = 0; i < perLevel; i++) {
    const g = generate(level, rand, 600);
    if (!g) break;
    produced++;
    puzzles.push(g.puzzle);
    records.push({
      puzzle: g.puzzle.compact,
      solution: g.solution.compact,
      difficulty: DIFFICULTIES.indexOf(level),
      clues: g.puzzle.values.filter((v) => v !== 0).length,
      steps: g.report.steps.length,
      techniques: g.report.techniqueCounts,
    });
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`  ${level.padEnd(12)} ${String(produced).padStart(4)} grilles  (${seconds} s)`);
}

writeFileSync("puzzles.json", JSON.stringify(records));
console.log(`\n${records.length} grilles écrites dans puzzles.json\n`);

// MARK: - Exemples pédagogiques
//
// Les exemples ne sont pas dessinés à la main : ils sont extraits de vraies
// grilles, à l'instant précis où le moteur y reconnaît le motif. Le joueur
// apprend donc à repérer ce qu'il verra vraiment, et non un schéma de manuel
// épuré qui n'apparaît jamais en partie.

const SUBSET_SIZE = {
  nakedPair: 2,
  hiddenPair: 2,
  nakedTriple: 3,
  hiddenTriple: 3,
  nakedQuad: 4,
  hiddenQuad: 4,
};

/**
 * Écarte les positions où le motif est vrai mais creux.
 *
 * Un quadruplet nu dans une unité qui ne compte que cinq cases vides est exact,
 * et parfaitement inutile : la cinquième case est alors un singleton nu, que
 * n'importe qui voit en une seconde. Montrer ça comme exemple de quadruplet
 * apprendrait au joueur à sortir un marteau pour une punaise.
 */
function isSubstantial(board, deduction) {
  const size = SUBSET_SIZE[deduction.technique];
  if (!size) return true;
  const unit = deduction.units[0];
  if (unit === undefined) return true;
  return board.unsolvedIn(unit).length >= size + 3;
}

/**
 * Ce qui rend un exemple lisible.
 *
 * Le nombre de candidats affichés compte, mais pas dans le sens qu'on croit :
 * une grille surchargée noie le motif, une grille presque terminée le rend
 * trivial. Le bon moment est au milieu, et c'est de cette cible qu'on mesure
 * l'écart. Un motif dont les cases sont proches se repère mieux qu'un motif
 * étalé aux quatre coins ; un motif qui tranche plusieurs cases montre mieux à
 * quoi sert la technique.
 */
function legibility(board, deduction) {
  let load = 0;
  for (let c = 0; c < 81; c++) {
    if (board.values[c] === 0) load += countBits(board.candidates[c]);
  }
  const distance = Math.abs(load - 110);

  const cells = deduction.highlights.map((h) => h.cell);
  const rows = cells.map((c) => Math.floor(c / 9));
  const cols = cells.map((c) => c % 9);
  const spread =
    Math.max(...rows) - Math.min(...rows) + (Math.max(...cols) - Math.min(...cols));

  const reach = deduction.actions.length;
  return distance + spread * 3 - reach * 8;
}

const byTechnique = {};
let rejected = 0;

function record(board, deduction) {
  if (!isSubstantial(board, deduction)) {
    rejected++;
    return;
  }
  const entry = {
    record: {
      technique: deduction.technique,
      values: board.compact,
      candidates: [...board.candidates],
      marks: deduction.highlights.map((h) => ({
        cell: h.cell,
        digits: h.digits,
        role: h.role,
      })),
      units: deduction.units,
      explanation: deduction.explanation,
    },
    score: legibility(board, deduction),
  };
  (byTechnique[deduction.technique] ??= []).push(entry);
}

// Premier passage : le déroulé normal. On capture la position AVANT d'appliquer
// la déduction, puisque c'est celle où le joueur doit reconnaître le motif.
const visited = [];

for (const puzzle of puzzles) {
  const current = puzzle.clone();
  while (!current.isSolved) {
    const deduction = nextStep(current);
    if (!deduction) break;
    record(current, deduction);
    visited.push(current.clone());
    current.apply(deduction);
    if (current.hasContradiction) break;
  }
}

// Second passage, pour les motifs que le premier atteint mal.
//
// nextStep rend toujours le raisonnement le plus simple disponible — c'est ce
// qui fait de bons indices, mais cela masque les techniques coûteuses : un
// triplet caché est presque toujours doublé par un motif plus élémentaire
// ailleurs, et le moteur prend l'autre. On repasse donc sur les mêmes positions
// avec un chercheur isolé. Ce qu'il trouve existe bel et bien dans la grille ;
// simplement, la technique n'y était pas indispensable.
//
// Le seuil est le quota, et non zéro : une technique vue une seule fois
// n'offre aucun choix, et le seul exemple disponible est rarement le plus clair.
const orphans = TECHNIQUES.filter((t) => (byTechnique[t] ?? []).length < perTechnique);

if (orphans.length > 0) {
  console.log(`Recherche ciblée pour : ${orphans.map((t) => DISPLAY_NAME[t]).join(", ")}\n`);
  for (const technique of orphans) {
    const finder = finderFor(technique);
    if (!finder) continue;
    for (const board of visited) {
      const deduction = finder.find(board);
      if (deduction) record(board, deduction);
    }
  }
}

// MARK: - Sélection

const selected = [];

console.log("Technique                 vues    retenues");
console.log("─".repeat(46));

for (const technique of TECHNIQUES) {
  const found = byTechnique[technique] ?? [];
  const best = [...found].sort((a, b) => a.score - b.score).slice(0, perTechnique);
  selected.push(...best.map((c) => c.record));

  const name = DISPLAY_NAME[technique].padEnd(24);
  const tag = orphans.includes(technique) ? " (recherche ciblée)" : "";
  const status = best.length === 0 ? "  aucune !" : `${best.length}${tag}`;
  console.log(`${name} ${String(found.length).padStart(5)}    ${status}`);
}

const missing = TECHNIQUES.filter((t) => (byTechnique[t] ?? []).length === 0);
if (missing.length > 0) {
  console.log(`\nAucun exemple : ${missing.map((t) => DISPLAY_NAME[t]).join(", ")}`);
  console.log("Ces motifs sont absents du stock. Relance avec davantage de grilles.");
}

if (rejected > 0) {
  console.log(`\n${rejected} position(s) écartée(s) : motif exact mais sans intérêt.`);
}

writeFileSync("examples.json", JSON.stringify(selected));
console.log(`\n${selected.length} exemples écrits dans examples.json`);
