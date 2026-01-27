import { dirname, join, relative } from 'node:path';
import type { MarketplaceSkill, MarketplaceSkillOrigin } from '../commands/types.js';
import { cleanupTempDir, cloneRepo } from '../git.js';
import {
  type MarketplacePlugin,
  type ResolvedPluginSource,
  resolvePluginSource,
} from '../marketplace.js';
import type { MarketplaceContext } from '../marketplace.js';
import { discoverSkills, getSkillDisplayName } from '../skills.js';

function normalizeCandidatePath(basePath: string, candidate: string): string {
  if (!candidate) return basePath;
  const cleaned = candidate.replace(/\\/g, '/');
  if (cleaned.endsWith('.md')) {
    return join(basePath, dirname(cleaned));
  }
  return join(basePath, cleaned);
}

function collectOverridePaths(overrides?: ResolvedPluginSource['overrides']): string[] {
  const paths: string[] = ['skills', 'commands', 'agents', 'hooks'];
  const add = (value: unknown) => {
    if (!value) return;
    if (typeof value === 'string') {
      paths.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') {
          paths.push(entry);
        }
      }
    }
  };

  add(overrides?.agents);
  add(overrides?.commands);
  add(overrides?.skills);
  add(overrides?.hooks);
  add(overrides?.mcpServers);

  return paths;
}

export async function collectMarketplaceSkills(
  plugins: MarketplacePlugin[],
  context: MarketplaceContext
): Promise<{ skills: MarketplaceSkill[]; warnings: string[] }> {
  const warnings: string[] = [];
  const collected: MarketplaceSkill[] = [];
  const repoCache = new Map<string, { tempDir: string; cleanup: () => Promise<void> }>();

  const ensureRepoClone = async (key: string, url: string, ref?: string) => {
    const existing = repoCache.get(key);
    if (existing) return existing;
    const tempDir = await cloneRepo(url, ref);
    const cleanup = async () => {
      await cleanupTempDir(tempDir);
    };
    const entry = { tempDir, cleanup };
    repoCache.set(key, entry);
    return entry;
  };

  for (const plugin of plugins) {
    const resolved = resolvePluginSource(plugin, context);
    if (resolved.kind === 'unsupported') {
      warnings.push(`${plugin.name}: ${resolved.reason || 'Unsupported plugin source'}`);
      continue;
    }

    if (resolved.kind === 'local' && resolved.localDir) {
      const baseDir = normalizeCandidatePath(resolved.localDir, plugin.pluginRoot || '');
      const overridePaths = collectOverridePaths(resolved.overrides);
      const scanned = new Set<string>();

      for (const rel of overridePaths) {
        const candidate = normalizeCandidatePath(baseDir, rel);
        if (scanned.has(candidate)) continue;
        scanned.add(candidate);
        const skills = await discoverSkills(candidate);
        for (const skill of skills) {
          const relDir = relative(baseDir, skill.path).replace(/\\/g, '/');
          const skillPath = relDir ? `${relDir}/SKILL.md` : 'SKILL.md';
          collected.push({
            skill,
            pluginName: plugin.name,
            origin: {
              sourceType: 'local',
              sourceUrl: baseDir,
              source: baseDir,
              skillPath,
            },
          });
        }
      }
      continue;
    }

    if (resolved.kind === 'github' && resolved.github) {
      const { owner, repo, ref, path } = resolved.github;
      const key = `github:${owner}/${repo}@${ref}`;
      const repoUrl = `https://github.com/${owner}/${repo}.git`;
      const { tempDir } = await ensureRepoClone(key, repoUrl, ref);
      const repoRoot = join(tempDir, path || '');
      const baseDir = normalizeCandidatePath(repoRoot, plugin.pluginRoot || '');
      const overridePaths = collectOverridePaths(resolved.overrides);
      const scanned = new Set<string>();

      for (const rel of overridePaths) {
        const candidate = normalizeCandidatePath(baseDir, rel);
        if (scanned.has(candidate)) continue;
        scanned.add(candidate);
        const skills = await discoverSkills(candidate);
        for (const skill of skills) {
          const relDir = relative(repoRoot, skill.path).replace(/\\/g, '/');
          const skillPath = relDir ? `${relDir}/SKILL.md` : 'SKILL.md';
          collected.push({
            skill,
            pluginName: plugin.name,
            origin: {
              sourceType: 'github',
              sourceUrl: repoUrl,
              source: `${owner}/${repo}`,
              ref,
              skillPath,
            },
          });
        }
      }
      continue;
    }

    if (resolved.kind === 'gitlab' && resolved.gitlab) {
      const { namespacePath, repo, ref, path } = resolved.gitlab;
      const key = `gitlab:${namespacePath}/${repo}@${ref}`;
      const repoUrl = `https://gitlab.com/${namespacePath}/${repo}.git`;
      const { tempDir } = await ensureRepoClone(key, repoUrl, ref);
      const repoRoot = join(tempDir, path || '');
      const baseDir = normalizeCandidatePath(repoRoot, plugin.pluginRoot || '');
      const overridePaths = collectOverridePaths(resolved.overrides);
      const scanned = new Set<string>();

      for (const rel of overridePaths) {
        const candidate = normalizeCandidatePath(baseDir, rel);
        if (scanned.has(candidate)) continue;
        scanned.add(candidate);
        const skills = await discoverSkills(candidate);
        for (const skill of skills) {
          const relDir = relative(repoRoot, skill.path).replace(/\\/g, '/');
          const skillPath = relDir ? `${relDir}/SKILL.md` : 'SKILL.md';
          collected.push({
            skill,
            pluginName: plugin.name,
            origin: {
              sourceType: 'gitlab',
              sourceUrl: repoUrl,
              source: `${namespacePath}/${repo}`,
              ref,
              skillPath,
            },
          });
        }
      }
    }
  }

  for (const entry of repoCache.values()) {
    await entry.cleanup();
  }

  return { skills: collected, warnings };
}

export function buildOriginMap(skills: MarketplaceSkill[]): Map<string, MarketplaceSkillOrigin> {
  const originMap = new Map<string, MarketplaceSkillOrigin>();
  for (const entry of skills) {
    originMap.set(getSkillDisplayName(entry.skill), entry.origin);
  }
  return originMap;
}
