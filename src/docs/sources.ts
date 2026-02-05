import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import type { DocMode, DocSource, DocSourceType } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_CANDIDATES = [
  resolve(__dirname, '..', '..', 'data', 'docs-sources.yml'),
  resolve(__dirname, '..', 'data', 'docs-sources.yml'),
];

const DOC_SOURCES = parseSources();

export function getDocSources(): DocSource[] {
  return DOC_SOURCES.slice();
}

function parseSources(): DocSource[] {
  const sourcePath = SOURCE_CANDIDATES.find((path) => existsSync(path));
  if (!sourcePath) return [];

  let raw = '';
  try {
    raw = readFileSync(sourcePath, 'utf-8');
  } catch {
    return [];
  }

  const parsed = matter(`---\n${raw}\n---`).data;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => normalizeSource(item))
    .filter((item): item is DocSource => Boolean(item))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeSource(raw: unknown): DocSource | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const type = normalizeType(record.type);
  const url = typeof record.url === 'string' ? record.url.trim() : '';

  if (!name || !type || !url) {
    return null;
  }

  const docs = typeof record.docs === 'string' ? record.docs : undefined;
  const ref = typeof record.ref === 'string' ? record.ref : undefined;
  const version = typeof record.version === 'string' ? record.version : undefined;
  const mode = normalizeMode(record.mode);
  const allow = normalizeStringArray(record.allow);
  const deny = normalizeStringArray(record.deny);
  const depth = typeof record.depth === 'number' ? record.depth : undefined;
  const pages = typeof record.pages === 'number' ? record.pages : undefined;

  return {
    name,
    type,
    url,
    docs,
    ref,
    version,
    mode,
    allow,
    deny,
    depth,
    pages,
  };
}

function normalizeType(value: unknown): DocSourceType | null {
  if (value === 'github' || value === 'web') return value;
  return null;
}

function normalizeMode(value: unknown): DocMode | undefined {
  if (value === 'docs' || value === 'repo') return value;
  return undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const filtered = value.filter((entry): entry is string => typeof entry === 'string');
  return filtered.length > 0 ? filtered : undefined;
}
