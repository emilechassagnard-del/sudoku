// Moteur de Sudoku à techniques humaines.
//
// Traduction fidèle du moteur Swift : mêmes techniques, mêmes coûts, mêmes
// explications françaises. Toute divergence entre les deux versions serait un
// bug — les textes affichés au joueur doivent être identiques.

// MARK: - Ensembles de candidats
//
// Un masque de bits plutôt qu'un Set : le bit d-1 porte le chiffre d. Le
// générateur teste des milliers de grilles, et l'écart de coût compte.

export const ALL = 0b111111111;

export function maskOf(digit) {
  return 1 << (digit - 1);
}

export function maskOfDigits(digits) {
  let mask = 0;
  for (const d of digits) mask |= 1 << (d - 1);
  return mask;
}

export function countBits(mask) {
  let n = 0;
  while (mask) {
    mask &= mask - 1;
    n++;
  }
  return n;
}

export function hasDigit(mask, digit) {
  return (mask & (1 << (digit - 1))) !== 0;
}

export function digitsOf(mask) {
  const out = [];
  for (let d = 1; d <= 9; d++) if (hasDigit(mask, d)) out.push(d);
  return out;
}

export function soleDigit(mask) {
  return countBits(mask) === 1 ? digitsOf(mask)[0] : null;
}

// MARK: - Géométrie
//
// Cases numérotées de 0 à 80, en lecture ligne par ligne. Unités : 0-8 lignes,
// 9-17 colonnes, 18-26 blocs.

export const CELL_COUNT = 81;

export const rowOf = (c) => Math.floor(c / 9);
export const colOf = (c) => c % 9;
export const boxOf = (c) => Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3);

const rows = Array.from({ length: 9 }, (_, r) =>
  Array.from({ length: 9 }, (_, i) => r * 9 + i)
);
const columns = Array.from({ length: 9 }, (_, c) =>
  Array.from({ length: 9 }, (_, i) => i * 9 + c)
);
const boxes = Array.from({ length: 9 }, (_, b) => {
  const firstRow = Math.floor(b / 3) * 3;
  const firstCol = (b % 3) * 3;
  return Array.from(
    { length: 9 },
    (_, i) => (firstRow + Math.floor(i / 3)) * 9 + firstCol + (i % 3)
  );
});

export const Geometry = {
  cellCount: CELL_COUNT,
  rows,
  columns,
  boxes,
  units: [...rows, ...columns, ...boxes],
  unitsOf: Array.from({ length: CELL_COUNT }, (_, c) => [
    rowOf(c),
    9 + colOf(c),
    18 + boxOf(c),
  ]),
  peers: Array.from({ length: CELL_COUNT }, (_, c) => {
    const set = new Set([...rows[rowOf(c)], ...columns[colOf(c)], ...boxes[boxOf(c)]]);
    set.delete(c);
    return [...set].sort((a, b) => a - b);
  }),
  name(cell) {
    return `L${rowOf(cell) + 1}C${colOf(cell) + 1}`;
  },
  unitName(unit) {
    if (unit < 9) return `la ligne ${unit + 1}`;
    if (unit < 18) return `la colonne ${unit - 8}`;
    return `le bloc ${unit - 17}`;
  },
};

Geometry.peerSets = Geometry.peers.map((p) => new Set(p));

Geometry.sees = (a, b) => a !== b && Geometry.peerSets[a].has(b);

/** Toutes les combinaisons de k éléments, dans l'ordre lexicographique. */
export function combinations(items, k) {
  if (k <= 0) return [[]];
  if (k > items.length) return [];
  const result = [];
  const indices = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    result.push(indices.map((i) => items[i]));
    let i = k - 1;
    while (i >= 0 && indices[i] === items.length - k + i) i--;
    if (i < 0) break;
    indices[i]++;
    for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1] + 1;
  }
  return result;
}

// MARK: - Rédaction française

export function frenchList(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(", ") + " et " + items[items.length - 1];
}

export const frenchDigits = (mask) => frenchList(digitsOf(mask).map(String));
export const frenchCells = (cells) => frenchList(cells.map(Geometry.name));

// MARK: - Grille
//
// Les candidats sont maintenus en permanence : poser un chiffre les retire
// chez les vingt voisins. C'est ce qui permet aux techniques de raisonner sans
// tout recalculer à chaque étape.

export class Board {
  constructor(values, candidates, givens) {
    this.values = values ?? new Array(CELL_COUNT).fill(0);
    this.candidates = candidates ?? new Array(CELL_COUNT).fill(ALL);
    this.givens = givens ?? new Set();
  }

  clone() {
    return new Board([...this.values], [...this.candidates], new Set(this.givens));
  }

