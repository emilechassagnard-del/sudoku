# Sudoku — version site internet

Le même jeu que l'application iOS : même moteur, mêmes treize techniques, mêmes
textes, même barème. Réécrit en JavaScript pour tourner dans un navigateur.

Une fois publié, l'adresse s'ouvre sur n'importe quel téléphone. Rien à
installer, rien à autoriser, aucun compte.

---

## Essayer chez vous avant de publier

Ouvrir `index.html` en double-cliquant **ne marchera pas** : le navigateur
refuse alors de lire les fichiers de grilles voisins. Il faut un serveur, même
sur votre propre machine.

Dans le Terminal :

```
cd ~/sudoku/site
python3 -m http.server 8000
```

Puis ouvrez `http://localhost:8000` dans Safari ou Chrome.

Pour arrêter le serveur : `Ctrl` + `C` dans le Terminal.

---

## Publier gratuitement, en cinq minutes

GitHub Pages héberge le site sans rien payer. Vous avez déjà un dépôt Git.

**1.** Créez un dépôt sur github.com (bouton *New*, nom au choix, cochez
*Public*).

**2.** Dans le Terminal, depuis le dossier du site :

```
cd ~/sudoku/site
git init
git add .
git commit -m "Sudoku pédagogique, version web"
git branch -M main
git remote add origin https://github.com/VOTRE-NOM/VOTRE-DEPOT.git
git push -u origin main
```

**3.** Sur la page du dépôt : onglet **Settings**, rubrique **Pages** dans la
colonne de gauche, puis sous *Source* choisissez la branche `main` et le dossier
`/ (root)`. Validez.

**4.** Attendez une minute. L'adresse apparaît en haut de cette même page :

```
https://VOTRE-NOM.github.io/VOTRE-DEPOT/
```

Envoyez ce lien. C'est tout.

---

## L'ajouter à l'écran d'accueil

Sur iPhone, dans Safari : bouton **Partager**, puis **Sur l'écran d'accueil**.

Le jeu obtient alors sa propre icône, s'ouvre en plein écran sans barre
d'adresse, et fonctionne **sans connexion** : tout est mis en cache à la
première visite.

C'est ce qui le rapproche le plus d'une vraie application, sans compte
développeur ni validation.

---

## Ce que contient le dossier

| Fichier | Rôle |
|---|---|
| `engine.js` | Le moteur : 13 techniques, générateur, solveurs |
| `game.js` | La partie : mérite, grades, défi quotidien, sauvegarde |
| `app.js` | L'interface : écrans, grille, indices, fiches |
| `style.css` | La palette, identique à l'app iOS |
| `puzzles.json` | 300 grilles, 60 par niveau |
| `examples.json` | 39 positions réelles illustrant les 13 techniques |
| `build-data.mjs` | Régénère les deux fichiers ci-dessus |
| `sw.js` | Fait fonctionner le jeu hors ligne |

---

## Regénérer un stock plus large

Avant une vraie mise en ligne, vous pouvez produire davantage de grilles :

```
cd ~/sudoku/site
node build-data.mjs 200 3
```

Le premier nombre est le nombre de grilles **par niveau**, le second le nombre
d'exemples **par technique**. Comptez une minute par tranche de cinquante
grilles Diaboliques : ce sont les plus longues à trouver.

Rien d'autre à modifier : les deux fichiers JSON sont réécrits sur place.

---

## Ce que la version web ne fait pas

Le retour haptique est plus pauvre qu'en natif, et absent sur iPhone hors
application installée.

La sauvegarde vit dans le navigateur. Effacer les données du site efface la
progression, et un autre navigateur repart de zéro. L'app iOS, elle, écrit un
fichier.

Le reste est identique, y compris le calcul des indices, qui tourne
intégralement sur l'appareil du joueur — aucune donnée n'est envoyée nulle part.
