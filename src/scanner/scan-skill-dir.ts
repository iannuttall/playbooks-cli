import { collectSkillScanFiles } from './local-files.js';
import type { SkillStaticScanOptions, SkillStaticScanResult } from './static-scan.js';
import { scanSkillSafety } from './static-scan.js';

export type SkillDirScanResult = {
  dir: string;
  staticScan: SkillStaticScanResult;
  collected: {
    provided: number;
    skipped: number;
    truncated: boolean;
  };
};

export async function scanSkillDir(
  dir: string,
  options: SkillStaticScanOptions = {}
): Promise<SkillDirScanResult> {
  const collected = await collectSkillScanFiles(dir, options);
  const staticScan = scanSkillSafety(collected.files, options);
  return {
    dir,
    staticScan,
    collected: {
      provided: collected.files.length,
      skipped: collected.skipped,
      truncated: collected.truncated || staticScan.stats.truncated,
    },
  };
}