  /** Depuis 81 caractères. Renvoie null si la chaîne décrit une grille impossible. */
  static parse(text) {
    const chars = [...text].filter((ch) => !/\s/.test(ch));
    if (chars.length !== CELL_COUNT) return null;
    const board = new Board();
    for (let i = 0; i < CELL_COUNT; i++) {
      const ch = chars[i];
      if (ch === "." || ch === "0" || ch === "-") continue;
      if (ch < "1" || ch > "9") return null;
      const digit = Number(ch);
      if (board.values[i] !== 0 || !hasDigit(board.candidates[i], digit)) return null;
      board.place(digit, i);
      board.givens.add(i);
    }
    return board;
  }

  get isSolved() {
    return !this.values.includes(0);
  }

  unsolvedCells() {
    const out = [];
    for (let c = 0; c < CELL_COUNT; c++) if (this.values[c] === 0) out.push(c);
    return out;
  }

  unsolvedIn(unit) {
    return Geometry.units[unit].filter((c) => this.values[c] === 0);
  }

  containsDigit(digit, unit) {
    return Geometry.units[unit].some((c) => this.values[c] === digit);
  }

  positionsOf(digit, unit) {
    return Geometry.units[unit].filter(
      (c) => this.values[c] === 0 && hasDigit(this.candidates[c], digit)
    );
  }

  get hasContradiction() {
    for (let c = 0; c < CELL_COUNT; c++) {
      if (this.values[c] === 0 && this.candidates[c] === 0) return true;
    }
    for (let u = 0; u < 27; u++) {
      for (let d = 1; d <= 9; d++) {
        if (this.containsDigit(d, u)) continue;
        if (this.positionsOf(d, u).length === 0) return true;
      }
    }
    return false;
  }

  /** Case vide au moins de candidats — heuristique du solveur par recherche. */
  mostConstrainedCell() {
    let best = null;
    let bestCount = 10;
    for (let c = 0; c < CELL_COUNT; c++) {
      if (this.values[c] !== 0) continue;
      const n = countBits(this.candidates[c]);
      if (n < bestCount) {
        bestCount = n;
        best = c;
        if (n <= 1) break;
      }
    }
    return best;
  }

  place(digit, cell) {
    this.values[cell] = digit;
    this.candidates[cell] = 0;
    const mask = maskOf(digit);
    for (const peer of Geometry.peers[cell]) this.candidates[peer] &= ~mask;
  }

  eliminate(mask, cell) {
    const before = this.candidates[cell];
    this.candidates[cell] &= ~mask;
    return this.candidates[cell] !== before;
  }

  apply(deduction) {
    for (const action of deduction.actions) {
      if (action.kind === "place") this.place(action.digit, action.cell);
      else this.eliminate(action.digits, action.cell);
    }
  }

  get compact() {
    return this.values.map((v) => (v === 0 ? "." : String(v))).join("");
  }
}

// MARK: - Techniques

export const TECHNIQUES = [
  "nakedSingle",
  "hiddenSingle",
  "pointing",
  "claiming",
  "nakedPair",
  "hiddenPair",
  "nakedTriple",
  "hiddenTriple",
  "nakedQuad",
  "hiddenQuad",
  "xWing",
  "xyWing",
  "swordfish",
];

export const COST = {
  nakedSingle: 1,
  hiddenSingle: 2,
  pointing: 5,
  claiming: 6,
  nakedPair: 8,
  hiddenPair: 10,
  nakedTriple: 13,
  hiddenTriple: 16,
  nakedQuad: 20,
  hiddenQuad: 24,
  xWing: 28,
  xyWing: 32,
  swordfish: 40,
};

export const DISPLAY_NAME = {
  nakedSingle: "Singleton nu",
  hiddenSingle: "Singleton caché",
  pointing: "Candidats pointants",
  claiming: "Candidats revendiqués",
  nakedPair: "Paire nue",
  hiddenPair: "Paire cachée",
  nakedTriple: "Triplet nu",
  hiddenTriple: "Triplet caché",
  nakedQuad: "Quadruplet nu",
  hiddenQuad: "Quadruplet caché",
  xWing: "X-Wing",
  xyWing: "XY-Wing",
  swordfish: "Swordfish",
};

const SUBSET_PRINCIPLE_NAKED =
  "Si N cases d'une même unité ne contiennent au total que N candidats, ces N chiffres se répartiront entre ces N cases. Aucune autre case de l'unité ne peut les prendre.";
const SUBSET_PRINCIPLE_HIDDEN =
  "Si N chiffres d'une même unité ne peuvent tenir que dans N cases, ces cases leur sont réservées : tous les autres candidats de ces cases peuvent être supprimés.";

