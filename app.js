// L'interface. Un seul écran à la fois, redessiné entièrement à chaque
// changement : la grille est petite, et un rendu complet coûte moins cher à
// comprendre qu'une mise à jour ciblée.

import {
  Board,
  Geometry,
  TECHNIQUES,
  COST,
  DISPLAY_NAME,
  PRINCIPLE,
  DIFFICULTIES,
  DIFFICULTY_NAME,
  digitsOf,
  hasDigit,
  countBits,
  ALL,
  nextStep as moteurNextStep,
} from "./engine.js";

import {
  Game,
  Library,
  Progress,
  Daily,
  GRADES,
  gradeFor,
  gradeProgress,
  dayNumber,
  dailyLevel,
  hasSaved,
  hasSavedDaily,
  clearSaved,
  formatTime,
  ASSISTANCE,
  isSolvedByCandidates,
} from "./game.js";

import { installerMesure, noter } from "./mesure.js";

const app = document.getElementById("app");

const state = {
  screen: "home", // home | game | techniques | technique | grades
  game: null,
  technique: null,
  exampleIndex: 0,
  showPattern: false,
  showLesson: false,
  hintOpen: false,
  panel: null, // null | "settings" | "confirm-candidates" | "confirm-hint" | "confirm-new"
  pendingLevel: null,
  result: null,
};

let examples = [];
let timer = null;

// MARK: - Démarrage

async function boot() {
  try {
    const [puzzles, exs] = await Promise.all([
      fetch("puzzles.json").then((r) => r.json()),
      fetch("examples.json").then((r) => r.json()),
    ]);
    Library.load(puzzles);
    examples = exs;
  } catch {
    app.innerHTML =
      '<p style="padding:40px 12px;font-family:Georgia,serif;line-height:1.6">' +
      "Les fichiers de grilles n'ont pas pu être chargés. Si vous ouvrez cette page " +
      "directement depuis le disque, votre navigateur bloque la lecture des fichiers " +
      "voisins : il faut passer par un serveur, même local.</p>";
    return;
  }
  installerMesure();
  render();
}

