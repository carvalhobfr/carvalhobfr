#!/usr/bin/env node
// Adds ?v=<content hash> to every assets/*.svg reference in README.md, so GitHub's image
// proxy and the raw CDN fetch a new URL whenever a widget changes. Idempotent.

import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function hashOf(content) {
  return createHash('sha1').update(content).digest('hex').slice(0, 8);
}

// hashes: { 'hero-dark.svg': 'a1b2c3d4', ... }. References to unknown files are left alone.
export function stamp(readme, hashes) {
  return readme.replace(/assets\/([A-Za-z0-9_-]+\.svg)(\?v=[0-9A-Za-z]+)?/g, (match, name) =>
    hashes[name] ? `assets/${name}?v=${hashes[name]}` : match,
  );
}

async function main() {
  const dir = path.join(ROOT, 'assets');
  const hashes = {};
  for (const name of await readdir(dir)) {
    if (name.endsWith('.svg')) hashes[name] = hashOf(await readFile(path.join(dir, name)));
  }
  const file = path.join(ROOT, 'README.md');
  const before = await readFile(file, 'utf8');
  const after = stamp(before, hashes);
  if (after === before) return console.log('README up to date');
  await writeFile(file, after);
  console.log('README stamped');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`error: ${err.message}`);
    process.exit(1);
  });
}
