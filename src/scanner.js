import fs from 'node:fs/promises';
import path from 'node:path';
import { parseName, parseEpisode, showNameFromEpisode, isVideo, extOf, slug } from './parse.js';

export const MEDIA_ROOT = process.env.MEDIA_ROOT || '/Volumes/Media/Video';

// [relative dir, category, kind]
const ROOTS = [
  ['Movies', 'Movies', 'movie'],
  ['Series', 'Series', 'tv'],
  ['Anime/Movies', 'Anime', 'movie'],
  ['Anime/Series', 'Anime', 'tv'],
];

const hidden = (n) => n.startsWith('.') || n.startsWith('@') || n === '#recycle';

async function listDir(dir) {
  try {
    return (await fs.readdir(dir, { withFileTypes: true })).filter((d) => !hidden(d.name));
  } catch {
    return [];
  }
}

// Run async fn over items with limited concurrency (network shares are latency-bound, not throughput-bound).
async function pMap(list, fn, limit = 16) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i], i);
    }
  }));
  return out;
}

// SMB shares can intermittently hang on stat (seen with ':' in names). Cap each call so one
// bad file can't stall the scan; the file is still listed, just without size/date.
const STAT_TIMEOUT_MS = 15000;
export const slowFiles = [];

async function statFile(p, name) {
  let timer;
  const timeout = new Promise((r) => (timer = setTimeout(() => r('timeout'), STAT_TIMEOUT_MS)));
  const st = await Promise.race([fs.stat(p).catch(() => null), timeout]);
  clearTimeout(timer);
  if (st === 'timeout') {
    slowFiles.push(p);
    return { path: p, name, size: 0, mtime: 0, ext: extOf(name) };
  }
  return st && { path: p, name, size: st.size, mtime: st.mtimeMs, ext: extOf(name) };
}

async function videoFilesIn(dir) {
  const entries = await listDir(dir);
  const nested = await pMap(entries, async (d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return videoFilesIn(p);
    if (isVideo(d.name)) return [await statFile(p, d.name)].filter(Boolean);
    return [];
  }, 8);
  return nested.flat();
}

export async function isMounted() {
  try {
    await fs.access(MEDIA_ROOT);
    return true;
  } catch {
    return false;
  }
}

/** Scan disk and return a Map<id, item> (without TMDB data). */
export async function scanLibrary() {
  const items = new Map();

  for (const [rel, category, kind] of ROOTS) {
    const root = path.join(MEDIA_ROOT, rel);
    const entries = (await listDir(root)).filter((d) => d.isDirectory() || isVideo(d.name)); // skip .srt etc.
    const gathered = await pMap(entries, async (d) => {
      const full = path.join(root, d.name);
      const files = d.isDirectory() ? await videoFilesIn(full) : [await statFile(full, d.name)].filter(Boolean);
      return { d, full, files };
    });

    for (const { d, full, files } of gathered) {
      if (!files.length) continue;
      // Loose episode files directly in a TV root ("Show - 01 - Title.mkv") → group under the show name
      const looseEpisode = kind === 'tv' && !d.isDirectory() ? showNameFromEpisode(d.name) : null;
      const { title, year, edition } = parseName(looseEpisode || d.name);
      const id = `${category.toLowerCase()}:${kind}:${slug(title)}${year ? '-' + year : ''}`;

      let item = items.get(id);
      if (!item) {
        item = { id, category, kind, title, year, editions: [], files: [], episodeCount: null, seasons: null, addedAt: null, folder: d.isDirectory() ? full : root };
        items.set(id, item);
      }
      if (edition && !item.editions.includes(edition)) item.editions.push(edition);
      item.files.push(...files.map(({ path: p, size, ext, name }) => ({ path: p, name, size, ext })));

      const newest = Math.max(...files.map((f) => f.mtime));
      item.addedAt = new Date(Math.max(newest, item.addedAt ? Date.parse(item.addedAt) : 0)).toISOString();

      if (kind === 'tv') {
        const alt = showNameFromEpisode(item.files[0].name);
        if (alt && alt.toLowerCase() !== item.title.toLowerCase()) item.altTitle = alt;
        item.episodeCount = item.files.length;
        const seasons = new Set(item.files.map((f) => parseEpisode(f.name)?.season).filter((s) => s != null));
        item.seasons = seasons.size || null;
      }
    }
  }

  for (const item of items.values()) {
    item.size = item.files.reduce((a, f) => a + f.size, 0);
  }
  return items;
}
