import { mkdir, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { cloneRepoSparseTo, cloneRepoTo } from '../git.js';
import { isPathSafe } from '../installer/paths.js';
import { getDocPath, getDocsBase, sanitizeDocName } from './paths.js';
import type { DocInstallResult, DocSource } from './types.js';

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function normalizeDocsPath(value: string | undefined): string | null {
  if (!value) return null;
  let normalized = value.replace(/\\/g, '/').trim();
  normalized = normalized.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized) return null;
  if (normalized.includes('..')) return null;
  return normalized;
}

export async function installDocs(
  sources: DocSource[],
  cwd: string = process.cwd()
): Promise<DocInstallResult[]> {
  const results: DocInstallResult[] = [];
  const docsBase = getDocsBase(cwd);
  await mkdir(docsBase, { recursive: true });

  for (const source of sources) {
    const slug = sanitizeDocName(source.name || basename(source.url));
    const targetPath = getDocPath(slug, cwd);

    if (!isPathSafe(docsBase, targetPath)) {
      results.push({
        source,
        slug,
        path: targetPath,
        status: 'failed',
        message: 'Invalid doc path',
      });
      continue;
    }

    if (source.type !== 'github') {
      results.push({
        source,
        slug,
        path: targetPath,
        status: 'skipped',
        message: 'Unsupported source type',
      });
      continue;
    }

    if (await pathExists(targetPath)) {
      results.push({
        source,
        slug,
        path: targetPath,
        status: 'skipped',
        message: 'Already installed',
      });
      continue;
    }

    try {
      const docsPath = normalizeDocsPath(source.docs);
      if (docsPath) {
        await cloneRepoSparseTo(source.url, targetPath, docsPath, source.ref);
      } else {
        await cloneRepoTo(source.url, targetPath, source.ref);
      }
      results.push({
        source,
        slug,
        path: targetPath,
        status: 'installed',
      });
    } catch (error) {
      results.push({
        source,
        slug,
        path: targetPath,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Clone failed',
      });
    }
  }

  return results;
}
