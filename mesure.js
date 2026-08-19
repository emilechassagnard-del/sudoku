// Mesure d'usage, anonyme et agrégée.
//
// Ce que ça envoie : des noms d'événements, rien d'autre. Pas d'identifiant,
// pas de cookie, pas de progression, pas de contenu de grille. Le tableau de
// bord ne montre que des totaux — combien de parties commencées, combien
// terminées, sur quel niveau les gens s'arrêtent.
//
// Tout est isolé dans ce fichier : le supprimer suffit à tout retirer.

// Identifiant du compte GoatCounter. Vide = mesure désactivée, et le jeu
// fonctionne exactement pareil.
const COMPTE = "sudoku-emile";

/**
 * Charge le script de mesure, une seule fois.
 *
 * En cas d'échec — script bloqué, hors ligne, refus du navigateur — on ne fait
 * rien et le jeu continue. La mesure ne doit jamais être une condition pour
 * jouer.
 */
export function installerMesure() {
  if (!COMPTE) return;
  if (document.querySelector("script[data-goatcounter]")) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = "//gc.zgo.at/count.js";
  script.dataset.goatcounter = `https://${COMPTE}.goatcounter.com/count`;
  script.onerror = () => {
    /* mesure indisponible : sans conséquence pour le joueur */
  };
  document.head.appendChild(script);
}

/**
 * Note un événement.
 *
 * @param {string} nom  Court et lisible : "partie-commencee-moyen".
 */
export function noter(nom) {
  if (!COMPTE) return;
  try {
    const gc = window.goatcounter;
    if (!gc || typeof gc.count !== "function") return;
    gc.count({ path: nom, title: nom, event: true });
  } catch {
    /* jamais au détriment de la partie en cours */
  }
}