export const PRINCIPLE = {
  nakedSingle:
    "Quand une case n'a plus qu'un seul candidat possible, ce candidat est forcément sa valeur.",
  hiddenSingle:
    "Quand un chiffre ne peut se placer que dans une seule case d'une ligne, d'une colonne ou d'un bloc, il va dans cette case — même si cette case a d'autres candidats.",
  pointing:
    "Si tous les emplacements possibles d'un chiffre dans un bloc sont alignés sur une même ligne ou colonne, ce chiffre occupera forcément cette ligne à l'intérieur du bloc : on peut donc l'éliminer du reste de la ligne.",
  claiming:
    "Si tous les emplacements possibles d'un chiffre dans une ligne ou une colonne tombent dans un même bloc, ce chiffre occupera forcément ce bloc : on peut donc l'éliminer des autres cases du bloc.",
  nakedPair: SUBSET_PRINCIPLE_NAKED,
  nakedTriple: SUBSET_PRINCIPLE_NAKED,
  nakedQuad: SUBSET_PRINCIPLE_NAKED,
  hiddenPair: SUBSET_PRINCIPLE_HIDDEN,
  hiddenTriple: SUBSET_PRINCIPLE_HIDDEN,
  hiddenQuad: SUBSET_PRINCIPLE_HIDDEN,
  xWing:
    "Si un chiffre n'a que deux emplacements possibles sur deux lignes, et que ces emplacements partagent les deux mêmes colonnes, alors ce chiffre occupe un coin sur deux du rectangle. Il peut être éliminé du reste de ces deux colonnes.",
  swordfish:
    "Généralisation du X-Wing à trois lignes et trois colonnes : si un chiffre se limite à trois colonnes sur trois lignes, il peut être éliminé du reste de ces colonnes.",
  xyWing:
    "Trois cases n'ayant que deux candidats chacune. Le pivot porte X et Y, et voit les deux autres, appelées pinces : l'une porte X et Z, l'autre Y et Z. Le pivot vaudra X ou Y — on ignore lequel, et c'est justement ce qui rend la déduction possible. S'il vaut X, la pince X-Z est forcée à Z ; s'il vaut Y, c'est la pince Y-Z qui vaut Z. Dans les deux cas, l'une des pinces vaut Z. Toute case voyant les deux pinces perd donc le candidat Z.",
};

const place = (cell, digit) => ({ kind: "place", cell, digit });
const eliminate = (cell, digits) => ({ kind: "eliminate", cell, digits });
const mark = (cell, digits, role) => ({ cell, digits, role });

// MARK: Singletons

function findNakedSingle(board) {
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (board.values[cell] !== 0) continue;
    const digit = soleDigit(board.candidates[cell]);
    if (digit === null) continue;

    const blockers = Geometry.peers[cell].filter((p) => board.values[p] !== 0);
    return {
      technique: "nakedSingle",
      actions: [place(cell, digit)],
      highlights: [
        mark(cell, maskOf(digit), "target"),
        ...blockers.map((p) => mark(p, maskOf(board.values[p]), "premise")),
      ],
      units: Geometry.unitsOf[cell],
      explanation:
        `La case ${Geometry.name(cell)} n'accepte plus qu'un seul chiffre : le ${digit}. ` +
        `Les huit autres sont déjà présents sur sa ligne, sa colonne ou son bloc.`,
    };
  }
  return null;
}

function findHiddenSingle(board) {
  for (let unit = 0; unit < 27; unit++) {
    for (let digit = 1; digit <= 9; digit++) {
      if (board.containsDigit(digit, unit)) continue;
      const spots = board.positionsOf(digit, unit);
      if (spots.length !== 1) continue;
      const cell = spots[0];
      // Une case à candidat unique relève du singleton nu : plus simple à expliquer.
      if (countBits(board.candidates[cell]) === 1) continue;

      return {
        technique: "hiddenSingle",
        actions: [place(cell, digit)],
        highlights: [mark(cell, maskOf(digit), "target")],
        units: [unit],
        explanation:
          `Dans ${Geometry.unitName(unit)}, le chiffre ${digit} ne peut se placer ` +
          `qu'en ${Geometry.name(cell)}. Toutes les autres cases libres de cette unité ` +
          `le refusent, donc il va là — même si cette case garde d'autres candidats ` +
          `(${frenchDigits(board.candidates[cell])}).`,
      };
    }
  }
  return null;
}

// MARK: Candidats verrouillés

