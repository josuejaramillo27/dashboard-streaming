// sw.js - Service Worker Mejorado para auto-actualización y limpieza
const VERSION = 'v3'; // Subimos a v3 para forzar la actualización global

self.addEventListener('install', (e) => {
    console.log('[Service Worker] Instalado versión:', VERSION);
    // Obliga al celular a usar el nuevo código de inmediato
    self.skipWaiting(); 
});

self.addEventListener('activate', (e) => {
    console.log('[Service Worker] Activado versión:', VERSION);
    // Destruye cualquier caché antigua y corrupta que haya quedado en los celulares
    e.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== VERSION) {
                        console.log('[Service Worker] Borrando caché antigua:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    // Obliga a que siempre descargue la versión más reciente de internet
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});
