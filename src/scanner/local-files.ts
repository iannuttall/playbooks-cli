import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { isPathSafe } from '../installer/paths.js';
import type { SkillStaticScanFile, SkillStaticScanOptions } from './static-scan.js';
import { isProbablyTextPath } from './static-scan/shared.js';

type CollectResult = {
  files: SkillStaticScanFile[];
  truncated: boolean;
  skipped: number;
};

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

async function safeRealpath(value: string): Promise<string> {
  try {
    return await realpath(value);
  } catch {
    return value;
  }
}

/**
 * Collects skill files from disk in a bounded way.
 *
 * Notes:
 * - Avoid following symlinks that escape the skill dir.
 * - Only reads "probably text" files; binary files are irrelevant to the static scanner.
 * - Enforces the same maxFiles/maxFileBytes/maxTotalBytes caps the scan uses.
 */
export async function collectSkillScanFiles(
  skillDir: string,
  options: SkillStaticScanOptions = {}
): Promise<CollectResult> {
  const maxFiles = options.maxFiles ?? 120;
  const maxTotalBytes = options.maxTotalBytes ?? 1_200_000;
  const maxFileBytes = options.maxFileBytes ?? 160_000;

  const baseReal = await safeRealpath(skillDir);
  const baseRealWithSep = baseReal.endsWith(sep) ? baseReal : `${baseReal}${sep}`;

  const files: SkillStaticScanFile[] = [];
  const visitedDirs = new Set<string>([baseReal]);
  const seen = new Set<string>();
  let truncated = false;
  let bytes = 0;
  let skipped = 0;

  // Always try to include SKILL.md first so it isn't missed when caps are tight.
  const skillMdFull = join(skillDir, 'SKILL.md');
  const skillMdRel = 'SKILL.md';
  try {
    if (
      files.length < maxFiles &&
      isPathSafe(skillDir, skillMdFull) &&
      isProbablyTextPath(skillMdRel)
    ) {
      const s = await stat(skillMdFull);
      const size = typeof s.size === 'number' ? s.size : 0;
      if (size > 0 && size <= maxFileBytes && bytes + size <= maxTotalBytes) {
        const content = await readFile(skillMdFull, 'utf-8');
        const usedSize = size > 0 ? size : content.length;
        if (usedSize > 0 && usedSize <= maxFileBytes && bytes + usedSize <= maxTotalBytes) {
          bytes += usedSize;
          files.push({ path: skillMdRel, content, size: usedSize });
          seen.add(skillMdRel.toLowerCase());
        }
      }
    }
  } catch {
    // ignore missing/invalid SKILL.md
  }

  const queue: string[] = [skillDir];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    let entries: Array<import('node:fs').Dirent>;
    try {
      entries = await readdir(current, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        truncated = true;
        break;
      }

      const fullPath = join(current, entry.name);
      if (!isPathSafe(skillDir, fullPath)) {
        skipped += 1;
        continue;
      }

      // Avoid scanning hidden node_modules etc inside skills.
      if (entry.name === 'node_modules' || entry.name === '.git') {
        skipped += 1;
        continue;
      }

      if (entry.isDirectory()) {
        const real = await safeRealpath(fullPath);
        if (!real.startsWith(baseRealWithSep) && real !== baseReal) {
          skipped += 1;
          continue;
        }
        if (visitedDirs.has(real)) {
          skipped += 1;
          continue;
        }
        visitedDirs.add(real);
        queue.push(fullPath);
        continue;
      }

      // If it's a symlink, resolve and only include if it stays within the skill dir.
      if (entry.isSymbolicLink()) {
        const real = await safeRealpath(fullPath);
        if (!real.startsWith(baseRealWithSep) && real !== baseReal) {
          skipped += 1;
          continue;
        }
        try {
          const s = await stat(fullPath);
          if (s.isDirectory()) {
            if (visitedDirs.has(real)) {
              skipped += 1;
              continue;
            }
            visitedDirs.add(real);
            queue.push(fullPath);
            continue;
          }
        } catch {
          skipped += 1;
          continue;
        }
        // fall through to file reading
      }

      if (!entry.isFile() && !entry.isSymbolicLink()) {
        skipped += 1;
        continue;
      }

      const relPath = toPosixPath(relative(skillDir, fullPath));
      if (!relPath || relPath.startsWith('..')) {
        skipped += 1;
        continue;
      }

      if (seen.has(relPath.toLowerCase())) {
        skipped += 1;
        continue;
      }

      if (!isProbablyTextPath(relPath)) {
        skipped += 1;
        continue;
      }

      let size: number | null = null;
      try {
        // Use stat() so symlinks are bounded by target file size.
        const s = await stat(fullPath);
        size = typeof s.size === 'number' ? s.size : null;
      } catch {
        size = null;
      }

      const effectiveSize = size ?? 0;
      if (effectiveSize > maxFileBytes) {
        skipped += 1;
        continue;
      }
      if (bytes + effectiveSize > maxTotalBytes) {
        truncated = true;
        break;
      }

      try {
        const content = await readFile(fullPath, 'utf-8');
        // If stat size was missing/0, we still want to bound by actual string size.
        const computed = content.length;
        const usedSize = size && size > 0 ? size : computed;
        if (usedSize > maxFileBytes) {
          skipped += 1;
          continue;
        }
        if (bytes + usedSize > maxTotalBytes) {
          truncated = true;
          break;
        }
        bytes += usedSize;
        files.push({ path: relPath, content, size: usedSize });
        seen.add(relPath.toLowerCase());
      } catch {
        skipped += 1;
      }
    }

    if (truncated) break;
  }

  return { files, truncated, skipped };
}
