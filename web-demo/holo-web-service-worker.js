/**
 * holo-web-service-worker.js — Direct Holo Web Service Worker (OPFS v11 CAS, Zero Cache API)
 *
 * Completely bypasses the browser ServiceWorker Cache API (`caches.*`) and serves
 * all assets and content-addressed blobs directly from the Origin Private File System:
 *
 *   OPFS:/v11/files/<sha512[:2]>/<sha512>[-exec]   (immutable v11 CAS blobs)
 *   OPFS:/v11/routes/<sha256-of-url-path>.json     (O(1) URL -> v11 blob index)
 *
 * Capabilities:
 *   1. Direct `/v11/files/<shard>/<sha512>[-exec]` GET/HEAD served straight from OPFS.
 *   2. Automatic COOP/COEP headers (`same-origin` + `credentialless`) on every response
 *      so `crossOriginIsolated === true`, enabling SharedArrayBuffer fork() + WebGPU.
 *   3. OPFS-first for immutable assets (.wasm, .b8p, .js, .css, /v11/files/*);
 *      network-first with OPFS fallback for HTML navigations so deploys stay fresh.
 *   4. Zero `caches.open` / `cache.match` / `cache.put` calls anywhere.
 */

const SW_VERSION = 'holo-web-sw/v11.0';
const B8G_ABI_MAGIC_V3 = '0x33564742';

let opfsRootPromise = null;

async function getOpfsDirs() {
  if (!opfsRootPromise) {
    opfsRootPromise = (async () => {
      const root = await navigator.storage.getDirectory();
      const v11 = await root.getDirectoryHandle('v11', { create: true });
      const files = await v11.getDirectoryHandle('files', { create: true });
      const routes = await v11.getDirectoryHandle('routes', { create: true });
      return { root, v11, files, routes };
    })();
  }
  return opfsRootPromise;
}