function findPointing(board) {
  for (let box = 0; box < 9; box++) {
    const boxUnit = 18 + box;
    for (let digit = 1; digit <= 9; digit++) {
      if (board.containsDigit(digit, boxUnit)) continue;
      const spots = board.positionsOf(digit, boxUnit);
      if (spots.length < 2) continue;

      const lines = [];
      if (new Set(spots.map(rowOf)).size === 1) {
        const r = rowOf(spots[0]);
        lines.push({ unit: r, cells: Geometry.rows[r] });
      }
      if (new Set(spots.map(colOf)).size === 1) {
        const c = colOf(spots[0]);
        lines.push({ unit: 9 + c, cells: Geometry.columns[c] });
      }

      for (const line of lines) {
        const lineWord = line.unit < 9 ? "cette ligne" : "cette colonne";
        const spotSet = new Set(spots);
        const targets = line.cells.filter(
          (c) =>
            !spotSet.has(c) && board.values[c] === 0 && hasDigit(board.candidates[c], digit)
        );
        if (targets.length === 0) continue;

        const mask = maskOf(digit);
        return {
          technique: "pointing",
          actions: targets.map((c) => eliminate(c, mask)),
          highlights: [
            ...spots.map((c) => mark(c, mask, "premise")),
            ...targets.map((c) => mark(c, mask, "target")),
          ],
          units: [boxUnit, line.unit],
          explanation:
            `Dans ${Geometry.unitName(boxUnit)}, le ${digit} ne peut aller qu'en ` +
            `${frenchCells(spots)} — toutes sur ${Geometry.unitName(line.unit)}. ` +
            `Le ${digit} de ce bloc occupera donc forcément ${lineWord} : on peut ` +
            `le retirer des autres cases de ${Geometry.unitName(line.unit)}, ` +
            `soit ${frenchCells(targets)}.`,
        };
      }
    }
  }
  return null;
}

function findClaiming(board) {
  for (let lineUnit = 0; lineUnit < 18; lineUnit++) {
    for (let digit = 1; digit <= 9; digit++) {
      if (board.containsDigit(digit, lineUnit)) continue;
      const spots = board.positionsOf(digit, lineUnit);
      if (spots.length < 2) continue;

      const boxSet = new Set(spots.map(boxOf));
      if (boxSet.size !== 1) continue;
      const box = [...boxSet][0];

      const boxUnit = 18 + box;
      const spotSet = new Set(spots);
      const targets = Geometry.boxes[box].filter(
        (c) => !spotSet.has(c) && board.values[c] === 0 && hasDigit(board.candidates[c], digit)
      );
      if (targets.length === 0) continue;

      const lineWord = lineUnit < 9 ? "cette ligne" : "cette colonne";
      const mask = maskOf(digit);
      return {
        technique: "claiming",
        actions: targets.map((c) => eliminate(c, mask)),
        highlights: [
          ...spots.map((c) => mark(c, mask, "premise")),
          ...targets.map((c) => mark(c, mask, "target")),
        ],
        units: [lineUnit, boxUnit],
        explanation:
          `Sur ${Geometry.unitName(lineUnit)}, le ${digit} ne peut aller qu'en ` +
          `${frenchCells(spots)} — toutes dans ${Geometry.unitName(boxUnit)}. ` +
          `Ce bloc a donc son ${digit} réservé à ${lineWord} : on peut le retirer ` +
          `des autres cases du bloc, soit ${frenchCells(targets)}.`,
      };
    }
  }
  return null;
}

// MARK: Sous-ensembles

const NAKED_BY_SIZE = { 2: "nakedPair", 3: "nakedTriple", 4: "nakedQuad" };
const HIDDEN_BY_SIZE = { 2: "hiddenPair", 3: "hiddenTriple", 4: "hiddenQuad" };

function makeNakedSubsetFinder(size) {
  const technique = NAKED_BY_SIZE[size];
  return function find(board) {
    for (let unit = 0; unit < 27; unit++) {
      const allUnsolved = board.unsolvedIn(unit);
      const unsolved = allUnsolved.filter((c) => {
        const n = countBits(board.candidates[c]);
        return n >= 2 && n <= size;
      });
      if (unsolved.length < size) continue;
      // Il faut au moins une case hors du sous-ensemble à nettoyer.
      if (allUnsolved.length <= size) continue;

      for (const combo of combinations(unsolved, size)) {
        let union = 0;
        for (const cell of combo) union |= board.candidates[cell];
        if (countBits(union) !== size) continue;

        const comboSet = new Set(combo);
        const targets = allUnsolved.filter(
          (c) => !comboSet.has(c) && (board.candidates[c] & union) !== 0
        );
        if (targets.length === 0) continue;

        return {
          technique,
          actions: targets.map((c) => eliminate(c, board.candidates[c] & union)),
          highlights: [
            ...combo.map((c) => mark(c, board.candidates[c], "premise")),
            ...targets.map((c) => mark(c, board.candidates[c] & union, "target")),
          ],
          units: [unit],
          explanation:
            `Dans ${Geometry.unitName(unit)}, les ${size} cases ${frenchCells(combo)} ` +
            `ne contiennent à elles toutes que ${size} candidats : ` +
            `${frenchDigits(union)}. Ces ${size} chiffres vont donc se répartir entre ` +
            `ces ${size} cases, et aucune autre case de l'unité ne peut les prendre. ` +
            `On les retire de ${frenchCells(targets)}.`,
        };
      }
    }
    return null;
  };
}

