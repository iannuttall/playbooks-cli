import { rmSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { normalize, resolve, sep } from 'node:path';

const tempDirs = new Set<string>();
let handlersInstalled = false;

export function isTempPathSafe(dir: string): boolean {
  const normalizedDir = normalize(resolve(dir));
  const normalizedTmpDir = normalize(resolve(tmpdir()));
  return normalizedDir.startsWith(normalizedTmpDir + sep) || normalizedDir === normalizedTmpDir;
}

export function registerTempDir(dir: string): void {
  tempDirs.add(dir);
}

export function unregisterTempDir(dir: string): void {
  tempDirs.delete(dir);
}

export async function cleanupAllTempDirs(): Promise<void> {
  const dirs = Array.from(tempDirs);
  for (const dir of dirs) {
    try {
      if (isTempPathSafe(dir)) {
        await rm(dir, { recursive: true, force: true });
      }
    } catch {
      // best-effort
    } finally {
      tempDirs.delete(dir);
    }
  }
}

export function cleanupAllTempDirsSync(): void {
  const dirs = Array.from(tempDirs);
  for (const dir of dirs) {
    try {
      if (isTempPathSafe(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    } catch {
      // best-effort
    } finally {
      tempDirs.delete(dir);
    }
  }
}

export function setupTempDirCleanup(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  process.on('exit', () => {
    cleanupAllTempDirsSync();
  });

  process.on('SIGINT', () => {
    cleanupAllTempDirsSync();
    process.exit(130);
  });

  process.on('SIGTERM', () => {
    cleanupAllTempDirsSync();
    process.exit(143);
  });
}
