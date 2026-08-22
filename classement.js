// Le lien entre le jeu et le serveur du classement.
//
// Tout ce qui touche au réseau vit ici. Le reste du jeu continue de fonctionner
// entier si ce fichier échoue : un classement injoignable n'empêche personne de
// jouer, et aucune fonction ci-dessous ne lève — elles rendent null ou un objet
// d'erreur, jamais une exception qui remonterait jusqu'à l'interface.

const ADRESSE = "https://sudophile-classement.emilechassagnard.workers.dev";

const CLE_JETON = "sudoku.classement.jeton";
const CLE_PSEUDO = "sudoku.classement.pseudo";

/*
  Le jeton : un identifiant tiré au hasard par le navigateur, gardé chez le
  joueur, et jamais montré. C'est lui qui permet de reconnaître quelqu'un d'un
  jour sur l'autre sans lui demander ni compte, ni mot de passe, ni adresse.

  Il n'est créé qu'au moment où le joueur décide d'entrer dans le classement.
  Tant qu'il n'a rien demandé, rien n'est tiré et rien n'est stocké.
*/
export function jeton(creer = false) {
  let valeur = null;
  try {
    valeur = localStorage.getItem(CLE_JETON);
  } catch {
    return null;
  }
  if (valeur || !creer) return valeur;

  const brut =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "")
      : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  try {
    localStorage.setItem(CLE_JETON, brut);
  } catch {
    return null;
  }
  return brut;
}

/** Le pseudonyme retenu, ou null si le joueur n'est pas inscrit. */
export function pseudo() {
  try {
    return localStorage.getItem(CLE_PSEUDO);
  } catch {
    return null;
  }
}

export function inscrit() {
  return Boolean(pseudo() && jeton(false));
}

/*
  Toute requête est bornée dans le temps et ne lève jamais.

  Sans délai maximum, un serveur lent fige l'écran de fin de partie ; le joueur
  ne comprend pas ce qu'il attend, et ce qu'il attend ne le concerne pas.
*/
async function demande(chemin, options = {}, delai = 8000) {
  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), delai);
  try {
    const reponse = await fetch(ADRESSE + chemin, { ...options, signal: stop.signal });
    const corps = await reponse.json().catch(() => null);
    if (!reponse.ok) {
      return { erreur: corps?.erreur ?? `Le serveur a répondu ${reponse.status}.` };
    }
    return corps ?? { erreur: "Réponse illisible." };
  } catch (e) {
    return {
      erreur:
        e?.name === "AbortError"
          ? "Le classement met trop de temps à répondre."
          : "Le classement est injoignable.",
    };
  } finally {
    clearTimeout(minuteur);
  }
}

const envoiJSON = (corps) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(corps),
});

/** Réserve un pseudonyme. Rend { pseudo } ou { erreur }. */
export async function reserver(souhait) {
  const mien = jeton(true);
  if (!mien) return { erreur: "Ce navigateur refuse d'enregistrer quoi que ce soit." };

  const reponse = await demande("/pseudo", envoiJSON({ jeton: mien, pseudo: souhait }));
  if (reponse.erreur) return reponse;

  try {
    localStorage.setItem(CLE_PSEUDO, reponse.pseudo);
  } catch {
    /* le pseudonyme est réservé côté serveur : l'essentiel tient */
  }
  return reponse;
}

/*
  Dépose le score d'un défi.

  Muet par construction : si le joueur n'est pas inscrit, il n'y a rien à
  envoyer, et s'il l'est, l'échec ne doit pas s'afficher par-dessus sa fiche de
  fin de partie. Le score restera simplement absent du classement.
*/
export async function deposer(jour, points, niveau) {
  if (!inscrit()) return null;
  return demande("/score", envoiJSON({ jeton: jeton(false), jour, points, niveau }));
}

/** Un classement. periode vaut "jour", "semaine" ou "mois". */
export async function lire(periode, cercle = "tous") {
  const mien = jeton(false);
  const params = new URLSearchParams({ periode });
  if (mien) params.set("jeton", mien);
  if (cercle === "amis" && mien) params.set("cercle", "amis");
  return demande(`/classement?${params}`);
}

