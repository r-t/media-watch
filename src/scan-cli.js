// npm run scan [-- --refresh]
import { rescan } from './library.js';
import { slowFiles } from './scanner.js';

const refresh = process.argv.includes('--refresh');
const t0 = Date.now();

try {
  const { lib, stats } = await rescan({
    refresh,
    onProgress: (done, total, item) => {
      process.stdout.write(`\r  TMDB ${done}/${total}  ${item.matchStatus === 'matched' ? '✓' : '✗'} ${item.title}`.padEnd(100).slice(0, 100));
    },
  });
  process.stdout.write('\n');

  const by = {};
  for (const i of lib.items) by[`${i.category}/${i.kind}`] = (by[`${i.category}/${i.kind}`] || 0) + 1;
  console.log('Counts:', by);
  console.log('Stats:', stats);
  if (slowFiles.length) console.log('\nFiles that timed out on stat (listed without size):', slowFiles);

  const unmatched = lib.items.filter((i) => !i.tmdb);
  if (unmatched.length) {
    console.log(`\nUnmatched (${unmatched.length}):`);
    for (const i of unmatched) console.log(`  - [${i.category}] ${i.title}${i.year ? ` (${i.year})` : ''}${i.matchError ? '  — ' + i.matchError : ''}`);
  }
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
