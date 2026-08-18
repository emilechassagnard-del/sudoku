// L'état d'une partie, et tout ce qui compte le mérite.
//
// Traduction du GameState de l'app iOS. Le principe est le même : ce qu'on
// compte, ce ne sont pas les chiffres posés, ce sont les raisonnements
// franchis.

import {
  Board,
  Geometry,
  COST,
  DISPLAY_NAME,
  DIFFICULTIES,
  DIFFICULTY_NAME,
  ALL,
  maskOf,
  hasDigit,
  digitsOf,
  countBits,
  nextStep,
} from "./engine.js";

// MARK: - Barème d'aide
//
// Chaque palier de l'indice retire la moitié de ce qui restait. Savoir qu'il
// faut chercher un XY-Wing laisse encore tout le travail de le trouver ; savoir
// où il est laisse celui de comprendre pourquoi ; l'avoir expliqué ne laisse
// plus rien. Et poser le chiffre à la place du joueur n'est pas un raisonnement.
//
// Les parts sont sur quatre, et tout le barème est multiplié par quatre : le
// score reste ainsi entier en toute circonstance.

export const ASSISTANCE = { none: 4, named: 2, located: 1, given: 0 };
export const ASSISTANCE_LABEL = { none: "seul", named: "nommé", located: "montré", given: "donné" };

/** Les deux techniques que l'affichage des candidats résout entièrement. */
export function isSolvedByCandidates(technique) {
  return technique === "nakedSingle" || technique === "hiddenSingle";
}

// MARK: - Grades

export const GRADES = [
  { name: "Débutant", threshold: 0, motto: "Toute grille commence par une case." },
  { name: "Apprenti", threshold: 400, motto: "Voir une case libre, c'est déjà raisonner." },
  { name: "Praticien", threshold: 1600, motto: "Les motifs simples n'ont plus de secret." },
  { name: "Analyste", threshold: 4800, motto: "Un candidat verrouillé ne passe plus inaperçu." },
  { name: "Tacticien", threshold: 12000, motto: "Les sous-ensembles se lisent d'un coup d'œil." },
  { name: "Stratège", threshold: 28000, motto: "Le regard porte sur toute la grille à la fois." },
  { name: "Maître", threshold: 60000, motto: "Aucun raisonnement de cette app ne vous échappe." },
];

export function gradeFor(points) {
  let index = 0;
  for (let i = 0; i < GRADES.length; i++) if (points >= GRADES[i].threshold) index = i;
  return index;
}

/** Part parcourue vers le grade suivant, entre 0 et 1. */
export function gradeProgress(points) {
  const i = gradeFor(points);
  if (i === GRADES.length - 1) return 1;
  const from = GRADES[i].threshold;
  const to = GRADES[i + 1].threshold;
  return Math.max(0, Math.min(1, (points - from) / (to - from)));
}

// MARK: - Mémoire durable

const STORE_KEY = "sudoku.progress";
const GAME_KEY = "sudoku.partie";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible : la partie reste jouable, elle ne survivra pas */
  }
}

export const Progress = {
  data: readJSON(STORE_KEY, {
    quarters: 0,
    byTechnique: {},
    soloByTechnique: {},
    played: [],
    dailyDone: [],
  }),

  save() {
    writeJSON(STORE_KEY, this.data);
  },

  get points() {
    // Le barème est multiplié par quatre pour rester entier en toute
    // circonstance : un quart de singleton nu vaudrait 0,25 point, et diviser
    // ici annulerait les petites techniques. Un singleton nu vaut donc 4.
    return this.data.quarters;
  },

  record(technique, quarters, unaided) {
    this.data.quarters += quarters;
    this.data.byTechnique[technique] = (this.data.byTechnique[technique] ?? 0) + quarters;
    if (unaided) {
      this.data.soloByTechnique[technique] = (this.data.soloByTechnique[technique] ?? 0) + 1;
    }
    this.save();
  },

  /** Combien de fois ce raisonnement a été franchi sans aide. */
  masteryOf(technique) {
    return this.data.soloByTechnique[technique] ?? 0;
  },

  markPlayed(index) {
    if (!this.data.played.includes(index)) {
      this.data.played.push(index);
      this.save();
    }
  },

  reset() {
    this.data = { quarters: 0, byTechnique: {}, soloByTechnique: {}, played: [], dailyDone: [] };
    this.save();
  },
};

// MARK: - Défi quotidien
//
// La grille est calculée à partir de la date, et non tirée au sort : tous les
// joueurs ont la même, sans serveur ni compte.

const WEEK_CYCLE = ["facile", "moyen", "difficile", "moyen", "expert", "difficile", "diabolique"];

export function dayNumber(date = new Date()) {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor(utc / 86400000);
}