// MARK: - Codes, reprise, amis

const CLE_CODE = "sudoku.code";

/** Le code d'ami du joueur, une fois connu du serveur. */
export function codeAmi() {
  try {
    return localStorage.getItem(CLE_CODE);
  } catch {
    return null;
  }
}

/*
  Demande ses codes au serveur.

  Le code d'ami est stable et peut être redemandé sans risque. Le code de
  reprise, lui, n'est engendré que si on le réclame — et il n'est montré
  qu'une fois, le serveur n'en gardant qu'une empreinte.
*/
export async function mesCodes(nouvelleReprise = false) {
  const mien = jeton(false);
  if (!mien) return { erreur: "Rejoignez d'abord le classement." };
  const reponse = await demande("/codes", envoiJSON({ jeton: mien, nouvelleReprise }));
  if (!reponse.erreur && reponse.code) {
    try {
      localStorage.setItem(CLE_CODE, reponse.code);
    } catch {
      /* le code reste lisible en le redemandant */
    }
  }
  return reponse;
}

/*
  Reprend son compte sur cet appareil à partir du code de reprise.

  Le serveur renvoie le jeton d'origine, que l'on adopte : cet appareil devient
  alors le même joueur, avec ses scores, ses amis et son pseudonyme.
*/
export async function reprendre(code) {
  const reponse = await demande("/reprendre", envoiJSON({ code }));
  if (reponse.erreur) return reponse;
  try {
    localStorage.setItem(CLE_JETON, reponse.jeton);
    localStorage.setItem(CLE_PSEUDO, reponse.pseudo);
    if (reponse.code) localStorage.setItem(CLE_CODE, reponse.code);
  } catch {
    /* sans mémoire locale, la reprise ne tiendra pas : rien de plus à faire */
  }
  return reponse;
}

export async function ajouterAmi(code) {
  const mien = jeton(false);
  if (!mien) return { erreur: "Rejoignez d'abord le classement." };
  return demande("/ami/ajouter", envoiJSON({ jeton: mien, code }));
}

export async function retirerAmi(code) {
  const mien = jeton(false);
  if (!mien) return { erreur: "Rejoignez d'abord le classement." };
  return demande("/ami/retirer", envoiJSON({ jeton: mien, code }));
}

export async function mesAmis() {
  const mien = jeton(false);
  if (!mien) return { amis: [] };
  return demande(`/amis?jeton=${encodeURIComponent(mien)}`);
}

// MARK: - Défis

/*
  Lance un défi sur la grille qu'on vient de terminer.

  On transmet la grille entière et sa solution plutôt qu'un numéro : les défis
  déjà lancés resteront jouables le jour où le stock de grilles changera.
*/
export async function creerDefi(grille, solution, points, temps, niveau) {
  const mien = jeton(false);
  if (!mien) return { erreur: "Rejoignez d'abord le classement." };
  return demande(
    "/defi/creer",
    envoiJSON({ jeton: mien, grille, solution, points, temps, niveau })
  );
}

export async function lireDefi(id) {
  return demande(`/defi?id=${encodeURIComponent(id)}`);
}

export async function releverDefi(id, points, temps) {
  const mien = jeton(false);
  if (!mien) return { erreur: "Rejoignez d'abord le classement." };
  return demande("/defi/relever", envoiJSON({ jeton: mien, id, points, temps }));
}

/** L'adresse à partager pour lancer un défi. */
export function lienDefi(id) {
  const base = location.origin + location.pathname.replace(/index\.html$/, "");
  return `${base}?defi=${id}`;
}

/** Retire le joueur et tous ses scores, ici comme sur le serveur. */
export async function retirer() {
  const mien = jeton(false);
  if (mien) await demande("/effacer", envoiJSON({ jeton: mien }));
  try {
    localStorage.removeItem(CLE_JETON);
    localStorage.removeItem(CLE_PSEUDO);
    localStorage.removeItem(CLE_CODE);
  } catch {
    /* rien à faire de plus */
  }
}
