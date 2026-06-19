// ================================================================
// sw.js - Service Worker للتخزين المؤقت والعمل بدون إنترنت
// ================================================================

const CACHE_NAME = 'medical-app-v4';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './css/styles.css',
    './js/config.js',
    './js/utils.js',
    './js/app.js',
    './icons/android-chrome-192x192.png',
    './icons/android-chrome-512x512.png',
    'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap',
    'https://cdn.tailwindcss.com/',
    'https://unpkg.com/vue@3/dist/vue.global.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    'https://js.pusher.com/8.2.0/pusher.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// ===== التثبيت: تحميل الملفات في الكاش =====
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('📦 تحميل ملفات التطبيق...');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// ===== التفعيل: مسح الكاش القديم =====
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

// ===== الجلب: استراتيجية Cache First =====
self.addEventListener('fetch', event => {
    // تجاهل طلبات الـ API والخدمات الخارجية
    const url = event.request.url;
    if (url.includes('script.google.com') ||
        url.includes('pusher.com') ||
        url.includes('google-analytics.com') ||
        url.includes('googletagmanager.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request);
        })
    );
});