function makeHiddenSubsetFinder(size) {
  const technique = HIDDEN_BY_SIZE[size];
  return function find(board) {
    for (let unit = 0; unit < 27; unit++) {
      const unsolved = board.unsolvedIn(unit);
      if (unsolved.length <= size) continue;

      // Chiffres à placer ayant au moins deux emplacements : un seul relèverait
      // du singleton caché.
      const placeable = [];
      const spotsByDigit = {};
      for (let digit = 1; digit <= 9; digit++) {
        if (board.containsDigit(digit, unit)) continue;
        const spots = board.positionsOf(digit, unit);
        if (spots.length < 2) continue;
        placeable.push(digit);
        spotsByDigit[digit] = spots;
      }
      if (placeable.length <= size) continue;

      for (const combo of combinations(placeable, size)) {
        const cells = new Set();
        for (const digit of combo) for (const c of spotsByDigit[digit]) cells.add(c);
        if (cells.size !== size) continue;

        const comboMask = maskOfDigits(combo);
        const sorted = [...cells].sort((a, b) => a - b);
        const targets = sorted.filter((c) => (board.candidates[c] & ~comboMask & ALL) !== 0);
        if (targets.length === 0) continue;

        return {
          technique,
          actions: targets.map((c) => eliminate(c, board.candidates[c] & ~comboMask & ALL)),
          highlights: [
            ...sorted.map((c) => mark(c, board.candidates[c] & comboMask, "premise")),
            ...targets.map((c) => mark(c, board.candidates[c] & ~comboMask & ALL, "target")),
          ],
          units: [unit],
          explanation:
            `Dans ${Geometry.unitName(unit)}, les chiffres ${frenchDigits(comboMask)} ` +
            `ne peuvent tenir que dans ${size} cases : ${frenchCells(sorted)}. ` +
            `Ces ${size} cases leur sont donc réservées, et tous leurs autres candidats ` +
            `peuvent être supprimés.`,
        };
      }
    }
    return null;
  };
}

// MARK: Poissons

function makeFishFinder(size) {
  const technique = size === 2 ? "xWing" : "swordfish";

  function search(digit, rowBased, board) {
    const baseUnits = rowBased
      ? Array.from({ length: 9 }, (_, i) => i)
      : Array.from({ length: 9 }, (_, i) => 9 + i);

    const lines = [];
    for (const unit of baseUnits) {
      if (board.containsDigit(digit, unit)) continue;
      const spots = board.positionsOf(digit, unit);
      if (spots.length < 2 || spots.length > size) continue;
      lines.push({ unit, covers: spots.map((c) => (rowBased ? colOf(c) : rowOf(c))), cells: spots });
    }
    if (lines.length < size) return null;

    for (const combo of combinations(lines, size)) {
      const coverIndices = new Set();
      for (const line of combo) for (const cover of line.covers) coverIndices.add(cover);
      if (coverIndices.size !== size) continue;

      const baseCells = new Set(combo.flatMap((l) => l.cells));
      const coverUnits = [];
      const targets = [];

      for (const cover of [...coverIndices].sort((a, b) => a - b)) {
        const coverUnit = rowBased ? 9 + cover : cover;
        coverUnits.push(coverUnit);
        for (const cell of board.positionsOf(digit, coverUnit)) {
          if (!baseCells.has(cell)) targets.push(cell);
        }
      }
      if (targets.length === 0) continue;

      const mask = maskOf(digit);
      const baseNames = frenchList(combo.map((l) => Geometry.unitName(l.unit)));
      const coverNames = frenchList(coverUnits.map(Geometry.unitName));
      const coverWord = rowBased ? "colonnes" : "lignes";
      const baseWord = rowBased ? "lignes" : "colonnes";

      return {
        technique,
        actions: targets.map((c) => eliminate(c, mask)),
        highlights: [
          ...[...baseCells].sort((a, b) => a - b).map((c) => mark(c, mask, "premise")),
          ...targets.map((c) => mark(c, mask, "target")),
        ],
        units: [...combo.map((l) => l.unit), ...coverUnits],
        explanation:
          `Sur ${baseNames}, le chiffre ${digit} est confiné à ${size} ` +
          `${coverWord} seulement : ${coverNames}. ` +
          `Chacune de ces ${size} ${baseWord} de base doit ` +
          `recevoir un ${digit}, et il n'y a que ${size} ` +
          `${coverWord} pour les accueillir : elles sont donc ` +
          `toutes prises. Le ${digit} peut être éliminé du reste de ${coverNames}, ` +
          `soit ${frenchCells(targets)}.`,
      };
    }
    return null;
  }

  return function find(board) {
    for (let digit = 1; digit <= 9; digit++) {
      const byRow = search(digit, true, board);
      if (byRow) return byRow;
      const byCol = search(digit, false, board);
      if (byCol) return byCol;
    }
    return null;
  };
}