export function dailyLevel(day = dayNumber()) {
  return WEEK_CYCLE[((day % 7) + 7) % 7];
}

export const Daily = {
  isDone(day = dayNumber()) {
    return Progress.data.dailyDone.includes(day);
  },
  markDone(day = dayNumber()) {
    if (!this.isDone(day)) {
      Progress.data.dailyDone.push(day);
      Progress.save();
    }
  },
  /**
   * La série en cours.
   *
   * Le défi du jour non encore fait ne rompt pas la série : c'est hier qui
   * compte. Sinon la série s'effondrerait chaque matin au réveil.
   */
  get streak() {
    const done = new Set(Progress.data.dailyDone);
    const today = dayNumber();
    let day = done.has(today) ? today : today - 1;
    let n = 0;
    while (done.has(day)) {
      n++;
      day--;
    }
    return n;
  },
};

// MARK: - Bibliothèque de grilles

export const Library = {
  records: [],

  load(records) {
    this.records = records;
  },

  /** Une grille du niveau demandé, en évitant celles déjà jouées. */
  pick(level) {
    const wanted = DIFFICULTIES.indexOf(level);
    const pool = this.records
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.difficulty === wanted);
    if (pool.length === 0) return null;

    const played = new Set(Progress.data.played);
    let fresh = pool.filter(({ i }) => !played.has(i));
    // Stock épuisé : on repart du début plutôt que de refuser de jouer.
    if (fresh.length === 0) {
      Progress.data.played = Progress.data.played.filter(
        (i) => this.records[i]?.difficulty !== wanted
      );
      Progress.save();
      fresh = pool;
    }

    const chosen = fresh[Math.floor(Math.random() * fresh.length)];
    Progress.markPlayed(chosen.i);
    return chosen.r;
  },

  /** La grille du jour : indexée par la date, donc identique pour tous. */
  daily(day = dayNumber()) {
    const level = dailyLevel(day);
    const wanted = DIFFICULTIES.indexOf(level);
    const pool = this.records.filter((r) => r.difficulty === wanted);
    if (pool.length === 0) return null;
    // Le décalage par niveau évite que deux jours du même niveau se suivent
    // sur la même grille.
    const offset = wanted * 37;
    return pool[(day + offset) % pool.length];
  },
};

// MARK: - La partie

export class Game {
  constructor(record, options = {}) {
    this.puzzle = Board.parse(record.puzzle);
    this.solutionText = record.solution;
    this.difficulty = DIFFICULTIES[record.difficulty];
    this.dailyDay = options.dailyDay ?? null;

    this.entries = new Array(81).fill(0);
    this.notes = new Array(81).fill(0);
    this.eliminated = new Array(81).fill(0);

    this.selection = null;
    this.noteMode = false;
    this.autoCandidates = false;
    this.candidatesSeenThisPass = false;

    this.history = [];
    this.elapsed = 0;
    this.mistakes = 0;
    this.hintsUsed = 0;

    this.gameQuarters = 0;
    this.quartersByTechnique = {};
    this.solo = {};
    this.assisted = {};
    this.assistance = "none";
    this.lastGain = null;

    this.board = this.puzzle.clone();
    this.refreshBoard();
    this.currentObstacle = nextStep(this.board)?.technique ?? null;
    this.lastSignature = this.signature;
  }

  // MARK: État dérivé

  get isGiven() {
    return (cell) => this.puzzle.values[cell] !== 0;
  }

  valueAt(cell) {
    return this.puzzle.values[cell] || this.entries[cell];
  }

  solutionAt(cell) {
    const ch = this.solutionText[cell];
    return ch === "." ? 0 : Number(ch);
  }

  isWrong(cell) {
    return this.entries[cell] !== 0 && this.entries[cell] !== this.solutionAt(cell);
  }

  get hasMistakes() {
    for (let c = 0; c < 81; c++) if (this.isWrong(c)) return true;
    return false;
  }

  get isComplete() {
    for (let c = 0; c < 81; c++) {
      if (this.valueAt(c) === 0 || this.valueAt(c) !== this.solutionAt(c)) return false;
    }
    return true;
  }

  /** Combien de fois ce chiffre reste à poser. */
  remaining(digit) {
    let n = 0;
    for (let c = 0; c < 81; c++) if (this.valueAt(c) === digit) n++;
    return 9 - n;
  }

  /** Les marques affichées dans une case : notes manuelles ou candidats auto. */
  marksAt(cell) {
    if (!this.autoCandidates) return this.notes[cell];
    if (this.valueAt(cell) !== 0) return 0;
    return this.board.candidates[cell] & ~this.eliminated[cell] & ALL;
  }

  get signature() {
    return this.board.values.join("");
  }

  // MARK: Reconstruction

