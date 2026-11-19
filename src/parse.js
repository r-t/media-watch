// Parse a media file/folder name into { title, year, edition }.

export const VIDEO_EXTS = new Set(['mkv', 'mp4', 'avi', 'm4v', 'm2ts', 'mov', 'wmv', 'ts', 'mpg', 'mpeg', 'webm', 'iso']);

export function extOf(name) {
  const m = /\.([a-z0-9]{2,4})$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function isVideo(name) {
  return VIDEO_EXTS.has(extOf(name));
}

export function stripExt(name) {
  return isVideo(name) ? name.replace(/\.[a-z0-9]{2,4}$/i, '') : name;
}

const clean = (s) => s.replace(/\s+/g, ' ').replace(/^[\s\-–_:,]+|[\s\-–_:,]+$/g, '').trim();

// Release/rip tags that are never part of a title
const TAG_RE = /\s*[([](?:eng\s*dub|dub(?:bed)?|sub(?:bed)?|eng\s*sub|dual\s*audio|uncut|remastered|1080p|720p|2160p|4k|hdr|x26[45]|hevc|bluray|web-?dl)[)\]]/gi;

export function parseName(raw) {
  // macOS/SMB hands back decomposed (NFD) accents; TMDB search needs composed (NFC)
  let name = stripExt(raw.normalize('NFC')).replace(TAG_RE, '');
  // Dotted / underscored names (La.Strada.1954) → spaces
  if (!name.includes(' ')) name = name.replace(/[._]+/g, ' ');
  // [2025] → (2025)
  name = name.replace(/\[(19\d{2}|20\d{2})\]/, '($1)');

  let title = name, year = null, rest = '';
  let m;

  if ((m = /^(.*?)\s*\((19\d{2}|20\d{2})\)(.*)$/.exec(name))) {
    // "Title (1999) Edition"
    [, title, year, rest] = m;
  } else if ((m = /^(.*?)\s*\(([^()]*?)\s*[-–]?\s*(19\d{2}|20\d{2})\)(.*)$/.exec(name))) {
    // "Title (Alt.Title - 2009)" → keep main title, drop alt
    [, title, , year, rest] = m;
  } else if ((m = /^(.+?)\s+(19\d{2}|20\d{2})(?:\s+(.*))?$/.exec(name))) {
    // "Hamnet 2025" / "La Strada 1954" — but not titles that ARE a number (e.g. "1917")
    [, title, year, rest = ''] = m;
  }

  title = clean(title);
  if (!title && year) { title = String(year); year = null; }
  let edition = clean(rest || '');
  if (/^\d{1,2}$/.test(edition)) edition = ''; // duplicate marker like "2"
  edition = edition.replace(/[_]+/g, ' ');

  return { title, year: year ? Number(year) : null, edition: edition || null };
}

/** Show name from an episode filename: "Show Name - 1x01 - Title", "Show - 01 - Title", "Show S01E01". */
export function showNameFromEpisode(file) {
  const n = stripExt(file.normalize('NFC'));
  const m = /^(.*?)\s*(?:-\s*)?(?:\d{1,2}x\d{1,3}|S\d{1,2}\s*E\d{1,3}|-\s*\d{1,3}\s*-)/i.exec(n);
  const show = m?.[1]?.replace(/`/g, "'").replace(/[\s\-–]+$/, '').trim();
  return show || null;
}

export function parseEpisode(name) {
  let m;
  if ((m = /S(\d{1,2})\s*E(\d{1,3})/i.exec(name))) return { season: +m[1], episode: +m[2] };
  if ((m = /\b(\d{1,2})x(\d{1,3})\b/i.exec(name))) return { season: +m[1], episode: +m[2] };
  return null;
}

export function slug(s) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Self-test: node src/parse.js --test
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()) && process.argv.includes('--test')) {
  const cases = [
    ['10 Things I Hate About You (1999).mkv', '10 Things I Hate About You', 1999, null],
    ['1917 (2019).mkv', '1917', 2019, null],
    ['2001 A Space Odyssey (1968).avi', '2001 A Space Odyssey', 1968, null],
    ['Hamnet 2025.mkv', 'Hamnet', 2025, null],
    ['La.Strada.1954', 'La Strada', 1954, null],
    ['Blade Runner (1982) Final Cut.mkv', 'Blade Runner', 1982, 'Final Cut'],
    ['Legend (1985) - Directors Cut.mp4', 'Legend', 1985, 'Directors Cut'],
    ['Enter the Dragon (1973) 2.mkv', 'Enter the Dragon', 1973, null],
    ['A Certain Scientific Railgun (Toaru.Kagaku.no.Railgun - 2009)', 'A Certain Scientific Railgun', 2009, null],
    ['Evangelion 1.0 You Are (Not) Alone (2007).mkv', 'Evangelion 1.0 You Are (Not) Alone', 2007, null],
    ['Firefly', 'Firefly', null, null],
    ['Runner 2026.mkv', 'Runner', 2026, null],
    ['Demon Slayer -Kimetsu no Yaiba- The Movie Mugen Train (2020).mkv', 'Demon Slayer -Kimetsu no Yaiba- The Movie Mugen Train', 2020, null],
    ['Weapons [2025].mkv', 'Weapons', 2025, null],
    ['Rakudai Kishi no Cavalry (EngDub)', 'Rakudai Kishi no Cavalry', null, null],
    ['Léon The Professional (1994).mkv', 'Léon The Professional', 1994, null],
  ];
  for (const f of ['Dance in the Vampire Bund - 1x01 - Prom Night.mkv', 'The Ancient Magus` Bride - 01 - April Showers.mkv', 'Show S02E05.mkv'])
    console.log('show:', f, '→', showNameFromEpisode(f));
  let fail = 0;
  for (const [input, t, y, e] of cases) {
    const r = parseName(input);
    const ok = r.title === t && r.year === y && r.edition === e;
    if (!ok) fail++;
    console.log(ok ? 'ok  ' : 'FAIL', input, '→', JSON.stringify(r));
  }
  console.log(parseEpisode('Firefly - 1x01 - The Train Job.mp4'), parseEpisode('Show S02E05.mkv'));
  process.exit(fail ? 1 : 0);
}
