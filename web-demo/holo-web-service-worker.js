/**
 * holo-web-service-worker.js — Direct Holo Web Service Worker (OPFS v11 CAS + holo-gitlab-api, Zero Cache API)
 *
 * Completely bypasses the browser ServiceWorker Cache API (`caches.*`) and serves
 * all assets, content-addressed blobs, and dismantled GitLab/Git APIs directly from
 * the Origin Private File System (zero Ruby/Rails, zero server):
 *
 *   OPFS:/v11/files/<sha512[:2]>/<sha512>[-exec]   (immutable v11 CAS blobs)
 *   OPFS:/v11/routes/<sha256-of-url-path>.json     (O(1) URL -> v11 blob index)
 *   OPFS:/v11/gitlab-api-state.json                (persisted holo-gitlab-api state)
 *
 * Capabilities:
 *   1. Direct `/v11/files/<shard>/<sha512>[-exec]` GET/HEAD served straight from OPFS.
 *   2. Automatic COOP/COEP headers (`same-origin` + `credentialless`) on every response
 *      so `crossOriginIsolated === true`, enabling SharedArrayBuffer fork() + WebGPU.
 *   3. OPFS-first for immutable assets (.wasm, .b8p, .js, .css, /v11/files/*);
 *      network-first with OPFS fallback for HTML navigations so deploys stay fresh.
 *   4. Dismantled `holo-gitlab-api` (`/api/v4/...`), Git Smart-HTTP (`/<org>/<repo>.git/info/refs`),
 *      and native Holo v11 API (`/api/holo/v11/...`) persisted in `OPFS:/v11/`.
 *   5. Zero `caches.open` / `cache.match` / `cache.put` calls anywhere.
 */

const SW_VERSION = 'holo-web-sw/v11.3';
const B8G_ABI_MAGIC_V3 = '0x33564742';
const GITLAB_STATE_FILE = 'gitlab-api-state.json';

const memBlobs = new Map();
const memRoutes = new Map();
const writeLocks = new Map();
let opfsRootPromise = null;

async function getOpfsDirs() {
  if (!opfsRootPromise) {
    opfsRootPromise = (async () => {
      if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.getDirectory !== 'function') {
        return null;
      }
      const root = await navigator.storage.getDirectory();
      const v11 = await root.getDirectoryHandle('v11', { create: true });
      const files = await v11.getDirectoryHandle('files', { create: true });
      const routes = await v11.getDirectoryHandle('routes', { create: true });
      return { root, v11, files, routes };
    })().catch(() => null);
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
  if (!dirHandle) return false;
  const prev = writeLocks.get(name) || Promise.resolve();
  const next = prev.then(async () => {
    const fh = await dirHandle.getFileHandle(name, { create: true });
    if (typeof fh.createWritable === 'function') {
      const writable = await fh.createWritable();
      await writable.write(bytes);
      await writable.close();
      return true;
    }
    return false;
  }).catch(() => false);
  writeLocks.set(name, next);
  try {
    return await next;
  } finally {
    if (writeLocks.get(name) === next) writeLocks.delete(name);
  }
}

async function readOpfsFile(dirHandle, name) {
  if (!dirHandle) return null;
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
  const blobPath = `v11/files/${shard}/${fname}`;
  let casHit = memBlobs.has(blobPath);
  let persisted = false;

  memBlobs.set(blobPath, u8.slice().buffer);

  try {
    const dirs = await getOpfsDirs();
    if (dirs) {
      const shardDir = await dirs.files.getDirectoryHandle(shard, { create: true });
      const existing = await readOpfsFile(shardDir, fname);
      if (existing !== null) {
        casHit = true;
        persisted = true;
      } else {
        persisted = await writeOpfsFile(shardDir, fname, u8);
      }
    }
  } catch {
    persisted = false;
  }
  return { sha512, shard, fname, blobPath, casHit, persisted, size: u8.byteLength };
}

async function getV11Blob(shard, fname) {
  const blobPath = `v11/files/${shard}/${fname}`;
  try {
    const dirs = await getOpfsDirs();
    if (dirs) {
      const shardDir = await dirs.files.getDirectoryHandle(shard, { create: false });
      const buf = await readOpfsFile(shardDir, fname);
      if (buf) return buf;
    }
  } catch {}
  return memBlobs.get(blobPath) || null;
}

async function routeKey(routeUrl) {
  return (await digestHex('SHA-256', new TextEncoder().encode(routeUrl))) + '.json';
}

async function getRouteEntry(routeUrl) {
  try {
    const dirs = await getOpfsDirs();
    if (dirs) {
      const key = await routeKey(routeUrl);
      const raw = await readOpfsFile(dirs.routes, key);
      if (raw) return JSON.parse(new TextDecoder().decode(raw));
    }
  } catch {}
  return memRoutes.get(routeUrl) || null;
}

