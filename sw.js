// Met le jeu en cache pour qu'il fonctionne sans réseau.
//
// Une fois la page visitée une fois, tout est local : les grilles sont déjà
// dans le stock, rien n'a besoin d'être demandé à un serveur pour jouer.

const CACHE = "sudoku-v1";

const FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "game.js",
  "engine.js",
  "mesure.js",
  "puzzles.json",
  "examples.json",
  "manifest.json",
  "icone.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting())
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

// Cache d'abord : le jeu doit démarrer instantanément, même en tunnel.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;
      return fetch(event.request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match("index.html"));
    })
  );
});
