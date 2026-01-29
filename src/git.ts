import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import simpleGit from 'simple-git';
import { isTempPathSafe, registerTempDir, unregisterTempDir } from './temp-registry.js';

export async function cloneRepo(url: string, ref?: string): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'add-skill-'));
  registerTempDir(tempDir);
  const git = simpleGit();
  const cloneOptions = ref ? ['--depth', '1', '--branch', ref] : ['--depth', '1'];
  await git.clone(url, tempDir, cloneOptions);
  return tempDir;
}

export async function cloneRepoTo(url: string, destination: string, ref?: string): Promise<void> {
  const git = simpleGit();
  const cloneOptions = ref ? ['--depth', '1', '--branch', ref] : ['--depth', '1'];
  await git.clone(url, destination, cloneOptions);
}

export async function cleanupTempDir(dir: string): Promise<void> {
  if (!isTempPathSafe(dir)) {
    throw new Error('Attempted to clean up directory outside of temp directory');
  }

  try {
    await rm(dir, { recursive: true, force: true });
  } finally {
    unregisterTempDir(dir);
  }
}
