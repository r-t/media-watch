# Media Watch

Fast local browser for the NAS library at `/Volumes/Media/Video` (`Movies/`, `Series/`, `Anime/Movies/`, `Anime/Series/`), with metadata from TMDB cached in `data/library.json`.

## Setup
```sh
npm install
cp .env.example .env      # add TMDB_API_KEY (v3 key or v4 read token)
npm run scan              # index the NAS + fetch metadata (~2–3 min first time)
npm start                 # http://localhost:3000
```

## Commands
| Command | What it does |
|---|---|
| `npm start` | Serve the site (works from cache even when the NAS is unmounted) |
| `npm run dev` | Same, restarting on code changes |
| `npm run scan` | Rescan disk; fetch metadata only for new/unmatched titles |
| `npm run scan -- --refresh` | Re-match every title (manual fixes are kept) |
| `npm test` | Filename parser self-test |

The **Rescan** button in the UI does the same as `npm run scan`.

## Naming conventions it understands
- Movies: `Title (Year).mkv`, `Title (Year) Edition.mkv`, `Title Year.mkv`, `Title [Year].mkv`, `Dotted.Title.Year/`
- Series: a folder per show; episodes `Show - 1x01 - Name`, `Show S01E01`, or `Show - 01 - Name`
- Copies of the same title/year (e.g. *Final Cut* + *Theatrical*) merge into one entry with edition chips.

## Fixing a wrong match
Open the title → **Wrong match?** → paste the TMDB URL or id. Manual matches are marked `manual` and never overwritten by rescans.