  /**
   * Recalcule les candidats depuis les chiffres posés.
   *
   * Les éliminations obtenues par raisonnement sont réinjectées : sans cela,
   * chaque coup les effacerait et le joueur resterait bloqué devant le même
   * indice indéfiniment.
   */
  refreshBoard() {
    const board = this.puzzle.clone();
    for (let c = 0; c < 81; c++) {
      if (this.entries[c] !== 0 && board.values[c] === 0) board.place(this.entries[c], c);
    }
    for (let c = 0; c < 81; c++) {
      if (board.values[c] === 0 && this.eliminated[c] !== 0) {
        board.eliminate(this.eliminated[c], c);
      }
    }
    this.board = board;
  }

  // MARK: Coups

  snapshot() {
    this.history.push({
      entries: [...this.entries],
      notes: [...this.notes],
      eliminated: [...this.eliminated],
    });
    if (this.history.length > 200) this.history.shift();
  }

  select(cell) {
    this.selection = cell;
  }

  enter(digit) {
    const cell = this.selection;
    if (cell === null || this.puzzle.values[cell] !== 0) return;

    this.snapshot();

    if (this.noteMode) {
      this.notes[cell] ^= maskOf(digit);
      this.persist();
      return;
    }

    if (this.entries[cell] === digit) {
      this.entries[cell] = 0;
    } else {
      this.entries[cell] = digit;
      this.notes[cell] = 0;
      if (digit === this.solutionAt(cell)) {
        // Un chiffre juste rend caduques les notes des voisins.
        for (const peer of Geometry.peers[cell]) this.notes[peer] &= ~maskOf(digit);
      } else {
        this.mistakes++;
      }
    }
    this.finishMove();
  }

  erase() {
    const cell = this.selection;
    if (cell === null || this.puzzle.values[cell] !== 0) return;
    this.snapshot();
    this.entries[cell] = 0;
    this.notes[cell] = 0;
    this.finishMove();
  }

  undo() {
    const last = this.history.pop();
    if (!last) return;
    this.entries = last.entries;
    this.notes = last.notes;
    this.eliminated = last.eliminated;
    this.refreshBoard();
    this.hint = null;
    this.persist();
  }

  toggleNotes() {
    this.noteMode = !this.noteMode;
  }

  toggleCandidates() {
    this.autoCandidates = !this.autoCandidates;
    if (this.autoCandidates) this.candidatesSeenThisPass = true;
    this.persist();
  }

  finishMove() {
    this.refreshBoard();
    this.hint = null;
    this.creditProgress();
    if (this.isComplete) {
      clearSaved();
      if (this.dailyDay !== null) Daily.markDone(this.dailyDay);
    } else {
      this.persist();
    }
  }

  // MARK: Mérite

  /**
   * Part du mérite conservée sur ce passage, sur quatre.
   *
   * Les candidats automatiques font le balayage : regarder la ligne, la
   * colonne, le bloc, et barrer. C'est un inventaire, pas un raisonnement — et
   * il n'achève qu'une chose, la recherche des singletons. Une case à un seul
   * candidat restant, un chiffre à une seule place libre : il n'y a plus rien à
   * voir, la réponse est déjà écrite à l'écran.
   *
   * Les onze autres techniques ne perdent rien. Une grille entièrement annotée
   * ne dit pas où est le X-Wing, ni quelle paire est nue : elle fournit le
   * matériau, le travail reste entier.
   */
  shareFor(technique) {
    if (this.candidatesSeenThisPass && isSolvedByCandidates(technique)) return 0;
    return ASSISTANCE[this.assistance];
  }

  /**
   * Crédite l'obstacle qui vient d'être franchi, puis mesure le suivant.
   *
   * Ce qui est crédité, c'est l'obstacle d'avant le coup. Le moteur garantit
   * qu'à cet instant aucune technique moins coûteuse ne s'appliquait ailleurs :
   * avancer supposait donc réellement de voir celle-là.
   *
   * Une saisie fausse ne crédite rien et ne remet rien à zéro — le joueur n'a
   * pas franchi le passage, il est toujours devant.
   */
  creditProgress() {
    if (this.hasMistakes) return;

    const advanced = this.signature !== this.lastSignature;
    if (this.currentObstacle && advanced) {
      const technique = this.currentObstacle;
      const share = this.shareFor(technique);
      const earned = COST[technique] * share;
      const unaided = share === ASSISTANCE.none;

      const before = this.gameQuarters;
      this.gameQuarters += earned;
      const gain = this.gameQuarters - before;
      this.lastGain = gain > 0 ? gain : null;

      this.quartersByTechnique[technique] = (this.quartersByTechnique[technique] ?? 0) + earned;
      if (unaided) this.solo[technique] = (this.solo[technique] ?? 0) + 1;
      else this.assisted[technique] = (this.assisted[technique] ?? 0) + 1;

      Progress.record(technique, earned, unaided);

      this.assistance = "none";
      this.candidatesSeenThisPass = this.autoCandidates;
    }

    this.currentObstacle = nextStep(this.board)?.technique ?? null;
    this.lastSignature = this.signature;
  }

