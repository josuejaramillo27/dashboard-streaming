// sw.js - Service Worker Mejorado con Network-First y Exclusión de Autenticación
const CACHE_NAME = 'agc-cache-v5';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './guile-stance.gif'
];

self.addEventListener('install', (e) => {
    console.log('[Service Worker] Instalando versión:', CACHE_NAME);
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    // Toma el control inmediato de la aplicación
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    console.log('[Service Worker] Activando versión:', CACHE_NAME);
    // Elimina cualquier caché antigua para asegurar redirecciones y assets frescos
    e.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Purgando caché obsoleta:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    // 1. Solo gestionar peticiones GET; nunca interceptar POST, PUT, DELETE ni auth mutations
    if (e.request.method !== 'GET') return;

    const url = new URL(e.request.url);

    // 2. Excluir explícitamente llamadas a Firebase, Firestore, Google Auth, CDNs externas y APIs
    if (
        url.origin !== self.location.origin ||
        url.hostname.includes('firebase') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('google.com') ||
        url.hostname.includes('gstatic.com') ||
        url.hostname.includes('panelagc.com') ||
        url.pathname.includes('/api/')
    ) {
        return; // Deja pasar la petición directo a la red sin intervenir
    }

    // 3. Estrategia Network First: Siempre consultar la red primero para evitar estados y vistas cacheadas
    e.respondWith(
        fetch(e.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Fallback a caché únicamente si la red no está disponible (offline)
                return caches.match(e.request);
            })
    );
});
