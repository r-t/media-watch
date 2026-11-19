import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
export const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');

export async function loadLibrary() {
  try {
    const json = JSON.parse(await fs.readFile(LIBRARY_FILE, 'utf8'));
    return { scannedAt: json.scannedAt || null, items: json.items || [] };
  } catch {
    return { scannedAt: null, items: [] };
  }
}

export async function saveLibrary(lib) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = LIBRARY_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(lib, null, 2));
  await fs.rename(tmp, LIBRARY_FILE); // atomic replace
}