async function digestHex(algo, data) {
  const buf = await crypto.subtle.digest(algo, data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function writeOpfsFile(dirHandle, name, bytes) {
  const fh = await dirHandle.getFileHandle(name, { create: true });
  const writable = await fh.createWritable();
  await writable.write(bytes);
  await writable.close();
}

async function readOpfsFile(dirHandle, name) {
  try {
    const fh = await dirHandle.getFileHandle(name, { create: false });
    const file = await fh.getFile();
    return await file.arrayBuffer();
  } catch {
    return null;
  }
}

async function putV11Blob(bytes, executable = false) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const sha512 = await digestHex('SHA-512', u8);
  const shard = sha512.slice(0, 2);
  const fname = executable ? `${sha512}-exec` : sha512;
  const { files } = await getOpfsDirs();
  const shardDir = await files.getDirectoryHandle(shard, { create: true });
  const existing = await readOpfsFile(shardDir, fname);
  const casHit = existing !== null;
  if (!casHit) {
    await writeOpfsFile(shardDir, fname, u8);
  }
  return { sha512, shard, fname, blobPath: `v11/files/${shard}/${fname}`, casHit, size: u8.byteLength };
}

async function getV11Blob(shard, fname) {
  const { files } = await getOpfsDirs();
  try {
    const shardDir = await files.getDirectoryHandle(shard, { create: false });
    return await readOpfsFile(shardDir, fname);
  } catch {
    return null;
  }
}

async function routeKey(pathname) {
  return (await digestHex('SHA-256', new TextEncoder().encode(pathname))) + '.json';
}

async function getRouteEntry(pathname) {
  const { routes } = await getOpfsDirs();
  const key = await routeKey(pathname);
  const raw = await readOpfsFile(routes, key);
  if (!raw) return null;
  try {
    return JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return null;
  }
}

async function putRouteEntry(pathname, meta) {
  const { routes } = await getOpfsDirs();
  const key = await routeKey(pathname);
  const bytes = new TextEncoder().encode(JSON.stringify(meta));
  await writeOpfsFile(routes, key, bytes);
}

function withHoloHeaders(body, status, contentType, extra = {}) {
  const headers = new Headers({
    'Content-Type': contentType || 'application/octet-stream',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Holo-SW': SW_VERSION,
    'X-Holo-ABI': B8G_ABI_MAGIC_V3,
    'X-Holo-Cache-API': 'BYPASSED (OPFS-v11)',
    ...extra,
  });
  return new Response(body, { status, headers });
}

function guessContentType(pathname, fallback) {
  if (fallback) return fallback;
  if (pathname.endsWith('.html') || pathname.endsWith('/')) return 'text/html; charset=utf-8';
  if (pathname.endsWith('.js') || pathname.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (pathname.endsWith('.wasm')) return 'application/wasm';
  if (pathname.endsWith('.b8p')) return 'application/octet-stream';
  if (pathname.endsWith('.json')) return 'application/json; charset=utf-8';
  if (pathname.endsWith('.css')) return 'text/css; charset=utf-8';
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

async function listOpfsStats() {
  const { files, routes } = await getOpfsDirs();
  let blobCount = 0;
  let routeCount = 0;
  let totalBytes = 0;
  if (typeof files.values === 'function') {
    for await (const shard of files.values()) {
      if (shard.kind === 'directory' && typeof shard.values === 'function') {
        for await (const entry of shard.values()) {
          if (entry.kind === 'file') {
            blobCount++;
            try { totalBytes += (await entry.getFile()).size; } catch {}
          }
        }
      }
    }
  }
  if (typeof routes.values === 'function') {
    for await (const entry of routes.values()) {
      if (entry.kind === 'file') routeCount++;
    }
  }
  return { blobCount, routeCount, totalBytes, cacheApiBypassed: true, swVersion: SW_VERSION };
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    getOpfsDirs().then(() => self.skipWaiting()).catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Purge any legacy ServiceWorker Cache API stores so OPFS v11 is the sole truth.
    if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
      try {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      } catch {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  const reply = (payload) => {
    if (event.ports && event.ports[0]) event.ports[0].postMessage(payload);
    else if (event.source) event.source.postMessage(payload);
  };

  if (msg.type === 'HOLO_SW_STATUS') {
    listOpfsStats()
      .then((stats) => reply({ type: 'HOLO_SW_STATUS', ...stats }))
      .catch((err) => reply({ type: 'HOLO_SW_STATUS', error: String(err), cacheApiBypassed: true }));
  } else if (msg.type === 'HOLO_V11_PUT' && msg.bytes) {
    putV11Blob(new Uint8Array(msg.bytes), Boolean(msg.executable))
      .then((res) => reply({ type: 'HOLO_V11_PUT_OK', ...res }))
      .catch((err) => reply({ type: 'HOLO_V11_PUT_ERR', error: String(err) }));
  }
});

async function fetchAndStoreOpfs(request, pathname) {
  const res = await fetch(request);
  if (!res || !res.ok || res.type === 'opaque') {
    return res;
  }
  const buf = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || guessContentType(pathname);
  const put = await putV11Blob(new Uint8Array(buf), pathname.endsWith('.wasm'));
  await putRouteEntry(pathname, {
    pathname,
    sha512: put.sha512,
    shard: put.shard,
    fname: put.fname,
    contentType,
    size: put.size,
    storedAt: Date.now(),
  });
  return withHoloHeaders(buf, res.status, contentType, {
    'X-Holo-CAS': put.casHit ? 'HIT (OPFS-v11-DEDUP)' : 'MISS (STORED OPFS-v11)',
    'X-Holo-SHA512': put.sha512,
  });
}

async function serveFromOpfsRoute(pathname) {
  const entry = await getRouteEntry(pathname);
  if (!entry) return null;
  const buf = await getV11Blob(entry.shard, entry.fname);
  if (!buf) return null;
  return withHoloHeaders(buf, 200, entry.contentType || guessContentType(pathname), {
    'X-Holo-CAS': 'HIT (OPFS-v11)',
    'X-Holo-SHA512': entry.sha512,
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' && req.method !== 'HEAD') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 1. Direct OPFS v11 CAS blob endpoint: /v11/files/<shard>/<sha512>[-exec]
  const v11Match = url.pathname.match(/^\/(?:demo\/)?v11\/files\/([0-9a-f]{2})\/([0-9a-f]{128}(?:-exec)?)$/i);
  if (v11Match) {
    event.respondWith((async () => {
      const [, shard, fname] = v11Match;
      const buf = await getV11Blob(shard.toLowerCase(), fname.toLowerCase());
      if (buf) {
        return withHoloHeaders(buf, 200, fname.endsWith('-exec') ? 'application/wasm' : 'application/octet-stream', {
          'X-Holo-CAS': 'HIT (OPFS-v11-DIRECT)',
          'X-Holo-SHA512': fname.replace(/-exec$/, ''),
          'Cache-Control': 'public, max-age=31536000, immutable',
        });
      }
      return withHoloHeaders(JSON.stringify({ error: 'v11 blob not in OPFS', shard, fname }), 404, 'application/json');
    })());
    return;
  }

  // 2. HTML navigations: network-first (fresh deploys) with instant OPFS v11 offline fallback
  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
    event.respondWith((async () => {
      try {
        return await fetchAndStoreOpfs(req, url.pathname);
      } catch {
        const cached = await serveFromOpfsRoute(url.pathname);
        if (cached) return cached;
        return withHoloHeaders('Offline and not yet cached in OPFS:/v11/', 503, 'text/plain; charset=utf-8');
      }
    })());
    return;
  }

  // 3. Static / binary assets (.wasm, .b8p, .js, .css): OPFS-first, background-free deterministic v11
  event.respondWith((async () => {
    const cached = await serveFromOpfsRoute(url.pathname);
    if (cached) return cached;
    return await fetchAndStoreOpfs(req, url.pathname);
  })());
});
