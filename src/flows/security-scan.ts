import { scanSkillDir } from '../scanner/scan-skill-dir.js';
import type { SkillStaticSignal } from '../scanner/static-scan.js';
import { getSkillDisplayName } from '../skills.js';
import type { Skill } from '../types.js';
import type { SkillSecuritySummary } from './plan-summary.js';

export type SecurityScanRow = {
  name: string;
  path: string;
  verdict: 'allow' | 'warn' | 'block';
  level: 'none' | 'low' | 'medium' | 'high' | 'critical';
  score: number;
  ruleset: string;
  signals: SkillStaticSignal[];
  truncated: boolean;
  error?: string;
};

export async function scanSkillsForSecurity(
  skills: Skill[],
  options: {
    maxFiles?: number;
    maxFileBytes?: number;
    maxTotalBytes?: number;
    maxSignals?: number;
  } = {}
): Promise<{
  rows: SecurityScanRow[];
  securityBySkillName: Map<string, SkillSecuritySummary>;
  isHighRisk: boolean;
}> {
  const rows: SecurityScanRow[] = [];
  const securityBySkillName = new Map<string, SkillSecuritySummary>();

  await Promise.all(
    skills.map(async (skill) => {
      const displayName = getSkillDisplayName(skill);
      try {
        const res = await scanSkillDir(skill.path, options);
        securityBySkillName.set(displayName, {
          level: res.staticScan.overall.level,
          score: res.staticScan.overall.score,
          verdict: res.staticScan.overall.verdict,
          issues: res.staticScan.signals.length,
          topSignals: Array.from(new Set(res.staticScan.signals.map((s) => s.id))).slice(0, 8),
          truncated: res.staticScan.stats.truncated,
        });
        rows.push({
          name: displayName,
          path: skill.path,
          verdict: res.staticScan.overall.verdict,
          level: res.staticScan.overall.level,
          score: res.staticScan.overall.score,
          ruleset: res.staticScan.rulesetVersion,
          signals: res.staticScan.signals,
          truncated: res.staticScan.stats.truncated,
        });
      } catch (err) {
        securityBySkillName.set(displayName, {
          level: 'none',
          score: 0,
          verdict: 'warn',
          issues: 0,
          error: err instanceof Error ? err.message : 'Scan failed',
        });
        rows.push({
          name: displayName,
          path: skill.path,
          verdict: 'warn',
          level: 'none',
          score: 0,
          ruleset: 'unknown',
          signals: [],
          truncated: false,
          error: err instanceof Error ? err.message : 'Scan failed',
        });
      }
    })
  );

  rows.sort((a, b) => {
    const aScore = a.error ? -1 : a.score;
    const bScore = b.error ? -1 : b.score;
    if (bScore !== aScore) return bScore - aScore;
    return a.name.localeCompare(b.name);
  });

  const isHighRisk = Array.from(securityBySkillName.values()).some(
    (s) => s.verdict === 'block' || s.level === 'high' || s.level === 'critical'
  );

  return { rows, securityBySkillName, isHighRisk };
}
