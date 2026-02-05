import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import simpleGit from 'simple-git';
import { isPathSafe } from '../installer/paths.js';
import { getDocsBase } from './paths.js';
import type { DocUpdateResult, DocUpdateSummary } from './types.js';

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function isGitRepo(path: string): Promise<boolean> {
  return await pathExists(join(path, '.git'));
}

async function getCurrentBranch(path: string): Promise<string | null> {
  try {
    const git = simpleGit({ baseDir: path });
    const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
    return branch.trim();
  } catch {
    return null;
  }
}

export async function updateDocs(cwd: string = process.cwd()): Promise<DocUpdateSummary> {
  const docsBase = getDocsBase(cwd);
  const updated: DocUpdateResult[] = [];
  const skipped: DocUpdateResult[] = [];
  const failed: DocUpdateResult[] = [];

  let entries: Array<{ name: string; path: string }> = [];

  try {
    const dirents = await readdir(docsBase, { withFileTypes: true });
    entries = dirents
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, path: join(docsBase, entry.name) }))
      .filter((entry) => isPathSafe(docsBase, entry.path));
  } catch {
    return { total: 0, updated, skipped, failed };
  }

  for (const entry of entries) {
    const { name, path } = entry;

    if (!(await isGitRepo(path))) {
      skipped.push({ name, path, status: 'skipped', message: 'Not a git repo' });
      continue;
    }

    const branch = await getCurrentBranch(path);
    if (!branch || branch === 'HEAD') {
      skipped.push({ name, path, status: 'skipped', message: 'Detached HEAD' });
      continue;
    }

    try {
      const git = simpleGit({ baseDir: path });
      await git.pull();
      updated.push({ name, path, status: 'updated' });
    } catch (error) {
      failed.push({
        name,
        path,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Git pull failed',
      });
    }
  }

  return { total: entries.length, updated, skipped, failed };
}
