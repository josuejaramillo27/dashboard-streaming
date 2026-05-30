// sw.js - Service Worker Mejorado para auto-actualización
const VERSION = 'v2'; // Si en el futuro haces un cambio grande, cámbialo a v3, v4...

self.addEventListener('install', (e) => {
    console.log('[Service Worker] Instalado versión:', VERSION);
    // Obliga al celular a usar el nuevo código de inmediato
    self.skipWaiting(); 
});

self.addEventListener('activate', (e) => {
    console.log('[Service Worker] Activado');
    // Toma el control de las pestañas abiertas al instante
    e.waitUntil(clients.claim()); 
});

self.addEventListener('fetch', (e) => {
    // Deja pasar las peticiones normales a internet
});