// MARK: - Utilitaires de rendu

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function toast(message) {
  const node = el(`<div class="toast">${message}</div>`);
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

function vibrate(ms = 8) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

// MARK: - Emblèmes de grade
//
// Dessinés, jamais empruntés à une bibliothèque d'icônes : la progression se
// lit dans la figure elle-même, du point unique à la grille complète.

function emblem(index, size = 34) {
  const amber = "var(--premise)";
  const ink = index === 6 ? "var(--target)" : amber;
  const s = size;
  const c = s / 2;
  const shapes = [
    `<circle cx="${c}" cy="${c}" r="3" fill="${ink}"/>`,
    `<circle cx="${c - 5}" cy="${c}" r="3" fill="${ink}"/><circle cx="${c + 5}" cy="${c}" r="3" fill="${ink}"/>`,
    `<path d="M${c - 7} ${c + 6} L${c} ${c - 7} L${c + 7} ${c + 6}" fill="none" stroke="${ink}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<rect x="${c - 7}" y="${c - 7}" width="14" height="14" fill="none" stroke="${ink}" stroke-width="2.5" rx="2"/>`,
    `<path d="M${c - 7} ${c - 7} L${c + 7} ${c + 7} M${c + 7} ${c - 7} L${c - 7} ${c + 7}" stroke="${ink}" stroke-width="2.5" stroke-linecap="round"/>`,
    `<rect x="${c - 9}" y="${c - 6}" width="18" height="12" fill="none" stroke="${ink}" stroke-width="2.5" rx="2"/><circle cx="${c - 9}" cy="${c - 6}" r="2.2" fill="${ink}"/><circle cx="${c + 9}" cy="${c + 6}" r="2.2" fill="${ink}"/>`,
    `<g stroke="${ink}" stroke-width="1.8"><rect x="${c - 9}" y="${c - 9}" width="18" height="18" fill="none" rx="2"/><path d="M${c - 3} ${c - 9} V${c + 9} M${c + 3} ${c - 9} V${c + 9} M${c - 9} ${c - 3} H${c + 9} M${c - 9} ${c + 3} H${c + 9}"/></g>`,
  ];
  return `<svg class="emblem" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${shapes[index]}</svg>`;
}

// MARK: - Accueil

function renderHome() {
  const points = Progress.points;
  const gi = gradeFor(points);
  const grade = GRADES[gi];
  const day = dayNumber();
  const doneToday = Daily.isDone(day);
  const streak = Daily.streak;

  const screen = el(`<div class="screen"></div>`);

  screen.appendChild(
    el(`<div class="brand">
      <h1>Sudophile</h1>
      <p>Un indice ne donne pas un chiffre.<br />Il nomme un raisonnement.</p>
    </div>`)
  );

  const banner = el(`<button class="grade-banner">
    ${emblem(gi)}
    <div style="flex:1">
      <div class="rank">${grade.name}</div>
      <div class="points">${points.toLocaleString("fr-FR")} point${points > 1 ? "s" : ""} de raisonnement</div>
      <div class="progress-track"><div class="progress-fill" style="width:${(gradeProgress(points) * 100).toFixed(0)}%"></div></div>
    </div>
  </button>`);
  banner.onclick = () => go("grades");
  screen.appendChild(banner);

  const enCours = !doneToday && hasSavedDaily(day);
  const score = Daily.scoreOf(day);

  const daily = el(`<button class="daily ${doneToday ? "done" : ""}">
    <div style="flex:1">
      <div class="label">Défi du jour</div>
      <div class="title">${DIFFICULTY_NAME[dailyLevel(day)]}${
        doneToday ? " — terminé" : enCours ? " — en cours" : ""
      }</div>
      ${
        doneToday && score !== null
          ? `<div class="streak">${score} point${score > 1 ? "s" : ""} de raisonnement</div>`
          : streak > 0
            ? `<div class="streak">Série de ${streak} jour${streak > 1 ? "s" : ""}</div>`
            : ""
      }
    </div>
    <div style="font-size:22px">${doneToday ? "✓" : enCours ? "↺" : "→"}</div>
  </button>`);

  // Un défi terminé ne se rejoue pas : la grille est la même pour tout le
  // monde, et la recommencer permettrait d'encaisser deux fois les mêmes
  // raisonnements. La carte devient un simple constat.
  if (doneToday) {
    daily.disabled = true;
  } else {
    daily.onclick = () => startDaily();
  }
  screen.appendChild(daily);

  if (hasSaved()) {
    const resume = el(`<button class="wide-button">Reprendre la partie en cours</button>`);
    resume.onclick = () => {
      const game = Game.restore();
      if (!game) {
        toast("La partie sauvegardée est illisible.");
        clearSaved();
        render();
        return;
      }
      state.game = game;
      go("game");
    };
    screen.appendChild(resume);
  }

  screen.appendChild(el(`<div class="section-title">Nouvelle partie</div>`));

  const levels = el(`<div class="levels"></div>`);
  for (const level of DIFFICULTIES) {
    const count = Library.records.filter(
      (r) => r.difficulty === DIFFICULTIES.indexOf(level)
    ).length;
    const button = el(`<button class="level">
      <span class="name">${DIFFICULTY_NAME[level]}</span>
      <span class="meta">${describeLevel(level)}</span>
    </button>`);
    button.disabled = count === 0;
    button.onclick = () => {
      // Une partie libre en cours serait écrasée sans retour possible : on
      // prévient avant, jamais après.
      if (hasSaved()) {
        state.pendingLevel = level;
        state.panel = "confirm-new";
        render();
        return;
      }
      startNew(level);
    };
    levels.appendChild(button);
  }
  screen.appendChild(levels);

  const tech = el(`<button class="ghost-button">Les treize raisonnements</button>`);
  tech.onclick = () => {
    noter("fiches-ouvertes");
    go("techniques");
  };
  screen.appendChild(tech);

  // Une ligne, en bas, hors du chemin. Qui veut savoir trouve ; qui veut jouer
  // n'est pas retenu.
  const legal = el(
    `<button class="footnote">Fréquentation mesurée anonymement — en savoir plus</button>`
  );
  legal.onclick = () => {
    state.panel = "mesure";
    render();
  };
  screen.appendChild(legal);

  return screen;
}

/** Ce que chaque niveau demande de connaître — la vraie information utile. */
function describeLevel(level) {
  switch (level) {
    case "facile": return "singletons";
    case "moyen": return "singletons cachés";
    case "difficile": return "candidats verrouillés";
    case "expert": return "sous-ensembles";
    default: return "X-Wing, XY-Wing, Swordfish";
  }
}

function startNew(level) {
  const record = Library.pick(level);
  if (!record) {
    toast("Aucune grille de ce niveau en stock.");
    return;
  }
  state.game = new Game(record);
  noter(`partie-commencee-${level}`);
  go("game");
}

function startDaily() {
  const day = dayNumber();

  if (Daily.isDone(day)) {
    toast("Le défi du jour est déjà terminé.");
    return;
  }

  // Une partie entamée se reprend là où elle en était.
  if (hasSavedDaily(day)) {
    const reprise = Game.restore("defi");
    if (reprise) {
      state.game = reprise;
      go("game");
      return;
    }
  }

  const record = Library.daily(day);
  if (!record) {
    toast("Le défi du jour est indisponible.");
    return;
  }
  state.game = new Game(record, { dailyDay: day });
  noter("defi-commence");
  go("game");
}

// MARK: - Grille

function renderGrid(game, options = {}) {
  const { readonly = false, marks = null, units = null, board = null } = options;
  const source = board ?? game.board;
  const wrap = el(`<div class="grid-wrap"></div>`);
  const grid = el(`<div class="grid"></div>`);

  const selection = game ? game.selection : null;
  const selectedValue = selection !== null && game ? game.valueAt(selection) : 0;

  const markByCell = new Map();
  if (marks) for (const m of marks) markByCell.set(m.cell, m);
  const unitCells = new Set();
  if (units) for (const u of units) for (const c of Geometry.units[u]) unitCells.add(c);

  for (let cell = 0; cell < 81; cell++) {
    const classes = ["cell"];
    if ((cell % 9) % 3 === 2 && cell % 9 !== 8) classes.push("edge-r");
    if (Math.floor(cell / 9) % 3 === 2 && cell < 72) classes.push("edge-b");

    const value = game ? game.valueAt(cell) : source.values[cell];
    const given = game ? game.puzzle.values[cell] !== 0 : source.values[cell] !== 0;

    if (given) classes.push("given");
    if (game && game.isWrong(cell)) classes.push("wrong");

    if (!readonly && selection !== null) {
      if (cell === selection) classes.push("selected");
      else if (Geometry.peerSets[selection].has(cell)) classes.push("related");
      else if (selectedValue !== 0 && game.valueAt(cell) === selectedValue) classes.push("twin");
    }

    if (unitCells.has(cell)) classes.push("unit");
    const mark = markByCell.get(cell);
    if (mark) classes.push(mark.role);

    const node = el(`<div class="${classes.join(" ")}"></div>`);

    if (value !== 0) {
      node.textContent = String(value);
    } else {
      const shown = game ? game.marksAt(cell) : source.candidates[cell];
      if (shown) {
        const notes = el(`<div class="notes"></div>`);
        for (let d = 1; d <= 9; d++) {
          const on = hasDigit(shown, d);
          let cls = "";
          // Les marques pédagogiques priment : elles portent un sens précis, et
          // l'écho du chiffre sélectionné n'est qu'un confort de lecture.
          if (mark && hasDigit(mark.digits, d)) cls = mark.role === "target" ? "cut" : "lit";
          else if (on && d === selectedValue) cls = "echo";
          notes.appendChild(el(`<span class="${cls}">${on ? d : ""}</span>`));
        }
        node.appendChild(notes);
      }
    }

    if (!readonly) {
      node.onclick = () => {
        game.select(cell);
        vibrate(5);
        render();
      };
    }

    grid.appendChild(node);
  }

  wrap.appendChild(grid);
  return wrap;
}

// MARK: - Écran de jeu

function renderGame() {
  const game = state.game;
  const screen = el(`<div class="screen"></div>`);

  // En-tête
  const header = el(`<div class="game-header"></div>`);
  const back = el(`<button class="icon-button">‹</button>`);
  back.onclick = () => {
    game.persist();
    // Le point d'abandon est l'information la plus utile : elle dit où le jeu
    // décroche, ce qu'aucun compteur de visites ne montre.
    noter(`partie-quittee-${DIFFICULTY_NAME[game.difficulty].toLowerCase()}`);
    go("home");
  };
  header.appendChild(back);

  header.appendChild(
    el(`<div class="header-info">
      <div class="level-name">${DIFFICULTY_NAME[game.difficulty]}</div>
      <div class="sub">${
        game.autoCandidates
          ? "Candidats affichés"
          : game.dailyDay !== null
            ? "Défi du jour"
            : describeLevel(game.difficulty)
      }</div>
    </div>`)
  );

  // Le gain est une notification ponctuelle : on la consomme en l'affichant.
  // Sans cela, elle restait posée sur l'état et chaque nouveau rendu relançait
  // l'animation — poser une note ou toucher une case suffisait à la rejouer,
  // en annonçant des points qui n'avaient pas été gagnés.
  const gain = game.lastGain;
  game.lastGain = null;

  header.appendChild(
    el(`<div class="header-stats">
      <div class="score">${game.gamePoints}${
        gain ? ` <span class="gain">+${gain}</span>` : ""
      }</div>
      <div>${formatTime(game.elapsed)}</div>
    </div>`)
  );

  const settings = el(
    `<button class="icon-button ${game.autoCandidates ? "on" : ""}">⚙</button>`
  );
  settings.onclick = () => {
    state.panel = "settings";
    render();
  };
  header.appendChild(settings);

  screen.appendChild(header);

  // Grille, avec les marques de l'indice si le palier les autorise
  const hint = game.hint;
  const showMarks = hint && (hint.stage === "located" || hint.stage === "explained");
  screen.appendChild(
    renderGrid(game, {
      marks: showMarks ? hint.deduction.highlights : null,
      units: showMarks ? hint.deduction.units : null,
    })
  );

  // Carte d'indice
  if (hint) screen.appendChild(renderHintCard(game, hint));
  else if (game.hintMessage) {
    const card = el(`<div class="hint"><div class="body">${game.hintMessage}</div></div>`);
    screen.appendChild(card);
  }

  // Commandes
  screen.appendChild(renderControls(game));

  return screen;
}

function renderHintCard(game, hint) {
  const technique = hint.deduction.technique;
  const card = el(`<div class="hint"></div>`);
  card.appendChild(el(`<h3>${DISPLAY_NAME[technique]}</h3>`));

  const text =
    hint.stage === "explained"
      ? hint.deduction.explanation
      : PRINCIPLE[technique];

  const body = el(`<div class="body ${state.hintOpen ? "open" : ""}">${text}</div>`);
  card.appendChild(body);

  // Ce que ce passage vaut encore. Annoncé avant l'appui, jamais après : le
  // joueur doit pouvoir choisir en connaissance de cause.
  const neutralised = game.candidatesSeenThisPass && isSolvedByCandidates(technique);
  const worth = COST[technique] * game.shareFor(technique);
  card.appendChild(
    el(`<div class="worth">${
      neutralised
        ? "Les candidats affichés résolvent ce passage : il ne rapporte pas."
        : worth === 0
          ? "Ce passage ne rapporte plus de points."
          : `Ce passage vaut encore ${worth} point${worth > 1 ? "s" : ""}.`
    }</div>`)
  );

  const row = el(`<div class="row"></div>`);

  if (hint.stage !== "explained") {
    const apres = hint.stage === "named" ? ASSISTANCE.located : ASSISTANCE.given;
    const reste = neutralised ? 0 : COST[technique] * apres;
    const label =
      (hint.stage === "named" ? "Me montrer où" : "M'expliquer") +
      (reste > 0 ? ` — ${reste} pts` : " — 0 pt");
    const next = el(`<button class="primary">${label}</button>`);
    next.onclick = () => {
      game.askForHint();
      render();
    };
    row.appendChild(next);
  } else {
    const apply = el(`<button class="primary">Appliquer</button>`);
    apply.onclick = () => {
      game.applyHint();
      state.hintOpen = false;
      render();
    };
    row.appendChild(apply);
  }

  const toggle = el(`<button class="secondary">${state.hintOpen ? "Replier" : "Tout lire"}</button>`);
  toggle.onclick = () => {
    state.hintOpen = !state.hintOpen;
    render();
  };
  row.appendChild(toggle);

  const close = el(`<button class="secondary">Fermer</button>`);
  close.onclick = () => {
    game.dismissHint();
    state.hintOpen = false;
    render();
  };
  row.appendChild(close);

  card.appendChild(row);
  return card;
}

function renderControls(game) {
  const controls = el(`<div class="controls"></div>`);

  const actions = el(`<div class="actions"></div>`);

  const undo = el(`<div class="action"><span class="glyph">↺</span>Annuler</div>`);
  undo.onclick = () => {
    game.undo();
    render();
  };
  actions.appendChild(undo);

  const erase = el(`<div class="action"><span class="glyph">⌫</span>Effacer</div>`);
  erase.onclick = () => {
    game.erase();
    render();
  };
  actions.appendChild(erase);

  const notes = el(
    `<div class="action ${game.noteMode ? "on" : ""}"><span class="glyph">✎</span>Notes</div>`
  );
  notes.onclick = () => {
    game.toggleNotes();
    vibrate();
    render();
  };
  actions.appendChild(notes);

  const hint = el(`<div class="action teach"><span class="glyph">◆</span>Indice</div>`);
  hint.onclick = () => {
    // Le premier palier coûte la moitié du passage : le joueur doit le savoir
    // avant d'appuyer, pas après. Les paliers suivants annoncent leur prix sur
    // le bouton lui-même, la carte étant déjà ouverte.
    if (!game.hint) {
      state.panel = "confirm-hint";
      render();
      return;
    }
    game.askForHint();
    if (game.hint) noter(`indice-${game.hint.stage}`);
    render();
  };
  actions.appendChild(hint);

  controls.appendChild(actions);

  const pad = el(`<div class="pad"></div>`);
  for (let d = 1; d <= 9; d++) {
    const spent = game.remaining(d) === 0;
    const button = el(`<button class="${spent ? "spent" : ""}">${d}</button>`);
    button.onclick = () => {
      game.enter(d);
      vibrate();
      if (game.isComplete) finish(game);
      else render();
    };
    pad.appendChild(button);
  }
  controls.appendChild(pad);

  return controls;
}

// MARK: - Fin de partie

function finish(game) {
  stopTimer();
  noter(`partie-terminee-${game.difficulty}`);
  state.result = {
    points: game.gamePoints,
    time: formatTime(game.elapsed),
    breakdown: game.breakdown,
    daily: game.dailyDay !== null,
    streak: Daily.streak,
    grade: gradeFor(Progress.points),
  };
  render();
}

function renderResult() {
  const r = state.result;
  const overlay = el(`<div class="overlay"></div>`);
  const card = el(`<div class="result"></div>`);

  card.appendChild(el(`<h2>Grille terminée</h2>`));
  card.appendChild(
    el(`<div class="sub">${r.time}${
      r.daily && r.streak > 0 ? ` — série de ${r.streak} jour${r.streak > 1 ? "s" : ""}` : ""
    }</div>`)
  );

  card.appendChild(el(`<div class="total">${r.points}</div>`));
  card.appendChild(el(`<div class="total-label">points de raisonnement</div>`));

  const list = el(`<div class="breakdown"></div>`);
  for (const row of r.breakdown.slice(0, 5)) {
    const counts = [];
    if (row.solo > 0) counts.push(`${row.solo}× seul`);
    if (row.assisted > 0) counts.push(`${row.assisted}× aidé`);
    list.appendChild(
      el(`<div class="break-row">
        <span class="bt">${DISPLAY_NAME[row.technique]}</span>
        <span class="bc">${counts.join(", ")}</span>
        <span class="bp">${row.points}</span>
      </div>`)
    );
  }
  card.appendChild(list);

  const again = el(`<button class="wide-button">Retour à l'accueil</button>`);
  again.onclick = () => {
    state.result = null;
    state.game = null;
    go("home");
  };
  card.appendChild(again);

  overlay.appendChild(card);
  return overlay;
}

// MARK: - Les treize raisonnements

function renderTechniques() {
  const screen = el(`<div class="screen"></div>`);
  const bar = el(`<div class="top-bar"></div>`);
  const back = el(`<button class="icon-button">‹</button>`);
  back.onclick = () => go("home");
  bar.appendChild(back);
  bar.appendChild(el(`<h2>Les treize raisonnements</h2>`));
  screen.appendChild(bar);

  screen.appendChild(
    el(`<p class="principle" style="color:var(--slate)">Chaque fiche est illustrée par
      de vraies positions, extraites de vraies grilles à l'instant précis où le motif
      apparaît.</p>`)
  );

  const sorted = [...TECHNIQUES].sort((a, b) => COST[a] - COST[b]);
  for (const technique of sorted) {
    const mastery = Progress.masteryOf(technique);
    const row = el(`<button class="tech-row">
      <div style="flex:1">
        <div class="tname">${DISPLAY_NAME[technique]}</div>
        <div class="tmastery">${
          mastery === 0 ? "jamais trouvé seul" : `${mastery}× trouvé seul`
        }</div>
      </div>
      <span class="cost">${COST[technique] * 4} pts</span>
    </button>`);
    row.onclick = () => {
      state.technique = technique;
      state.exampleIndex = 0;
      state.showPattern = false;
      state.showLesson = false;
      go("technique");
    };
    screen.appendChild(row);
  }

  return screen;
}

function renderTechnique() {
  const technique = state.technique;
  const screen = el(`<div class="screen"></div>`);

  const bar = el(`<div class="top-bar"></div>`);
  const back = el(`<button class="icon-button">‹</button>`);
  back.onclick = () => go("techniques");
  bar.appendChild(back);
  bar.appendChild(el(`<h2>${DISPLAY_NAME[technique]}</h2>`));
  screen.appendChild(bar);

  screen.appendChild(el(`<div class="card"><div class="principle">${PRINCIPLE[technique]}</div></div>`));

  const mine = examples.filter((e) => e.technique === technique);
  if (mine.length === 0) {
    screen.appendChild(el(`<p class="lesson-text">Aucun exemple disponible pour ce motif.</p>`));
    return screen;
  }

  if (mine.length > 1) {
    const tabs = el(`<div class="example-tabs"></div>`);
    mine.forEach((_, i) => {
      const tab = el(
        `<button class="${i === state.exampleIndex ? "on" : ""}">Exemple ${i + 1}</button>`
      );
      tab.onclick = () => {
        state.exampleIndex = i;
        state.showPattern = false;
        state.showLesson = false;
        render();
      };
      tabs.appendChild(tab);
    });
    screen.appendChild(tabs);
  }

  const example = mine[Math.min(state.exampleIndex, mine.length - 1)];
  const board = boardFromExample(example);

  screen.appendChild(
    renderGrid(null, {
      readonly: true,
      board,
      marks: state.showPattern ? example.marks : null,
      units: state.showPattern ? example.units : null,
    })
  );

  const row = el(`<div class="row" style="display:flex;gap:8px"></div>`);
  if (!state.showPattern) {
    const show = el(`<button class="wide-button">Montrer le motif</button>`);
    show.onclick = () => {
      state.showPattern = true;
      render();
    };
    row.appendChild(show);
  } else if (!state.showLesson) {
    const explain = el(`<button class="wide-button">Expliquer</button>`);
    explain.onclick = () => {
      state.showLesson = true;
      render();
    };
    row.appendChild(explain);
  }
  screen.appendChild(row);

  if (state.showLesson) {
    screen.appendChild(el(`<div class="card"><div class="lesson-text">${example.explanation}</div></div>`));
  }

  return screen;
}

/**
 * Reconstruit la position d'un exemple.
 *
 * Les candidats sont repris tels quels, et non recalculés : la plupart des
 * motifs n'existent que sur des candidats déjà réduits par les étapes
 * antérieures. Repartir de l'énoncé donnerait une position où le motif est
 * absent.
 */
function boardFromExample(example) {
  const values = [...example.values].map((ch) => (ch === "." ? 0 : Number(ch)));
  const givens = new Set(values.map((v, i) => (v !== 0 ? i : -1)).filter((i) => i >= 0));
  return new Board(values, [...example.candidates], givens);
}

// MARK: - Grades

function renderGrades() {
  const points = Progress.points;
  const gi = gradeFor(points);
  const screen = el(`<div class="screen"></div>`);

  const bar = el(`<div class="top-bar"></div>`);
  const back = el(`<button class="icon-button">‹</button>`);
  back.onclick = () => go("home");
  bar.appendChild(back);
  bar.appendChild(el(`<h2>Votre grade</h2>`));
  screen.appendChild(bar);

  const card = el(`<div class="card" style="text-align:center"></div>`);
  card.appendChild(el(`<div>${emblem(gi, 64)}</div>`));
  card.appendChild(
    el(`<div style="font-size:22px;font-weight:600;margin-top:6px">${GRADES[gi].name}</div>`)
  );
  card.appendChild(el(`<p class="motto">« ${GRADES[gi].motto} »</p>`));
  card.appendChild(
    el(`<div class="progress-track" style="margin-top:14px"><div class="progress-fill" style="width:${(
      gradeProgress(points) * 100
    ).toFixed(0)}%"></div></div>`)
  );
  card.appendChild(
    el(`<div style="font-size:12px;color:var(--slate);margin-top:8px;font-family:var(--lesson)">${
      gi === GRADES.length - 1
        ? `${points.toLocaleString("fr-FR")} points`
        : `${points.toLocaleString("fr-FR")} / ${GRADES[gi + 1].threshold.toLocaleString("fr-FR")} vers ${GRADES[gi + 1].name}`
    }</div>`)
  );
  screen.appendChild(card);

  const list = el(`<div class="card"></div>`);
  GRADES.forEach((grade, i) => {
    list.appendChild(
      el(`<div class="grade-row ${i === gi ? "current" : ""} ${i > gi ? "locked" : ""}">
        ${emblem(i, 26)}
        <span class="rank-name">${grade.name}</span>
        <span class="rank-cost">${grade.threshold.toLocaleString("fr-FR")}</span>
      </div>`)
    );
  });
  screen.appendChild(list);

  screen.appendChild(
    el(`<p class="lesson-text" style="color:var(--slate);text-align:center">
      Les points comptent les raisonnements franchis, jamais la vitesse.
      Un motif trouvé seul vaut quatre fois un motif expliqué.</p>`)
  );

  return screen;
}


// MARK: - Panneaux
//
// Trois usages, un seul gabarit : un titre, un texte en serif, des issues
// explicites. Le texte dit toujours ce que la décision coûte, avant qu'elle
// soit prise — jamais après.

function renderPanel() {
  const game = state.game;
  const overlay = el(`<div class="overlay"></div>`);
  const card = el(`<div class="result panel"></div>`);

  const fermer = () => {
    state.panel = null;
    render();
  };
  overlay.onclick = (e) => {
    if (e.target === overlay) fermer();
  };

  if (state.panel === "settings") {
    card.appendChild(el(`<h2>Réglages</h2>`));
    card.appendChild(
      el(`<p class="lesson-text" style="color:var(--slate)">Ce qui touche au
        raisonnement se règle ici, à l'écart du jeu — pour qu'aucun de ces choix
        ne se fasse par un geste distrait.</p>`)
    );

    const ligne = el(`<div class="setting"></div>`);
    ligne.appendChild(
      el(`<div style="flex:1">
        <div class="setting-name">Candidats automatiques</div>
        <div class="setting-note">${
          game.autoCandidates ? "Activés" : "Désactivés"
        } — l'app fait le balayage à votre place.</div>
      </div>`)
    );
    const bouton = el(
      `<button class="pill ${game.autoCandidates ? "on" : ""}">${
        game.autoCandidates ? "Désactiver" : "Activer"
      }</button>`
    );
    bouton.onclick = () => {
      if (game.autoCandidates) {
        // Éteindre ne coûte rien : aucune confirmation à demander.
        game.toggleCandidates();
        state.panel = null;
      } else {
        state.panel = "confirm-candidates";
      }
      render();
    };
    ligne.appendChild(bouton);
    card.appendChild(ligne);

    const retour = el(`<button class="wide-button">Fermer</button>`);
    retour.onclick = fermer;
    card.appendChild(retour);
  }

  if (state.panel === "confirm-candidates") {
    card.appendChild(el(`<h2>Avant d'activer</h2>`));
    card.appendChild(
      el(`<div>
        <p class="lesson-text">Les candidats affichés font le balayage :
        regarder la ligne, la colonne, le bloc, et barrer. C'est un inventaire,
        pas un raisonnement.</p>
        <p class="lesson-text">Ils achèvent donc entièrement deux techniques — le
        singleton nu et le singleton caché. <strong>Ces passages ne rapporteront
        plus rien</strong> tant que les candidats resteront affichés.</p>
        <p class="lesson-text">Les onze autres gardent leur pleine valeur. Une
        grille annotée ne dit pas où est le X-Wing : sur les grilles difficiles,
        c'est un outil de travail, et vous n'y perdez presque rien.</p>
      </div>`)
    );

    const oui = el(`<button class="wide-button">Activer quand même</button>`);
    oui.onclick = () => {
      game.toggleCandidates();
      noter("candidats-actives");
      state.panel = null;
      render();
    };
    card.appendChild(oui);

    const non = el(`<button class="ghost-button" style="margin-top:8px">Annuler</button>`);
    non.onclick = () => {
      state.panel = "settings";
      render();
    };
    card.appendChild(non);
  }

  if (state.panel === "mesure") {
    card.appendChild(el(`<h2>Ce qui est mesuré</h2>`));
    card.appendChild(
      el(`<div>
        <p class="lesson-text">Ce site compte ses visites et quelques gestes de
        jeu : la partie lancée et son niveau, la partie terminée ou quittée, le
        recours à un indice, l'ouverture des fiches.</p>
        <p class="lesson-text">Ces relevés servent à une seule chose : savoir où
        le jeu décroche. Si une grille Difficile est commencée cent fois et
        terminée trois fois, quelque chose ne va pas — et sans ce chiffre, je ne
        peux pas le voir.</p>
        <p class="lesson-text"><strong>Aucune donnée personnelle n'est
        recueillie.</strong> Pas de nom, pas d'adresse électronique, pas de
        compte, pas de mouchard publicitaire, aucun suivi d'un site à l'autre.
        Les relevés sont anonymes et ne permettent pas de vous reconnaître d'une
        visite à la suivante.</p>
        <p class="lesson-text">Vos parties, vos points et vos réglages ne
        quittent jamais votre appareil : ils sont enregistrés dans votre
        navigateur, et personne d'autre que vous n'y a accès.</p>
        <p class="lesson-text">La mesure passe par GoatCounter, un service
        indépendant sans publicité. Si vous la bloquez, le jeu fonctionne
        exactement pareil.</p>
      </div>`)
    );
    const retour = el(`<button class="wide-button">Fermer</button>`);
    retour.onclick = fermer;
    card.appendChild(retour);
  }

  if (state.panel === "confirm-new") {
    const niveau = state.pendingLevel;
    card.appendChild(el(`<h2>Abandonner la partie en cours ?</h2>`));
    card.appendChild(
      el(`<div>
        <p class="lesson-text">Une partie est déjà commencée. En lancer une
        nouvelle l'effacera définitivement : la grille, les notes et le temps
        écoulé seront perdus.</p>
        <p class="lesson-text">Les points déjà gagnés, eux, restent acquis à
        votre compte — ils comptent des raisonnements franchis, et ceux-là ont
        bien eu lieu.</p>
      </div>`)
    );

    const oui = el(`<button class="wide-button">Lancer une ${DIFFICULTY_NAME[niveau]}</button>`);
    oui.onclick = () => {
      clearSaved();
      state.panel = null;
      state.pendingLevel = null;
      startNew(niveau);
    };
    card.appendChild(oui);

    const reprendre = el(
      `<button class="ghost-button" style="margin-top:8px">Reprendre la partie en cours</button>`
    );
    reprendre.onclick = () => {
      const partie = Game.restore();
      state.panel = null;
      state.pendingLevel = null;
      if (!partie) {
        toast("La partie sauvegardée est illisible.");
        clearSaved();
        render();
        return;
      }
      state.game = partie;
      go("game");
    };
    card.appendChild(reprendre);

    const non = el(`<button class="ghost-button" style="margin-top:8px">Annuler</button>`);
    non.onclick = () => {
      state.pendingLevel = null;
      fermer();
    };
    card.appendChild(non);
  }

  if (state.panel === "confirm-hint") {
    // Ce que l'indice va réellement coûter, calculé sur le motif que le moteur
    // s'apprête à nommer — pas sur une estimation.
    const deduction = nextStepFor(game);
    const technique = deduction?.technique ?? null;
    const plein = technique ? COST[technique] * ASSISTANCE.none : 0;
    const apres = technique ? COST[technique] * ASSISTANCE.named : 0;
    const perdu = technique && game.shareFor(technique) === 0;

    card.appendChild(el(`<h2>Prendre un indice</h2>`));
    card.appendChild(
      el(`<p class="lesson-text">L'indice ne donnera pas de chiffre : il nommera
        le raisonnement à tenir, et vous laissera le trouver.</p>`)
    );
    card.appendChild(
      el(`<p class="lesson-text">${
        !technique
          ? "Aucun raisonnement connu ne s'applique ici."
          : perdu
            ? "Ce passage ne rapporte déjà plus de points : l'indice ne vous coûtera rien."
            : `Ce passage vaut <strong>${plein} points</strong>. Le nommer le ramènera à <strong>${apres}</strong>. Voir les cases le divisera encore, et l'explication complète le ramènera à zéro.`
      }</p>`)
    );

    const oui = el(`<button class="wide-button">Nommer le raisonnement</button>`);
    oui.onclick = () => {
      state.panel = null;
      game.askForHint();
      if (game.hint) noter(`indice-${game.hint.stage}`);
      render();
    };
    card.appendChild(oui);

    const non = el(`<button class="ghost-button" style="margin-top:8px">Chercher encore</button>`);
    non.onclick = fermer;
    card.appendChild(non);
  }

  overlay.appendChild(card);
  return overlay;
}

/** Le motif que l'indice nommerait, sans engager d'aide. */
function nextStepFor(game) {
  try {
    return moteurNextStep(game.board);
  } catch {
    return null;
  }
}

// MARK: - Chronomètre

function startTimer() {
  stopTimer();
  timer = setInterval(() => {
    if (state.screen !== "game" || !state.game || state.result) return;
    state.game.elapsed += 1;
    if (state.game.elapsed % 5 === 0) state.game.persist();
    const node = document.querySelector(".header-stats > div:last-child");
    if (node) node.textContent = formatTime(state.game.elapsed);
  }, 1000);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

// MARK: - Navigation

function go(screen) {
  state.screen = screen;
  if (screen === "game") startTimer();
  else stopTimer();
  window.scrollTo(0, 0);
  render();
}

function render() {
  app.replaceChildren();

  switch (state.screen) {
    case "game":
      app.appendChild(renderGame());
      break;
    case "techniques":
      app.appendChild(renderTechniques());
      break;
    case "technique":
      app.appendChild(renderTechnique());
      break;
    case "grades":
      app.appendChild(renderGrades());
      break;
    default:
      app.appendChild(renderHome());
  }

  if (state.panel) app.appendChild(renderPanel());
  if (state.result) app.appendChild(renderResult());
}

// La partie est écrite sur le disque dès que la page passe à l'arrière-plan :
// sur mobile, une fermeture n'est jamais annoncée.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.game) state.game.persist();
});

// Mise en cache : après la première visite, le jeu fonctionne sans réseau.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* hors ligne indisponible : le jeu reste parfaitement utilisable */
    });
  });
}

boot();