  get gamePoints() {
    return this.gameQuarters;
  }

  /** Le détail de la partie, du raisonnement le plus exigeant au plus simple. */
  get breakdown() {
    const rows = [];
    for (const t of Object.keys(COST)) {
      const solo = this.solo[t] ?? 0;
      const assisted = this.assisted[t] ?? 0;
      if (solo === 0 && assisted === 0) continue;
      rows.push({
        technique: t,
        solo,
        assisted,
        points: this.quartersByTechnique[t] ?? 0,
      });
    }
    return rows.sort((a, b) => COST[b.technique] - COST[a.technique]);
  }

  // MARK: Indices

  /** Fait avancer l'aide d'un cran, et la facture au passage. */
  askForHint() {
    const deduction = nextStep(this.board);
    if (!deduction) {
      this.hint = null;
      this.hintMessage = this.hasMistakes
        ? "Une saisie est fausse : le raisonnement ne peut plus avancer."
        : "Aucun raisonnement connu ne s'applique ici.";
      return;
    }

    if (!this.hint || this.hint.deduction.technique !== deduction.technique) {
      this.hint = { deduction, stage: "named" };
      this.hintsUsed++;
      if (this.assistance === "none") this.assistance = "named";
      return;
    }

    if (this.hint.stage === "named") {
      this.hint.stage = "located";
      if (ASSISTANCE[this.assistance] > ASSISTANCE.located) this.assistance = "located";
    } else if (this.hint.stage === "located") {
      this.hint.stage = "explained";
      this.assistance = "given";
    }
  }

  /** Applique la déduction affichée. Le passage ne rapporte alors plus rien. */
  applyHint() {
    if (!this.hint) return;
    this.snapshot();
    this.assistance = "given";
    const deduction = this.hint.deduction;
    for (const action of deduction.actions) {
      if (action.kind === "place") this.entries[action.cell] = action.digit;
      else this.eliminated[action.cell] |= action.digits;
    }
    this.finishMove();
  }

  dismissHint() {
    this.hint = null;
    this.hintMessage = null;
  }

  // MARK: Sauvegarde

  get saved() {
    return {
      puzzle: this.puzzle.compact,
      solution: this.solutionText,
      difficulty: DIFFICULTIES.indexOf(this.difficulty),
      entries: this.entries,
      notes: this.notes,
      eliminated: this.eliminated,
      autoCandidates: this.autoCandidates,
      elapsed: this.elapsed,
      mistakes: this.mistakes,
      hintsUsed: this.hintsUsed,
      gameQuarters: this.gameQuarters,
      quartersByTechnique: this.quartersByTechnique,
      solo: this.solo,
      assisted: this.assisted,
      dailyDay: this.dailyDay,
    };
  }

  persist() {
    if (this.isComplete) return;
    writeJSON(GAME_KEY, this.saved);
  }

  static restore() {
    const s = readJSON(GAME_KEY, null);
    if (!s || !s.puzzle || !s.solution) return null;
    try {
      const game = new Game(
        { puzzle: s.puzzle, solution: s.solution, difficulty: s.difficulty },
        { dailyDay: s.dailyDay ?? null }
      );
      game.entries = s.entries ?? game.entries;
      game.notes = s.notes ?? game.notes;
      game.eliminated = s.eliminated ?? game.eliminated;
      game.autoCandidates = !!s.autoCandidates;
      game.candidatesSeenThisPass = !!s.autoCandidates;
      game.elapsed = s.elapsed ?? 0;
      game.mistakes = s.mistakes ?? 0;
      game.hintsUsed = s.hintsUsed ?? 0;
      game.gameQuarters = s.gameQuarters ?? 0;
      game.quartersByTechnique = s.quartersByTechnique ?? {};
      game.solo = s.solo ?? {};
      game.assisted = s.assisted ?? {};
      game.refreshBoard();
      game.currentObstacle = nextStep(game.board)?.technique ?? null;
      game.lastSignature = game.signature;
      return game;
    } catch {
      return null;
    }
  }
}

export function hasSaved() {
  return readJSON(GAME_KEY, null) !== null;
}

export function clearSaved() {
  try {
    localStorage.removeItem(GAME_KEY);
  } catch {
    /* rien à faire */
  }
}

export function formatTime(seconds) {
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export { DISPLAY_NAME, DIFFICULTY_NAME, DIFFICULTIES, COST, digitsOf, hasDigit, countBits };
