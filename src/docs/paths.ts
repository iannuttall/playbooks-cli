import { join } from 'node:path';
import { isPathSafe, sanitizeSkillName } from '../installer/paths.js';

const AGENTS_DIR = '.agents';
const DOCS_SUBDIR = 'docs';

export function getDocsBase(cwd: string = process.cwd()): string {
  return join(cwd, AGENTS_DIR, DOCS_SUBDIR);
}

export function sanitizeDocName(name: string): string {
  const normalized = name.replace(/[\\/]+/g, '-');
  return sanitizeSkillName(normalized);
}

export function getDocPath(name: string, cwd: string = process.cwd()): string {
  const base = getDocsBase(cwd);
  const slug = sanitizeDocName(name);
  const path = join(base, slug);

  if (!isPathSafe(base, path)) {
    throw new Error('Invalid doc name: potential path traversal detected');
  }

  return path;
}
