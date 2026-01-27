import { cp, lstat, mkdir, readdir, readlink, rm, symlink } from 'node:fs/promises';
import { platform } from 'node:os';
import { join, relative, resolve } from 'node:path';

const EXCLUDE_FILES = new Set(['README.md', 'metadata.json']);

const isExcluded = (name: string): boolean => {
  if (EXCLUDE_FILES.has(name)) return true;
  if (name.startsWith('_')) return true;
  return false;
};

export async function createSymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    try {
      const stats = await lstat(linkPath);
      if (stats.isSymbolicLink()) {
        const existingTarget = await readlink(linkPath);
        if (resolve(existingTarget) === resolve(target)) {
          return true;
        }
        await rm(linkPath);
      } else {
        await rm(linkPath, { recursive: true });
      }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ELOOP') {
        try {
          await rm(linkPath, { force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    const linkDir = join(linkPath, '..');
    await mkdir(linkDir, { recursive: true });

    const relativePath = relative(linkDir, target);
    const symlinkType = platform() === 'win32' ? 'junction' : undefined;

    await symlink(relativePath, linkPath, symlinkType);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectory(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });

  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    if (isExcluded(entry.name)) {
      continue;
    }

    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await cp(srcPath, destPath);
    }
  }
}

export async function copySkillDirectory(src: string, dest: string): Promise<void> {
  await copyDirectory(src, dest);
}
