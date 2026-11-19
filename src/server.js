import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLibrary } from './store.js';
import { rescan, setManualMatch } from './library.js';
import { isMounted, MEDIA_ROOT } from './scanner.js';
import { hasKey } from './tmdb.js';

const app = express();
app.use(express.json());
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')));

let lib = await loadLibrary();
let scanning = null; // { done, total } while a scan runs

const norm = (s) => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

app.get('/api/library', (req, res) => {
  const { category, kind, q, genre, status, sort = 'title', order } = req.query;
  let items = lib.items;
  if (category && category !== 'All') items = items.filter((i) => i.category === category);
  if (kind) items = items.filter((i) => i.kind === kind);
  if (genre) items = items.filter((i) => i.tmdb?.genres?.includes(genre));
  if (status === 'unmatched') items = items.filter((i) => !i.tmdb);
  if (q) {
    const n = norm(q);
    items = items.filter((i) => norm(i.title).includes(n) || norm(i.tmdb?.title).includes(n) || norm(i.tmdb?.originalTitle).includes(n) || String(i.year) === q);
  }

  const sortTitle = (t) => norm(t).replace(/^(the|a|an) /, '');
  const keys = {
    title: (i) => sortTitle(i.title),
    year: (i) => i.year ?? 0,
    rating: (i) => i.tmdb?.rating ?? -1,
    added: (i) => i.addedAt || '',
    size: (i) => i.size || 0,
  };
  const key = keys[sort] || keys.title;
  const dir = (order || (sort === 'title' ? 'asc' : 'desc')) === 'asc' ? 1 : -1;
  items = [...items].sort((a, b) => {
    const ka = key(a), kb = key(b);
    if (ka < kb) return -dir;
    if (ka > kb) return dir;
    return sortTitle(a.title).localeCompare(sortTitle(b.title)); // ties: A→Z
  });

  res.json({ count: items.length, items });
});

app.get('/api/stats', async (_req, res) => {
  const counts = {};
  const genres = new Set();
  for (const i of lib.items) {
    counts[i.category] = (counts[i.category] || 0) + 1;
    i.tmdb?.genres?.forEach((g) => genres.add(g));
  }
  res.json({
    total: lib.items.length,
    counts,
    unmatched: lib.items.filter((i) => !i.tmdb).length,
    genres: [...genres].sort(),
    scannedAt: lib.scannedAt,
    mounted: await isMounted(),
    mediaRoot: MEDIA_ROOT,
    hasKey: hasKey(),
    scanning,
  });
});

app.post('/api/scan', async (req, res) => {
  if (scanning) return res.status(409).json({ error: 'Scan already running', scanning });
  scanning = { done: 0, total: 0 };
  try {
    const result = await rescan({
      refresh: Boolean(req.body?.refresh),
      onProgress: (done, total) => (scanning = { done, total }),
    });
    lib = result.lib;
    res.json(result.stats);
  } catch (e) {
    res.status(e.code === 'NOT_MOUNTED' ? 503 : 500).json({ error: e.message });
  } finally {
    scanning = null;
  }
});

app.patch('/api/items/:id', async (req, res) => {
  const tmdbId = Number(String(req.body?.tmdbId || '').match(/\d+/)?.[0]);
  if (!tmdbId) return res.status(400).json({ error: 'tmdbId (number or TMDB URL) required' });
  try {
    const item = await setManualMatch(lib, req.params.id, tmdbId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Media Watch → http://localhost:${PORT}  (${lib.items.length} cached titles)`);
  if (!hasKey()) console.log('⚠  TMDB_API_KEY not set — copy .env.example to .env and add your key.');
});