// MARK: XY-Wing

function findXYWing(board) {
  const bivalue = [];
  for (let c = 0; c < CELL_COUNT; c++) {
    if (board.values[c] === 0 && countBits(board.candidates[c]) === 2) bivalue.push(c);
  }
  if (bivalue.length < 3) return null;

  for (const pivot of bivalue) {
    const [x, y] = digitsOf(board.candidates[pivot]);
    const neighbours = bivalue.filter((c) => Geometry.sees(pivot, c));

    for (const first of neighbours) {
      const firstMask = board.candidates[first];
      if (!hasDigit(firstMask, x) || hasDigit(firstMask, y)) continue;
      const z = soleDigit(firstMask & ~maskOf(x) & ALL);
      if (z === null) continue;

      const secondPattern = maskOfDigits([y, z]);

      for (const second of neighbours) {
        if (second === first || board.candidates[second] !== secondPattern) continue;

        const mask = maskOf(z);
        const targets = [];
        for (let cell = 0; cell < CELL_COUNT; cell++) {
          if (cell === pivot || cell === first || cell === second) continue;
          if (board.values[cell] !== 0) continue;
          if (!hasDigit(board.candidates[cell], z)) continue;
          if (!Geometry.sees(first, cell) || !Geometry.sees(second, cell)) continue;
          targets.push(cell);
        }
        if (targets.length === 0) continue;

        return {
          technique: "xyWing",
          actions: targets.map((c) => eliminate(c, mask)),
          highlights: [
            mark(pivot, board.candidates[pivot], "pivot"),
            mark(first, board.candidates[first], "premise"),
            mark(second, board.candidates[second], "premise"),
            ...targets.map((c) => mark(c, mask, "target")),
          ],
          units: [],
          explanation:
            `La case pivot ${Geometry.name(pivot)} vaut ${x} ou ${y}. ` +
            `Elle voit ${Geometry.name(first)} qui vaut ${x} ou ${z}, ` +
            `et ${Geometry.name(second)} qui vaut ${y} ou ${z}. ` +
            `Si le pivot vaut ${x}, alors ${Geometry.name(first)} vaut ${z} ; ` +
            `s'il vaut ${y}, alors ${Geometry.name(second)} vaut ${z}. ` +
            `Dans les deux cas, l'une des deux pinces vaut ${z}. ` +
            `Toute case voyant les deux pinces perd donc le ${z} : ` +
            `${frenchCells(targets)}.`,
        };
      }
    }
  }
  return null;
}

// MARK: - Chercheurs, du plus simple au plus avancé

export const FINDERS = [
  { technique: "nakedSingle", find: findNakedSingle },
  { technique: "hiddenSingle", find: findHiddenSingle },
  { technique: "pointing", find: findPointing },
  { technique: "claiming", find: findClaiming },
  { technique: "nakedPair", find: makeNakedSubsetFinder(2) },
  { technique: "hiddenPair", find: makeHiddenSubsetFinder(2) },
  { technique: "nakedTriple", find: makeNakedSubsetFinder(3) },
  { technique: "hiddenTriple", find: makeHiddenSubsetFinder(3) },
  { technique: "nakedQuad", find: makeNakedSubsetFinder(4) },
  { technique: "hiddenQuad", find: makeHiddenSubsetFinder(4) },
  { technique: "xWing", find: makeFishFinder(2) },
  { technique: "xyWing", find: findXYWing },
  { technique: "swordfish", find: makeFishFinder(3) },
];

/**
 * La prochaine étape à conseiller, toujours la plus simple disponible.
 *
 * Propriété exploitée par tout le reste de l'app : si la réponse est un
 * X-Wing, c'est qu'aucune technique moins coûteuse ne s'applique nulle part
 * sur la grille.
 */
export function nextStep(board, finders = FINDERS) {
  if (board.isSolved) return null;
  for (const finder of finders) {
    const deduction = finder.find(board);
    if (deduction) return deduction;
  }
  return null;
}

/** Le chercheur d'une seule technique, pour l'extraction d'exemples. */
export function finderFor(technique) {
  return FINDERS.find((f) => f.technique === technique);
}

// MARK: - Justifier un coup précis
//
// nextStep répond à « que faire maintenant ». Ce n'est pas la même question que
// « qu'a-t-il fallu voir pour poser CE chiffre-là ».
//
// La différence compte pour le score. Un joueur qui repère un X-Wing pendant
// qu'un singleton nu traîne à l'autre bout de la grille a fait le travail du
// X-Wing, et nextStep répondrait « singleton nu ». Créditer d'après nextStep
// revient à payer le raisonnement le plus paresseux qui existait ailleurs.

/** Le chiffre est-il le seul candidat restant de la case. */
function isNakedSingleAt(board, cell, digit) {
  return board.values[cell] === 0 && soleDigit(board.candidates[cell]) === digit;
}

