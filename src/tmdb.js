// Minimal TMDB client. Accepts either a v3 API key or a v4 read-access token in TMDB_API_KEY.
const BASE = 'https://api.themoviedb.org/3';
export const IMG_BASE = 'https://image.tmdb.org/t/p/';

const key = () => process.env.TMDB_API_KEY?.trim();
export const hasKey = () => Boolean(key());

// Simple throttle: at most ~20 requests/second.
let last = 0;
async function throttle() {
  const wait = last + 50 - Date.now();
  last = Math.max(Date.now(), last + 50);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function get(endpoint, params = {}) {
  const k = key();
  if (!k) throw new Error('TMDB_API_KEY is not set');
  const isBearer = k.length > 40; // v4 tokens are long JWTs
  const url = new URL(BASE + endpoint);
  for (const [p, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(p, v);
  if (!isBearer) url.searchParams.set('api_key', k);

  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle();
    const res = await fetch(url, { headers: isBearer ? { Authorization: `Bearer ${k}` } : {} });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`TMDB ${res.status} on ${endpoint}`);
    return res.json();
  }
  throw new Error(`TMDB rate limit on ${endpoint}`);
}

const NUMS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const normTitle = (s) => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, 'and').replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g, (w) => NUMS[w])
  .replace(/[^a-z0-9]+/g, '');

/** Score a candidate: exact title match and year proximity beat TMDB's popularity ordering. */
function score(c, title, year, rank) {
  const names = [c.title, c.original_title, c.name, c.original_name].map(normTitle);
  const cy = +(c.release_date || c.first_air_date || '').slice(0, 4) || null;
  const q = normTitle(title);
  let s = -rank * 0.25;                                 // keep TMDB's relevance as a tiebreak
  if (names.includes(q)) s += 6;                        // exact title
  else {
    // partial ("The Flash" ⊃ "Flash"), weighted by how much of the longer title overlaps
    const overlap = Math.max(0, ...names.filter((n) => n && (n.includes(q) || q.includes(n)))
      .map((n) => Math.min(n.length, q.length) / Math.max(n.length, q.length)));
    s += 3 * overlap;
  }
  if (year && cy) s += Math.max(0, 6 - 2 * Math.abs(cy - year)); // 6 exact, 4 ±1, 2 ±2
  if ((c.vote_count ?? 0) < 10) s -= 2;                 // premieres, featurettes, obscure dupes
  return s;
}

async function search(kind, title, year) {
  const endpoint = kind === 'movie' ? '/search/movie' : '/search/tv';
  // `year` on /search/movie matches ANY release (re-releases), so use primary_release_year.
  const yearParam = kind === 'movie' ? 'primary_release_year' : 'first_air_date_year';
  const seen = new Map();
  const add = (r) => (r?.results || []).forEach((c, rank) => !seen.has(c.id) && seen.set(c.id, { c, rank }));

  if (year) add(await get(endpoint, { query: title, [yearParam]: year }));
  add(await get(endpoint, { query: title }));

  let best = null, bestScore = -Infinity;
  for (const { c, rank } of seen.values()) {
    const s = score(c, title, year, rank);
    if (s > bestScore) [best, bestScore] = [c, s];
  }
  return best;
}

export async function details(kind, id) {
  const d = await get(kind === 'movie' ? `/movie/${id}` : `/tv/${id}`);
  return {
    id: d.id,
    title: d.title || d.name,
    originalTitle: d.original_title || d.original_name,
    overview: d.overview,
    genres: (d.genres || []).map((g) => g.name),
    rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
    votes: d.vote_count,
    runtime: d.runtime || d.episode_run_time?.[0] || null,
    poster: d.poster_path,
    backdrop: d.backdrop_path,
    releaseDate: d.release_date || d.first_air_date || null,
    seasons: d.number_of_seasons ?? null,
    episodes: d.number_of_episodes ?? null,
    status: d.status,
    url: `https://www.themoviedb.org/${kind === 'movie' ? 'movie' : 'tv'}/${d.id}`,
  };
}

/** Look up an item by its parsed title/year; returns details or null. */
export async function match(item) {
  const t = item.title.normalize('NFC');
  const queries = [
    t,
    item.altTitle,                                   // show name from episode filenames
    t.split(/\s*[:–]\s*|\s+-\s+/)[0],                // "Cirque du Soleil: X" → "Cirque du Soleil"
    t.split(/\s*[:–]\s*|\s+-\s+/).slice(1).join(' '),// … or the subtitle alone
    t.replace(/,?\s+part\s+[ivx\d]+\b/i, ''),        // "…, Part I - D'Artagnan"
  ].filter((q, i, a) => q && q.length > 1 && a.indexOf(q) === i);

  for (const q of queries) {
    const hit = await search(item.kind, q, item.year);
    if (hit) return details(item.kind, hit.id);
  }
  return null;
}
