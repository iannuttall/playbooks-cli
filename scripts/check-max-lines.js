#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const MAX_LINES = 400;
const ROOTS = ['src', 'scripts', 'tests'];
const VALID_EXTS = new Set(['.ts', '.js', '.tsx', '.mjs', '.cjs']);

function walk(dir, files = []) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      walk(fullPath, files);
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (VALID_EXTS.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function countLines(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  return content.split(/\r\n|\r|\n/).length;
}

const oversized = [];

for (const root of ROOTS) {
  const stat = statSync(root, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory()) continue;
  const files = walk(root);
  for (const file of files) {
    const lines = countLines(file);
    if (lines > MAX_LINES) {
      oversized.push({ file, lines });
    }
  }
}

if (oversized.length > 0) {
  console.error(`Found files over ${MAX_LINES} lines:`);
  for (const entry of oversized) {
    console.error(`- ${entry.file} (${entry.lines})`);
  }
  process.exit(1);
}