/** Le chiffre n'a-t-il plus qu'une place dans l'une des unités de la case. */
function isHiddenSingleAt(board, cell, digit) {
  if (board.values[cell] !== 0) return false;
  if (!hasDigit(board.candidates[cell], digit)) return false;
  return Geometry.unitsOf[cell].some((unit) => {
    if (board.containsDigit(digit, unit)) return false;
    const spots = board.positionsOf(digit, unit);
    return spots.length === 1 && spots[0] === cell;
  });
}

/** Le placement se lit-il directement, sans élimination préalable. */
function readsDirectly(board, cell, digit) {
  if (isNakedSingleAt(board, cell, digit)) return "nakedSingle";
  if (isHiddenSingleAt(board, cell, digit)) return "hiddenSingle";
  return null;
}

/**
 * Applique toutes les éliminations que cette technique sait produire.
 *
 * On boucle parce qu'un chercheur ne rend qu'une déduction à la fois : après
 * l'avoir appliquée, la suivante devient trouvable. Les techniques concernées
 * ne posent aucun chiffre, donc la boucle s'arrête d'elle-même.
 */
function exhaust(finder, board, limit = 60) {
  const work = board.clone();
  for (let i = 0; i < limit; i++) {
    const deduction = finder.find(work);
    if (!deduction) break;
    work.apply(deduction);
  }
  return work;
}

/**
 * Le raisonnement le moins coûteux qui suffit à justifier ce placement.
 *
 * Renvoie null quand aucune technique du catalogue ne le justifie : le joueur a
 * deviné, ou s'est appuyé sur un motif que l'app ne connaît pas. Dans les deux
 * cas, on préfère ne rien créditer plutôt que d'inventer un mérite.
 *
 * @param {Board} board  La position AVANT le coup.
 */
export function justificationFor(board, cell, digit) {
  const direct = readsDirectly(board, cell, digit);
  if (direct) return direct;

  // Le placement demande des éliminations. On cherche la technique la moins
  // chère qui, une fois épuisée, rend le chiffre lisible.
  for (const finder of FINDERS) {
    if (finder.technique === "nakedSingle" || finder.technique === "hiddenSingle") continue;
    const after = exhaust(finder, board);
    if (readsDirectly(after, cell, digit)) return finder.technique;
  }

  return null;
}

export function solve(board, finders = FINDERS) {
  const current = board.clone();
  const steps = [];
  while (!current.isSolved) {
    const deduction = nextStep(current, finders);
    if (!deduction) break;
    current.apply(deduction);
    steps.push(deduction);
    if (current.hasContradiction) break;
  }
  return report(steps, current);
}

function report(steps, board) {
  const counts = {};
  for (const s of steps) counts[s.technique] = (counts[s.technique] ?? 0) + 1;

  let hardest = null;
  for (const s of steps) {
    if (hardest === null || COST[s.technique] > COST[hardest]) hardest = s.technique;
  }

  return {
    steps,
    board,
    isSolved: board.isSolved,
    techniqueCounts: counts,
    hardestTechnique: hardest,
    score: steps.reduce((n, s) => n + COST[s.technique], 0),
    difficulty: gradeOf(board.isSolved, hardest, counts),
  };
}

export const DIFFICULTIES = ["facile", "moyen", "difficile", "expert", "diabolique"];

export const DIFFICULTY_NAME = {
  facile: "Facile",
  moyen: "Moyen",
  difficile: "Difficile",
  expert: "Expert",
  diabolique: "Diabolique",
};

/**
 * Le barème, calibré sur 300 grilles pour que les cinq niveaux existent.
 *
 * Il repose sur la technique la plus avancée qu'il faut *connaître*, pas sur
 * le nombre d'étapes. Une exception : les grilles à singletons seuls sont
 * coupées en deux selon le nombre de singletons cachés, car une grille en
 * réclamant vingt est laborieuse sans être savante.
 */
function gradeOf(isSolved, hardest, counts) {
  if (!isSolved || !hardest) return null;
  switch (hardest) {
    case "nakedSingle":
    case "hiddenSingle":
      return (counts.hiddenSingle ?? 0) <= 5 ? "facile" : "moyen";
    case "pointing":
    case "claiming":
      return "difficile";
    case "nakedPair":
    case "hiddenPair":
    case "nakedTriple":
    case "hiddenTriple":
    case "nakedQuad":
    case "hiddenQuad":
      return "expert";
    default:
      return "diabolique";
  }
}

// MARK: - Résolution exhaustive
//
// Ce solveur n'explique rien : il vérifie qu'une grille a une solution et une
// seule, ce dont le générateur a besoin à chaque retrait d'indice.

