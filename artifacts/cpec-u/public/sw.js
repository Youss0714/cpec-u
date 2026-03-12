// A simple service worker to satisfy PWA requirements and handle offline grading status.
const CACHE_NAME = 'cpec-u-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// We are primarily relying on standard network fetching,
// but we intercept to provide a customized offline experience for API calls if needed.
// Real offline grade storage is handled explicitly in the React app via localStorage.
self.addEventListener('fetch', (event) => {
  // Pass-through for now, handled in app logic.
});
