// Permet de jouer sans réseau, sans jamais figer le jeu dans une vieille
// version.
//
// La première écriture demandait le cache en premier et ne consultait le réseau
// que s'il n'y avait rien. C'était une impasse : une fois les fichiers en
// cache, aucune mise à jour ne pouvait plus arriver, quoi qu'on publie.
//
// On interroge donc le réseau d'abord et on garde une copie fraîche à chaque
// passage. Le cache ne sert plus que de filet : hors ligne, ou serveur
// injoignable. Le surcoût est négligeable — le jeu entier pèse moins de trois
// cents kilooctets — et tout le calcul reste local de toute façon.

const CACHE = "sudophile-v6";

const FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "game.js",
  "classement.js",
  "engine.js",
  "mesure.js",
  "puzzles.json",
  "examples.json",
  "manifest.json",
  "icone.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Les requêtes vers d'autres domaines — la mesure d'usage, notamment — ne
  // passent pas par ici : elles ne doivent ni être mises en cache, ni empêcher
  // quoi que ce soit si elles échouent.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match("index.html")))
  );
});