export const BruteForce = {
  solve(board) {
    const out = { count: 0, solution: null };
    search(board, 1, out);
    return out.solution;
  },
  solutionCount(board, limit = 2) {
    const out = { count: 0, solution: null };
    search(board, limit, out);
    return out.count;
  },
  hasUniqueSolution(board) {
    return this.solutionCount(board, 2) === 1;
  },
};

function search(board, limit, out) {
  const current = board.clone();

  // Propagation des singletons nus : très rentable avant de brancher.
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (current.values[cell] !== 0) continue;
      const mask = current.candidates[cell];
      if (mask === 0) return;
      const digit = soleDigit(mask);
      if (digit !== null) {
        current.place(digit, cell);
        progressed = true;
      }
    }
  }

  const cell = current.mostConstrainedCell();
  if (cell === null) {
    out.count++;
    if (!out.solution) out.solution = current;
    return;
  }

  for (const digit of digitsOf(current.candidates[cell])) {
    const next = current.clone();
    next.place(digit, cell);
    search(next, limit, out);
    if (out.count >= limit) return;
  }
}

// MARK: - Générateur

/** SplitMix64 : une même graine redonne toujours la même grille. */
export function makeRandom(seed) {
  let state = BigInt(seed === 0 ? 0x9e3779b97f4a7c15n : BigInt(seed));
  const MASK = (1n << 64n) - 1n;
  return function next() {
    state = (state + 0x9e3779b97f4a7c15n) & MASK;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
    z = z ^ (z >> 31n);
    return Number(z & 0xffffffffn) / 0x100000000;
  };
}

function shuffled(items, rand) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function fill(board, rand) {
  const cell = board.mostConstrainedCell();
  if (cell === null) return board;
  for (const digit of shuffled(digitsOf(board.candidates[cell]), rand)) {
    const next = board.clone();
    next.place(digit, cell);
    const done = fill(next, rand);
    if (done) return done;
  }
  return null;
}

function removalGroups(symmetric) {
  if (!symmetric) return Array.from({ length: CELL_COUNT }, (_, i) => [i]);
  const groups = [];
  const seen = new Set();
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (seen.has(cell)) continue;
    const opposite = CELL_COUNT - 1 - cell;
    if (opposite === cell) {
      groups.push([cell]);
      seen.add(cell);
    } else {
      groups.push([cell, opposite]);
      seen.add(cell);
      seen.add(opposite);
    }
  }
  return groups;
}

function boardFromValues(values) {
  return Board.parse(values.map((v) => (v === 0 ? "." : String(v))).join(""));
}

/*
  Le nombre d'indices à laisser en place selon le niveau visé.

  Sans ce plancher, le creusement allait toujours au bout — il retirait des
  chiffres tant que la solution restait unique — et produisait des grilles à
  vingt-cinq indices quel que soit le niveau. Une grille facile n'était alors
  facile que par les techniques qu'elle réclamait : le joueur avait tout de
  même cinquante-cinq cases à remplir une par une, ce qui est long, fastidieux,
  et se ressent comme de la difficulté.

  Une grille se juge autant à ce qu'elle donne qu'à ce qu'elle demande.
*/
export const PLANCHER_INDICES = {
  facile: 40,
  moyen: 34,
  difficile: 30,
  expert: 27,
  diabolique: 17, // le minimum théorique : on creuse jusqu'au bout
};

/** Retire des indices tant que la solution reste unique et que le plancher le permet. */
function carve(solution, rand, symmetric, plancher = 17) {
  const values = [...solution.values];
  let restants = 81;
  for (const group of shuffled(removalGroups(symmetric), rand)) {
    if (restants - group.length < plancher) continue;
    const kept = group.map((c) => values[c]);
    for (const c of group) values[c] = 0;
    if (BruteForce.hasUniqueSolution(boardFromValues(values))) {
      restants -= group.length;
    } else {
      group.forEach((c, i) => (values[c] = kept[i]));
    }
  }
  return boardFromValues(values);
}

/** Une grille notée, ou null si elle dépasse les techniques implémentées. */
export function generateOne(rand, symmetric = true, plancher = 17) {
  const solution = fill(new Board(), rand);
  const puzzle = carve(solution, rand, symmetric, plancher);
  const rep = solve(puzzle);
  if (!rep.difficulty) return null;
  return { puzzle, solution, report: rep, difficulty: rep.difficulty };
}

/** Une grille du niveau visé. Les niveaux rares demandent beaucoup d'essais. */
export function generate(target, rand, maxAttempts = 500) {
  // Les niveaux élevés se rencontrent surtout sur les grilles très dépouillées.
  const symmetric = DIFFICULTIES.indexOf(target) < DIFFICULTIES.indexOf("expert");
  const plancher = PLANCHER_INDICES[target] ?? 17;
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = generateOne(rand, symmetric, plancher);
    if (candidate && candidate.difficulty === target) return candidate;
  }
  return null;
}
