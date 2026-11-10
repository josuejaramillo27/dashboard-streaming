// sw.js - Service Worker Mejorado para auto-actualización y limpieza
const CACHE_NAME = 'agc-cache-v4';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './guile-stance.gif'
];

self.addEventListener('install', (e) => {
    console.log('[Service Worker] Instalado versión:', CACHE_NAME);
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    // Obliga al celular y navegadores a usar el nuevo código de inmediato
    self.skipWaiting(); 
});

self.addEventListener('activate', (e) => {
    console.log('[Service Worker] Activado versión:', CACHE_NAME);
    // Destruye cualquier caché antigua y corrupta que haya quedado
    e.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Borrando caché antigua:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    // Intenta red primero, fallback a caché
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});
