const CACHE_NAME = 'medical-app-v3.6';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap',
    'https://cdn.tailwindcss.com/',
    'https://unpkg.com/vue@3/dist/vue.global.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    'https://js.pusher.com/8.2.0/pusher.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('📦 تحميل ملفات PWA...');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('🗑️ مسح الكاش القديم:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', event => {
    // تجاهل طلبات الـ API من الكاش (لأنها تتغير دائماً)
    if (event.request.url.includes('script.google.com')) return;
    if (event.request.url.includes('pusher.com')) return;
    if (event.request.url.includes('google-analytics.com')) return;
    
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request);
        })
    );
});