async function putRouteEntry(routeUrl, meta) {
  memRoutes.set(routeUrl, meta);
  try {
    const dirs = await getOpfsDirs();
    if (dirs) {
      const key = await routeKey(routeUrl);
      const bytes = new TextEncoder().encode(JSON.stringify(meta));
      await writeOpfsFile(dirs.routes, key, bytes);
    }
  } catch {}
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
  const dirs = await getOpfsDirs();
  if (!dirs) {
    return { blobCount: memBlobs.size, routeCount: memRoutes.size, totalBytes: 0, cacheApiBypassed: true, swVersion: SW_VERSION };
  }
  const { files, routes } = dirs;
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
  return { blobCount: Math.max(blobCount, memBlobs.size), routeCount: Math.max(routeCount, memRoutes.size), totalBytes, cacheApiBypassed: true, swVersion: SW_VERSION };
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

async function fetchAndStoreOpfs(request, routeUrl) {
  const res = await fetch(request);
  if (!res || !res.ok || res.type === 'opaque') {
    return res;
  }
  const buf = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || guessContentType(routeUrl);
  let casHeader = 'PASS (MEM-v11)';
  let shaHeader = '';
  try {
    const put = await putV11Blob(new Uint8Array(buf), routeUrl.includes('.wasm'));
    await putRouteEntry(routeUrl, {
      routeUrl,
      sha512: put.sha512,
      shard: put.shard,
      fname: put.fname,
      contentType,
      size: put.size,
      storedAt: Date.now(),
    });
    casHeader = put.casHit
      ? (put.persisted ? 'HIT (OPFS-v11-DEDUP)' : 'HIT (MEM-v11)')
      : (put.persisted ? 'MISS (STORED OPFS-v11)' : 'MISS (STORED MEM-v11)');
    shaHeader = put.sha512;
  } catch {}
  const extra = { 'X-Holo-CAS': casHeader };
  if (shaHeader) extra['X-Holo-SHA512'] = shaHeader;
  return withHoloHeaders(buf, res.status, contentType, extra);
}

async function serveFromOpfsRoute(routeUrl) {
  try {
    const entry = await getRouteEntry(routeUrl);
    if (!entry) return null;
    const buf = await getV11Blob(entry.shard, entry.fname);
    if (!buf) return null;
    return withHoloHeaders(buf, 200, entry.contentType || guessContentType(routeUrl), {
      'X-Holo-CAS': 'HIT (OPFS-v11)',
      'X-Holo-SHA512': entry.sha512,
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Dismantled holo-gitlab-api (OPFS:/v11/gitlab-api-state.json + v11 CAS blobs)
// Zero Ruby/Rails, zero server, zero Cache API.
// ---------------------------------------------------------------------------

let gitlabState = null;
let gitlabStatePromise = null;
let gitlabStatePersisted = false;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const SEED_FILES = [
  {
    path: 'README.md',
    executable: false,
    content: [
      '# hello-holo',
      '',
      'Dismantled GitLab + Git Smart-HTTP + Holo v11 CAS demo running 100% inside',
      '`holo-web-service-worker.js` (`OPFS:/v11/`, zero Ruby/Rails, zero Cache API).',
      '',
      '- **REST API:** `/api/v4/projects/1`',
      '- **Git Smart-HTTP:** `/awesome-os/hello-holo.git/info/refs?service=git-upload-pack`',
      '- **Native Holo v11 Tree:** `/api/holo/v11/projects/1/tree`',
      '',
    ].join('\n'),
  },
  {
    path: '.gitlab-ci.yml',
    executable: false,
    content: [
      'stages:',
      '  - build',
      '  - verify',
      '',
      'holo-v11-cas-pack:',
      '  stage: build',
      '  script:',
      '    - holo-compiler pack --abi 0x33564742 --out v11-tree.json',
      '',
      'sectium-smoke:',
      '  stage: verify',
      '  script:',
      '    - sectium-es --test src/main.mts',
      '',
    ].join('\n'),
  },
  {
    path: 'src/main.mts',
    executable: false,
    content: [
      'export const ABI_MAGIC = 0x33564742;',
      '',
      'export function greetHolo(target = "Sectium"): string {',
      '  return `Hello ${target} from OPFS:/v11/ CAS (ABI 0x${ABI_MAGIC.toString(16)})`;',
      '}',
      '',
      'console.log(greetHolo());',
      '',
    ].join('\n'),
  },
  {
    path: 'public/index.html',
    executable: false,
    content: [
      '<!doctype html>',
      '<html lang="en">',
      '<head><meta charset="utf-8"><title>hello-holo (OPFS v11)</title></head>',
      '<body>',
      '  <h1>awesome-os/hello-holo</h1>',
      '  <p>Served directly from OPFS:/v11/files/ via holo-web-sw/v11.3.</p>',
      '</body>',
      '</html>',
      '',
    ].join('\n'),
  },
];

async function computeCommitOid(seedText) {
  const hex = await digestHex('SHA-256', textEncoder.encode(seedText));
  return hex.slice(0, 40);
}

async function createSeededGitLabState() {
  const now = new Date().toISOString();
  const files = [];
  for (const item of SEED_FILES) {
    const put = await putV11Blob(textEncoder.encode(item.content), Boolean(item.executable));
    files.push({
      path: item.path,
      sha512: put.sha512,
      size: put.size,
      executable: Boolean(item.executable),
      blobPath: put.blobPath,
    });
  }

  const initialCommitId = await computeCommitOid(
    `awesome-os/hello-holo|initial|${files.map((f) => `${f.path}:${f.sha512}`).join(',')}`
  );

  const initialCommit = {
    id: initialCommitId,
    short_id: initialCommitId.slice(0, 8),
    title: 'Initial holo v11 CAS seed commit',
    message: 'Initial holo v11 CAS seed commit\n\nSeeded README.md, .gitlab-ci.yml, src/main.mts, and public/index.html into OPFS:/v11/files/.',
    author_name: 'Lumi Holo Bot',
    author_email: 'lumi@awesome-os.com',
    committer_name: 'Lumi Holo Bot',
    committer_email: 'lumi@awesome-os.com',
    authored_date: now,
    committed_date: now,
    created_at: now,
    branch: 'main',
    parent_ids: [],
  };

  return {
    schema: 'awesome-os.holo-gitlab-state.v1',
    abiMagic: B8G_ABI_MAGIC_V3,
    nextIssueId: 103,
    nextMrId: 202,
    nextPipelineId: 302,
    projects: [
      {
        id: 1,
        name: 'hello-holo',
        path: 'hello-holo',
        namespace: 'awesome-os',
        path_with_namespace: 'awesome-os/hello-holo',
        description: 'Zero-server dismantled GitLab repository backed by OPFS:/v11/ CAS blobs.',
        visibility: 'public',
        default_branch: 'main',
        created_at: now,
        last_activity_at: now,
        files,
        branches: [
          {
            name: 'main',
            commit_id: initialCommitId,
            merged: false,
            protected: true,
            default: true,
          },
        ],
        commits: [initialCommit],
        issues: [
          {
            id: 101,
            iid: 1,
            project_id: 1,
            title: 'Replace legacy tarballs with canonical v11-tree.json manifests',
            description: 'Serve SHA-512 content-addressed blobs directly from OPFS:/v11/files/<shard>/<sha512>.',
            state: 'opened',
            labels: ['holo-v11', 'opfs-cas'],
            author: { username: 'lumi', name: 'Lumi Holo Bot' },
            created_at: now,
            updated_at: now,
          },
          {
            id: 102,
            iid: 2,
            project_id: 1,
            title: 'Verify Git Smart-HTTP pkt-line advertisement in ServiceWorker',
            description: 'Ensure /awesome-os/hello-holo.git/info/refs?service=git-upload-pack emits exact 4-hex pkt-line framing.',
            state: 'opened',
            labels: ['git-smart-http', 'verification'],
            author: { username: 'lumi', name: 'Lumi Holo Bot' },
            created_at: now,
            updated_at: now,
          },
        ],
        merge_requests: [
          {
            id: 201,
            iid: 1,
            project_id: 1,
            title: 'feat: enable zero-copy OPFS v11 tree endpoint',
            description: 'Exposes /api/holo/v11/projects/1/tree with B8G_ABI_MAGIC_V3 (0x33564742).',
            state: 'opened',
            source_branch: 'feat/v11-cas-tree',
            target_branch: 'main',
            sha: initialCommitId,
            merge_status: 'can_be_merged',
            labels: ['holo-v11'],
            author: { username: 'lumi', name: 'Lumi Holo Bot' },
            created_at: now,
            updated_at: now,
            merged_at: null,
          },
        ],
        pipelines: [
          {
            id: 301,
            iid: 1,
            project_id: 1,
            sha: initialCommitId,
            ref: 'main',
            status: 'success',
            source: 'push',
            holo_runtime: 'b8g-v11',
            created_at: now,
            updated_at: now,
          },
        ],
      },
    ],
  };
}

async function saveGitLabState(state) {
  gitlabState = state;
  try {
    const dirs = await getOpfsDirs();
    if (dirs) {
      const bytes = textEncoder.encode(JSON.stringify(state));
      gitlabStatePersisted = await writeOpfsFile(dirs.v11, GITLAB_STATE_FILE, bytes);
      return gitlabStatePersisted;
    }
  } catch {
    gitlabStatePersisted = false;
  }
  return false;
}

async function getGitLabState() {
  if (gitlabState) return gitlabState;
  if (!gitlabStatePromise) {
    gitlabStatePromise = (async () => {
      try {
        const dirs = await getOpfsDirs();
        if (dirs) {
          const raw = await readOpfsFile(dirs.v11, GITLAB_STATE_FILE);
          if (raw) {
            const parsed = JSON.parse(textDecoder.decode(raw));
            if (parsed && Array.isArray(parsed.projects) && parsed.projects.length > 0) {
              gitlabState = parsed;
              gitlabStatePersisted = true;
              return gitlabState;
            }
          }
        }
      } catch {}
      const seeded = await createSeededGitLabState();
      await saveGitLabState(seeded);
      return seeded;
    })().finally(() => {
      gitlabStatePromise = null;
    });
  }
  return gitlabStatePromise;
}

function findProject(state, rawId) {
  let decoded = rawId;
  try { decoded = decodeURIComponent(rawId); } catch {}
  const numeric = Number(decoded);
  return state.projects.find(
    (p) =>
      (Number.isInteger(numeric) && String(p.id) === decoded) ||
      p.path_with_namespace.toLowerCase() === decoded.toLowerCase() ||
      p.path.toLowerCase() === decoded.toLowerCase()
  ) || null;
}

function formatProjectResponse(project, url, mountPrefix) {
  const origin = url.origin;
  const host = url.host || 'awesome-os.com';
  const repoPath = `${mountPrefix}${project.path_with_namespace}`;
  return {
    id: project.id,
    name: project.name,
    path: project.path,
    path_with_namespace: project.path_with_namespace,
    namespace: {
      id: 1,
      name: project.namespace,
      path: project.namespace,
      full_path: project.namespace,
    },
    description: project.description,
    visibility: project.visibility,
    default_branch: project.default_branch,
    created_at: project.created_at,
    last_activity_at: project.last_activity_at,
    web_url: `${origin}/${repoPath}`,
    http_url_to_repo: `${origin}/${repoPath}.git`,
    ssh_url_to_repo: `git@${host}:${project.path_with_namespace}.git`,
    holo_repository_uri: `holo://v11/${project.path_with_namespace}`,
    holo_project_uri: `holo://v11/projects/${project.id}`,
  };
}

function formatBranchResponse(project, branch) {
  const commit = project.commits.find((c) => c.id === branch.commit_id) || project.commits[0] || null;
  return {
    name: branch.name,
    merged: Boolean(branch.merged),
    protected: Boolean(branch.protected),
    default: branch.name === project.default_branch,
    developers_can_push: true,
    developers_can_merge: true,
    can_push: true,
    commit: commit
      ? {
          id: commit.id,
          short_id: commit.short_id,
          title: commit.title,
          message: commit.message,
          author_name: commit.author_name,
          author_email: commit.author_email,
          authored_date: commit.authored_date,
          committed_date: commit.committed_date,
          created_at: commit.created_at,
        }
      : null,
  };
}

function apiJsonResponse(req, payload, status = 200, extra = {}) {
  const body = req.method === 'HEAD' ? null : JSON.stringify(payload);
  return withHoloHeaders(body, status, 'application/json; charset=utf-8', {
    'Cache-Control': 'no-store',
    'X-Holo-GitLab-API': 'dismantled-opfs-v11',
    ...extra,
  });
}

async function readJsonBody(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function normalizeLabels(labels) {
  if (Array.isArray(labels)) return labels.map((l) => String(l).trim()).filter(Boolean);
  if (typeof labels === 'string') return labels.split(',').map((l) => l.trim()).filter(Boolean);
  return [];
}

function encodeGitPktLine(payload) {
  const byteLen = textEncoder.encode(payload).byteLength;
  const totalLen = byteLen + 4;
  return totalLen.toString(16).padStart(4, '0') + payload;
}

async function handleGitInfoRefs(req, url, org, repo) {
  const service = url.searchParams.get('service');
  if (service !== 'git-upload-pack' && service !== 'git-receive-pack') {
    return withHoloHeaders(
      req.method === 'HEAD' ? null : 'Unsupported or missing Git Smart-HTTP service parameter',
      400,
      'text/plain; charset=utf-8'
    );
  }

  const state = await getGitLabState();
  const project = findProject(state, `${org}/${repo}`);
  if (!project) {
    return withHoloHeaders(
      req.method === 'HEAD' ? null : 'Repository not found',
      404,
      'text/plain; charset=utf-8'
    );
  }

  const defaultBranch =
    project.branches.find((b) => b.name === project.default_branch) || project.branches[0];
  const headOid =
    (defaultBranch && defaultBranch.commit_id) ||
    (project.commits[0] && project.commits[0].id) ||
    '0'.repeat(40);

  const lines = [
    encodeGitPktLine(`# service=${service}\n`),
    '0000',
    encodeGitPktLine(
      `${headOid} HEAD\0multi_ack thin-pack side-band-64k ofs-delta agent=awesome-os/holo-gitaly-v11\n`
    ),
  ];

  for (const branch of project.branches) {
    lines.push(encodeGitPktLine(`${branch.commit_id} refs/heads/${branch.name}\n`));
  }
  lines.push('0000');

  const body = req.method === 'HEAD' ? null : lines.join('');
  return withHoloHeaders(body, 200, `application/x-${service}-advertisement`, {
    'Cache-Control': 'no-cache',
    'X-Holo-Git-Protocol': 'smart-http-v11',
  });
}

async function handleHoloApiRequest(req, url, apiPath, mountPrefix) {
  const method = req.method.toUpperCase();
  const cleanPath = apiPath.length > 1 && apiPath.endsWith('/') ? apiPath.slice(0, -1) : apiPath;

  // --- Better Native Holo v11 API (/api/holo/v11/*) ---
  if (cleanPath === '/api/holo/v11/status' && (method === 'GET' || method === 'HEAD')) {
    const [opfsStats, state] = await Promise.all([listOpfsStats(), getGitLabState()]);
    return apiJsonResponse(req, {
      ...opfsStats,
      swVersion: SW_VERSION,
      abiMagic: B8G_ABI_MAGIC_V3,
      cacheApiBypassed: true,
      gitlabStateFile: `OPFS:/v11/${GITLAB_STATE_FILE}`,
      gitlabStatePersisted,
      projectCount: state.projects.length,
    });
  }

  const holoTreeMatch = cleanPath.match(/^\/api\/holo\/v11\/projects\/([^/]+)\/tree$/);
  if (holoTreeMatch && (method === 'GET' || method === 'HEAD')) {
    const state = await getGitLabState();
    const project = findProject(state, holoTreeMatch[1]);
    if (!project) return apiJsonResponse(req, { message: '404 Project Not Found' }, 404);
    const defaultBranch =
      project.branches.find((b) => b.name === project.default_branch) || project.branches[0];
    return apiJsonResponse(req, {
      schema: 'awesome-os.v11-tree.v1',
      abiMagic: B8G_ABI_MAGIC_V3,
      overridesLegacyTar: true,
      projectId: project.id,
      project: project.path_with_namespace,
      branch: defaultBranch ? defaultBranch.name : project.default_branch,
      commit: defaultBranch ? defaultBranch.commit_id : null,
      files: project.files.map((f) => ({
        path: f.path,
        sha512: f.sha512,
        size: f.size,
        executable: Boolean(f.executable),
        blobPath: f.blobPath,
      })),
    });
  }

  // --- Legacy GitLab REST API (/api/v4/*) ---
  if (cleanPath === '/api/v4/projects' && (method === 'GET' || method === 'HEAD')) {
    const state = await getGitLabState();
    return apiJsonResponse(
      req,
      state.projects.map((p) => formatProjectResponse(p, url, mountPrefix))
    );
  }

  const projectMatch = cleanPath.match(/^\/api\/v4\/projects\/([^/]+)(?:\/(.*))?$/);
  if (projectMatch) {
    const state = await getGitLabState();
    const project = findProject(state, projectMatch[1]);
    if (!project) return apiJsonResponse(req, { message: '404 Project Not Found' }, 404);
    const subPath = projectMatch[2] || '';

    // GET /api/v4/projects/:id
    if (subPath === '' && (method === 'GET' || method === 'HEAD')) {
      return apiJsonResponse(req, formatProjectResponse(project, url, mountPrefix));
    }

    // GET /api/v4/projects/:id/repository/tree
    if (subPath === 'repository/tree' && (method === 'GET' || method === 'HEAD')) {
      const prefixFilter = (url.searchParams.get('path') || '').replace(/^\/+|\/+$/g, '');
      const items = project.files
        .filter((f) => !prefixFilter || f.path === prefixFilter || f.path.startsWith(`${prefixFilter}/`))
        .map((f) => ({
          id: f.sha512,
          name: f.path.split('/').pop() || f.path,
          path: f.path,
          type: 'blob',
          mode: f.executable ? '100755' : '100644',
        }));
      return apiJsonResponse(req, items);
    }

    // GET /api/v4/projects/:id/repository/commits
    if (subPath === 'repository/commits' && (method === 'GET' || method === 'HEAD')) {
      const refName = url.searchParams.get('ref_name');
      const commits = refName
        ? project.commits.filter((c) => !c.branch || c.branch === refName)
        : project.commits;
      return apiJsonResponse(req, commits);
    }

    // POST /api/v4/projects/:id/repository/commits
    if (subPath === 'repository/commits' && method === 'POST') {
      const body = await readJsonBody(req);
      const branchName = String(body.branch || project.default_branch || 'main').trim();
      const commitMessage = String(body.commit_message || 'Update repository files').trim();
      const actions = Array.isArray(body.actions) ? body.actions : [];

      if (!commitMessage) {
        return apiJsonResponse(req, { message: 'commit_message is required' }, 400);
      }

      const fileMap = new Map(project.files.map((f) => [f.path, f]));
      const storedBlobs = [];

      for (const act of actions) {
        if (!act || !act.file_path) continue;
        const filePath = String(act.file_path).replace(/^\/+/, '');
        const actionType = String(act.action || 'update').toLowerCase();

        if (actionType === 'delete') {
          fileMap.delete(filePath);
          continue;
        }
        if (actionType === 'move' && act.previous_path) {
          fileMap.delete(String(act.previous_path).replace(/^\/+/, ''));
        }
        const rawContent = typeof act.content === 'string' ? act.content : '';
        const bytes = textEncoder.encode(rawContent);
        const executable = Boolean(act.executable);
        const put = await putV11Blob(bytes, executable);
        const entry = {
          path: filePath,
          sha512: put.sha512,
          size: put.size,
          executable,
          blobPath: put.blobPath,
        };
        fileMap.set(filePath, entry);
        storedBlobs.push(entry);
      }

      project.files = Array.from(fileMap.values()).sort((a, b) => a.path.localeCompare(b.path));

      const now = new Date().toISOString();
      const existingBranch = project.branches.find((b) => b.name === branchName);
      const parentId = existingBranch
        ? existingBranch.commit_id
        : (project.commits[0] ? project.commits[0].id : null);

      const commitId = await computeCommitOid(
        `${project.path_with_namespace}|${branchName}|${now}|${commitMessage}|${project.files.map((f) => `${f.path}:${f.sha512}`).join(',')}`
      );

      const commitObj = {
        id: commitId,
        short_id: commitId.slice(0, 8),
        title: commitMessage.split('\n')[0],
        message: commitMessage,
        author_name: String(body.author_name || 'Lumi Holo Bot'),
        author_email: String(body.author_email || 'lumi@awesome-os.com'),
        committer_name: String(body.author_name || 'Lumi Holo Bot'),
        committer_email: String(body.author_email || 'lumi@awesome-os.com'),
        authored_date: now,
        committed_date: now,
        created_at: now,
        branch: branchName,
        parent_ids: parentId ? [parentId] : [],
      };

      project.commits.unshift(commitObj);
      if (existingBranch) {
        existingBranch.commit_id = commitId;
      } else {
        project.branches.push({
          name: branchName,
          commit_id: commitId,
          merged: false,
          protected: false,
          default: false,
        });
      }
      project.last_activity_at = now;

      const pipelineIid = project.pipelines.length + 1;
      project.pipelines.unshift({
        id: state.nextPipelineId++,
        iid: pipelineIid,
        project_id: project.id,
        sha: commitId,
        ref: branchName,
        status: 'success',
        source: 'api',
        holo_runtime: 'b8g-v11',
        created_at: now,
        updated_at: now,
      });

      await saveGitLabState(state);
      return apiJsonResponse(req, { ...commitObj, v11_blobs: storedBlobs }, 201);
    }

    // GET /api/v4/projects/:id/repository/branches
    if (subPath === 'repository/branches' && (method === 'GET' || method === 'HEAD')) {
      return apiJsonResponse(
        req,
        project.branches.map((b) => formatBranchResponse(project, b))
      );
    }

    // POST /api/v4/projects/:id/repository/branches
    if (subPath === 'repository/branches' && method === 'POST') {
      const body = await readJsonBody(req);
      const branchName = String(body.branch || url.searchParams.get('branch') || '').trim();
      const ref = String(body.ref || url.searchParams.get('ref') || project.default_branch || 'main').trim();

      if (!branchName) {
        return apiJsonResponse(req, { message: 'branch is required' }, 400);
      }
      if (project.branches.some((b) => b.name === branchName)) {
        return apiJsonResponse(req, { message: 'Branch already exists' }, 400);
      }

      const refBranch = project.branches.find((b) => b.name === ref);
      const refCommit = project.commits.find((c) => c.id === ref || c.short_id === ref);
      const targetCommitId =
        (refBranch && refBranch.commit_id) ||
        (refCommit && refCommit.id) ||
        (project.commits[0] && project.commits[0].id) ||
        '0'.repeat(40);

      const newBranch = {
        name: branchName,
        commit_id: targetCommitId,
        merged: false,
        protected: false,
        default: false,
      };
      project.branches.push(newBranch);
      project.last_activity_at = new Date().toISOString();
      await saveGitLabState(state);
      return apiJsonResponse(req, formatBranchResponse(project, newBranch), 201);
    }

    // GET /api/v4/projects/:id/issues
    if (subPath === 'issues' && (method === 'GET' || method === 'HEAD')) {
      const filterState = url.searchParams.get('state');
      const issues = filterState && filterState !== 'all'
        ? project.issues.filter((i) => i.state === filterState)
        : project.issues;
      return apiJsonResponse(req, issues);
    }

    // POST /api/v4/projects/:id/issues
    if (subPath === 'issues' && method === 'POST') {
      const body = await readJsonBody(req);
      const title = String(body.title || '').trim();
      if (!title) {
        return apiJsonResponse(req, { message: 'title is required' }, 400);
      }
      const now = new Date().toISOString();
      const nextIid = project.issues.reduce((max, i) => Math.max(max, i.iid), 0) + 1;
      const issue = {
        id: state.nextIssueId++,
        iid: nextIid,
        project_id: project.id,
        title,
        description: String(body.description || ''),
        state: 'opened',
        labels: normalizeLabels(body.labels),
        author: { username: 'lumi', name: 'Lumi Holo Bot' },
        created_at: now,
        updated_at: now,
      };
      project.issues.unshift(issue);
      project.last_activity_at = now;
      await saveGitLabState(state);
      return apiJsonResponse(req, issue, 201);
    }

    // PUT /api/v4/projects/:id/issues/:iid
    const issueIidMatch = subPath.match(/^issues\/(\d+)$/);
    if (issueIidMatch && method === 'PUT') {
      const iid = Number(issueIidMatch[1]);
      const issue = project.issues.find((i) => i.iid === iid);
      if (!issue) return apiJsonResponse(req, { message: '404 Issue Not Found' }, 404);

      const body = await readJsonBody(req);
      if (body.state_event === 'close') issue.state = 'closed';
      else if (body.state_event === 'reopen') issue.state = 'opened';
      if (typeof body.title === 'string' && body.title.trim()) issue.title = body.title.trim();
      if (typeof body.description === 'string') issue.description = body.description;
      if (body.labels !== undefined) issue.labels = normalizeLabels(body.labels);
      issue.updated_at = new Date().toISOString();
      project.last_activity_at = issue.updated_at;
      await saveGitLabState(state);
      return apiJsonResponse(req, issue, 200);
    }

    // GET /api/v4/projects/:id/merge_requests
    if (subPath === 'merge_requests' && (method === 'GET' || method === 'HEAD')) {
      const filterState = url.searchParams.get('state');
      const mrs = filterState && filterState !== 'all'
        ? project.merge_requests.filter((m) => m.state === filterState)
        : project.merge_requests;
      return apiJsonResponse(req, mrs);
    }

    // POST /api/v4/projects/:id/merge_requests
    if (subPath === 'merge_requests' && method === 'POST') {
      const body = await readJsonBody(req);
      const title = String(body.title || '').trim();
      const sourceBranch = String(body.source_branch || '').trim();
      const targetBranch = String(body.target_branch || project.default_branch || 'main').trim();
      if (!title || !sourceBranch) {
        return apiJsonResponse(req, { message: 'title and source_branch are required' }, 400);
      }

      const now = new Date().toISOString();
      const nextIid = project.merge_requests.reduce((max, m) => Math.max(max, m.iid), 0) + 1;
      const src = project.branches.find((b) => b.name === sourceBranch);
      const sha =
        (src && src.commit_id) ||
        (project.commits[0] && project.commits[0].id) ||
        '0'.repeat(40);

      const mr = {
        id: state.nextMrId++,
        iid: nextIid,
        project_id: project.id,
        title,
        description: String(body.description || ''),
        state: 'opened',
        source_branch: sourceBranch,
        target_branch: targetBranch,
        sha,
        merge_status: 'can_be_merged',
        labels: normalizeLabels(body.labels),
        author: { username: 'lumi', name: 'Lumi Holo Bot' },
        created_at: now,
        updated_at: now,
        merged_at: null,
      };
      project.merge_requests.unshift(mr);
      project.last_activity_at = now;
      await saveGitLabState(state);
      return apiJsonResponse(req, mr, 201);
    }

    // PUT /api/v4/projects/:id/merge_requests/:iid/merge
    const mrMergeMatch = subPath.match(/^merge_requests\/(\d+)\/merge$/);
    if (mrMergeMatch && method === 'PUT') {
      const iid = Number(mrMergeMatch[1]);
      const mr = project.merge_requests.find((m) => m.iid === iid);
      if (!mr) return apiJsonResponse(req, { message: '404 Merge Request Not Found' }, 404);

      const now = new Date().toISOString();
      if (mr.state !== 'merged') {
        const targetBranch =
          project.branches.find((b) => b.name === mr.target_branch) || project.branches[0];
        const sourceBranch = project.branches.find((b) => b.name === mr.source_branch);
        const parentIds = [];
        if (targetBranch && targetBranch.commit_id) parentIds.push(targetBranch.commit_id);
        if (sourceBranch && sourceBranch.commit_id && sourceBranch.commit_id !== parentIds[0]) {
          parentIds.push(sourceBranch.commit_id);
        }

        const mergeMsg = `Merge branch '${mr.source_branch}' into '${mr.target_branch}' (!${mr.iid}: ${mr.title})`;
        const mergeCommitId = await computeCommitOid(
          `${project.path_with_namespace}|merge|${mr.iid}|${now}|${parentIds.join(',')}`
        );

        project.commits.unshift({
          id: mergeCommitId,
          short_id: mergeCommitId.slice(0, 8),
          title: mergeMsg,
          message: mergeMsg,
          author_name: 'Lumi Holo Bot',
          author_email: 'lumi@awesome-os.com',
          committer_name: 'Lumi Holo Bot',
          committer_email: 'lumi@awesome-os.com',
          authored_date: now,
          committed_date: now,
          created_at: now,
          branch: mr.target_branch,
          parent_ids: parentIds,
        });

        if (targetBranch) targetBranch.commit_id = mergeCommitId;
        if (sourceBranch) sourceBranch.merged = true;

        mr.state = 'merged';
        mr.merge_commit_sha = mergeCommitId;
        mr.merged_at = now;
        mr.updated_at = now;
        project.last_activity_at = now;

        project.pipelines.unshift({
          id: state.nextPipelineId++,
          iid: project.pipelines.length + 1,
          project_id: project.id,
          sha: mergeCommitId,
          ref: mr.target_branch,
          status: 'success',
          source: 'merge_request_event',
          holo_runtime: 'b8g-v11',
          created_at: now,
          updated_at: now,
        });

        await saveGitLabState(state);
      }
      return apiJsonResponse(req, mr, 200);
    }

    // GET /api/v4/projects/:id/pipelines
    if (subPath === 'pipelines' && (method === 'GET' || method === 'HEAD')) {
      const origin = url.origin;
      const repoPath = `${mountPrefix}${project.path_with_namespace}`;
      return apiJsonResponse(
        req,
        project.pipelines.map((pl) => ({
          ...pl,
          web_url: `${origin}/${repoPath}/-/pipelines/${pl.id}`,
        }))
      );
    }
  }

  return apiJsonResponse(req, { message: '404 Not Found', path: apiPath, method }, 404);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const method = req.method.toUpperCase();
  const isApiOrGitMethod = method === 'GET' || method === 'HEAD' || method === 'POST' || method === 'PUT';

  // 0a. Dismantled holo-gitlab-api (/api/v4/* and /api/holo/v11/*, with optional /apps/ or /demo/ prefix)
  const apiMatch = url.pathname.match(/^\/(?:(apps|demo)\/)?(api\/.*)$/);
  if (apiMatch && isApiOrGitMethod) {
    const mountPrefix = apiMatch[1] ? `${apiMatch[1]}/` : '';
    const apiPath = `/${apiMatch[2]}`;
    event.respondWith(handleHoloApiRequest(req, url, apiPath, mountPrefix));
    return;
  }

  // 0b. Legacy Git Smart-HTTP Wire Protocol (/(?:apps/|demo/)?<org>/<repo>.git/info/refs)
  const gitRefsMatch = url.pathname.match(/^\/(?:(?:apps|demo)\/)?([^/]+)\/([^/]+)\.git\/info\/refs$/);
  if (gitRefsMatch && isApiOrGitMethod) {
    event.respondWith(handleGitInfoRefs(req, url, gitRefsMatch[1], gitRefsMatch[2]));
    return;
  }

  // Normal static asset & v11 CAS blob fetches remain strictly GET / HEAD
  if (method !== 'GET' && method !== 'HEAD') return;

  const routeUrl = url.pathname + url.search;

  // 1. Direct OPFS v11 CAS blob endpoint: /v11/files/<shard>/<sha512>[-exec]
  const v11Match = url.pathname.match(/^\/(?:(?:apps|demo)\/)?v11\/files\/([0-9a-f]{2})\/([0-9a-f]{128}(?:-exec)?)$/i);
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
        return await fetchAndStoreOpfs(req, routeUrl);
      } catch {
        const cached = await serveFromOpfsRoute(routeUrl);
        if (cached) return cached;
        return withHoloHeaders('Offline and not yet cached in OPFS:/v11/', 503, 'text/plain; charset=utf-8');
      }
    })());
    return;
  }

  // 3. Static / binary assets (.wasm, .b8p, .js, .css): OPFS-first, never fail fetch on OPFS error
  event.respondWith((async () => {
    const cached = await serveFromOpfsRoute(routeUrl);
    if (cached) return cached;
    try {
      return await fetchAndStoreOpfs(req, routeUrl);
    } catch {
      return fetch(req);
    }
  })());
});
