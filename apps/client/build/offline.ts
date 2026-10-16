import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/** Cache the complete build, including the database WASM and exercise images.
 * API responses and credentials never enter the service-worker cache. */
export function offlineBuild(): Plugin {
  return {
    name: 'gymix-offline',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter((path) => !path.endsWith('.map'));
      const version = createHash('sha256').update(assets.sort().join('\n'))
        .update(String(bundle['index.html']?.type === 'asset' ? bundle['index.html'].source : '')).digest('hex').slice(0, 16);
      const source = `
const CACHE = 'gymix-build-${version}';
const ASSETS = ${JSON.stringify(assets)};
const url = path => new URL(path, self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('gymix-build-') && key !== CACHE).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const path = request.mode === 'navigate' ? url('index.html') : request.url;
  if (request.mode !== 'navigate' && !ASSETS.some(asset => url(asset) === path)) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(path)) || fetch(request)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
