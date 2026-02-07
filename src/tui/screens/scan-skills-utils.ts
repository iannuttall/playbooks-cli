import { join } from 'node:path';
import { agents } from '../../agents.js';
import type { CollectedSkillDir } from '../../flows/scan-installed-skills.js';
import { getCanonicalSkillsBase } from '../../installer.js';
import { isPathSafe } from '../../installer/paths.js';
import type { AgentType } from '../../types.js';

export type SkillStaticLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type Row = {
  skill: CollectedSkillDir;
  level?: SkillStaticLevel;
  score?: number;
  verdict?: string;
  issues?: number;
  ruleset?: string;
  topSignals?: string[];
  error?: string;
};

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function scanSummary(rows: Row[]): {
  total: number;
  high: number;
  medium: number;
  low: number;
  failed: number;
} {
  let high = 0;
  let medium = 0;
  let low = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.error) {
      failed += 1;
      continue;
    }
    const level = row.level ?? 'none';
    if (level === 'critical' || level === 'high') high += 1;
    else if (level === 'medium') medium += 1;
    else if (level === 'low') low += 1;
  }
  return { total: rows.length, high, medium, low, failed };
}

export async function asyncPool<T, R>(
  limit: number,
  items: T[],
  fn: (item: T) => Promise<R>,
  onProgress?: (completed: number, total: number) => void
): Promise<R[]> {
  const total = items.length;
  let completed = 0;
  const results: R[] = [];
  let index = 0;

  const worker = async () => {
    while (index < items.length) {
      const i = index;
      index += 1;
      const value = await fn(items[i] as T);
      results[i] = value;
      completed += 1;
      onProgress?.(completed, total);
    }
  };

  const workers = Array.from({ length: Math.max(1, limit) }).map(worker);
  await Promise.all(workers);
  return results;
}

export function isRisky(row: Row): boolean {
  if (row.error) return true;
  const level = row.level ?? 'none';
  return level !== 'none';
}

export function formatRowLabel(row: Row): string {
  const name = row.skill.name;
  const slug = row.skill.slug;
  if (row.error) {
    return `${name} (${slug}) failed`;
  }
  const level = row.level ?? 'none';
  const score = row.score ?? 0;
  const issues = row.issues ?? 0;
  return `${name} (${slug}) ${level} score=${score} issues=${issues}`;
}

export function buildRowInfo(row: Row): string | undefined {
  const parts: string[] = [];
  if (row.error) {
    parts.push(`Scan failed: ${row.error}`);
  } else {
    parts.push(
      `Level: ${row.level ?? 'none'} • Score: ${row.score ?? 0} • Issues: ${row.issues ?? 0}`
    );
    if (row.topSignals && row.topSignals.length > 0) {
      parts.push(`Top: ${row.topSignals.slice(0, 4).join(', ')}`);
    }
    if (row.ruleset) {
      parts.push(`Rules: ${row.ruleset}`);
    }
  }
  const locations = row.skill.locations.map((l) => l.label).slice(0, 6);
  if (locations.length > 0) {
    parts.push(`Locations: ${locations.join(', ')}`);
  }
  return parts.join(' • ');
}

function parseAgentLocation(
  label: string
): { agent: AgentType; scope: 'project' | 'global' } | null {
  const parts = label.split(':');
  if (parts.length !== 2) return null;
  const agent = parts[0] as AgentType;
  const scope = parts[1] as 'project' | 'global';
  if (scope !== 'project' && scope !== 'global') return null;
  if (!(agent in agents)) return null;
  return { agent, scope };
}

export function removalTargetsForRow(
  row: Row,
  cwd: string
): Array<{ path: string; label: string }> {
  const targets: Array<{ path: string; label: string }> = [];
  const seen = new Set<string>();

  for (const loc of row.skill.locations) {
    if (loc.kind === 'canonical') {
      const scope = loc.label === 'global' ? 'global' : 'project';
      const base = getCanonicalSkillsBase({ global: scope === 'global', cwd });
      const path = join(base, row.skill.slug);
      if (!isPathSafe(base, path)) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      targets.push({ path, label: `canonical:${scope}` });
      continue;
    }

    const parsed = parseAgentLocation(loc.label);
    if (!parsed) continue;
    const agentCfg = agents[parsed.agent];
    const base =
      parsed.scope === 'global' ? agentCfg.globalSkillsDir : join(cwd, agentCfg.skillsDir);
    if (!base) continue;
    const path = join(base, row.skill.slug);
    if (!isPathSafe(base, path)) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    targets.push({ path, label: `${parsed.agent}:${parsed.scope}` });
  }

  return targets;
}
