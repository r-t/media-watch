// Shared scan + enrich logic used by both the server and the CLI.
import { scanLibrary, isMounted, MEDIA_ROOT } from './scanner.js';
import { loadLibrary, saveLibrary } from './store.js';
import * as tmdb from './tmdb.js';

/**
 * Rescan the disk, merge with cached metadata, and enrich new/unmatched items.
 * @param {{refresh?: boolean, onProgress?: (done:number,total:number,item:object)=>void}} opts
 */
export async function rescan({ refresh = false, onProgress } = {}) {
  if (!(await isMounted())) {
    const err = new Error(`Media volume not mounted: ${MEDIA_ROOT}`);
    err.code = 'NOT_MOUNTED';
    throw err;
  }
  const prev = await loadLibrary();
  const prevById = new Map(prev.items.map((i) => [i.id, i]));
  const scanned = await scanLibrary();

  const items = [];
  for (const item of scanned.values()) {
    const old = prevById.get(item.id);
    if (old) {
      item.tmdb = old.tmdb ?? null;
      item.matchStatus = old.matchStatus ?? (old.tmdb ? 'matched' : 'unmatched');
    } else {
      item.tmdb = null;
      item.matchStatus = 'unmatched';
    }
    items.push(item);
  }

  const lib = { scannedAt: new Date().toISOString(), items };
  const stats = { total: items.length, added: items.filter((i) => !prevById.has(i.id)).length, removed: prev.items.filter((i) => !scanned.has(i.id)).length, enriched: 0, failed: 0 };

  if (tmdb.hasKey()) {
    const todo = items.filter((i) => i.matchStatus !== 'manual' && (refresh || !i.tmdb));
    let done = 0;
    for (const item of todo) {
      try {
        const meta = await tmdb.match(item);
        item.tmdb = meta;
        item.matchStatus = meta ? 'matched' : 'unmatched';
        meta ? stats.enriched++ : stats.failed++;
      } catch (e) {
        stats.failed++;
        item.matchError = e.message;
      }
      onProgress?.(++done, todo.length, item);
      if (done % 50 === 0) await saveLibrary(lib); // checkpoint
    }
  } else {
    stats.warning = 'TMDB_API_KEY not set — metadata skipped';
  }

  await saveLibrary(lib);
  return { lib, stats };
}

export async function setManualMatch(lib, id, tmdbId) {
  const item = lib.items.find((i) => i.id === id);
  if (!item) return null;
  item.tmdb = await tmdb.details(item.kind, tmdbId);
  item.matchStatus = 'manual';
  delete item.matchError;
  await saveLibrary(lib);
  return item;
}
