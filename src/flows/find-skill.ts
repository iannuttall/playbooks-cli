import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MarketplaceSkillOrigin } from '../commands/types.js';
import { cleanupTempDir, cloneRepoTo } from '../git.js';
import { searchSkills } from '../playbooks-api.js';
import { discoverSkills, getSkillDisplayName } from '../skills.js';
import { registerTempDir } from '../temp-registry.js';
import type { FindSkillMode, FindSkillResult } from '../tui/types.js';
import type { Skill } from '../types.js';

export type SearchOutcome = {
  mode: FindSkillMode;
  results: FindSkillResult[];
  fallback: boolean;
};

export async function searchSkillDirectory(
  query: string,
  mode: FindSkillMode,
  limit = 10
): Promise<SearchOutcome> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { mode, results: [], fallback: false };
  }

  if (mode === 'semantic') {
    try {
      const results = await searchSkills(trimmed, 'semantic', limit);
      return { mode: 'semantic', results, fallback: false };
    } catch {
      const results = await searchSkills(trimmed, 'lexical', limit);
      return { mode: 'lexical', results, fallback: true };
    }
  }

  const results = await searchSkills(trimmed, 'lexical', limit);
  return { mode: 'lexical', results, fallback: false };
}

export type PreparedSearchSelection = {
  tempDir: string;
  skills: Skill[];
  originBySkillName: Map<string, MarketplaceSkillOrigin>;
};

const normalizeSkillPath = (value: string) => value.replace(/^\/+/, '').replace(/\\/g, '/');

const toSkillDir = (skillPath: string) => {
  const normalized = normalizeSkillPath(skillPath);
  const cleaned = normalized.replace(/\/?SKILL\.md$/i, '').replace(/\/+$/, '');
  return cleaned;
};

const ensureSkillMdPath = (skillPath: string) => {
  const normalized = normalizeSkillPath(skillPath);
  if (/\/?SKILL\.md$/i.test(normalized)) {
    return normalized;
  }
  if (!normalized) {
    return 'SKILL.md';
  }
  return `${normalized.replace(/\/+$/, '')}/SKILL.md`;
};

const sanitizeRepoDir = (owner: string, repo: string) =>
  `${owner}-${repo}`.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');

export async function prepareSkillsFromSearchResults(
  selected: FindSkillResult[]
): Promise<PreparedSearchSelection> {
  if (selected.length === 0) {
    throw new Error('Select at least one skill to install.');
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'playbooks-search-'));
  registerTempDir(tempDir);
  try {
    const repoMap = new Map<
      string,
      { owner: string; repo: string; repoUrl: string; entries: FindSkillResult[] }
    >();

    for (const result of selected) {
      if (!result.repoOwner || !result.repoName || !result.path) {
        throw new Error(`Missing repository data for ${result.name}.`);
      }
      const key = `${result.repoOwner.toLowerCase()}/${result.repoName.toLowerCase()}`;
      const existing = repoMap.get(key);
      if (existing) {
        existing.entries.push(result);
      } else {
        repoMap.set(key, {
          owner: result.repoOwner,
          repo: result.repoName,
          repoUrl: `https://github.com/${result.repoOwner}/${result.repoName}.git`,
          entries: [result],
        });
      }
    }

    const repoDirs = new Map<string, string>();
    const usedDirs = new Set<string>();

    for (const [key, repoInfo] of repoMap) {
      let dirName = sanitizeRepoDir(repoInfo.owner, repoInfo.repo);
      let suffix = 1;
      while (usedDirs.has(dirName)) {
        dirName = `${sanitizeRepoDir(repoInfo.owner, repoInfo.repo)}-${suffix}`;
        suffix += 1;
      }
      usedDirs.add(dirName);
      const repoDir = join(tempDir, dirName);
      await cloneRepoTo(repoInfo.repoUrl, repoDir);
      repoDirs.set(key, repoDir);
    }

    const skills: Skill[] = [];
    const originBySkillName = new Map<string, MarketplaceSkillOrigin>();

    for (const result of selected) {
      if (!result.repoOwner || !result.repoName || !result.path) {
        continue;
      }
      const repoKey = `${result.repoOwner.toLowerCase()}/${result.repoName.toLowerCase()}`;
      const repoDir = repoDirs.get(repoKey);
      if (!repoDir) {
        throw new Error(`Missing clone for ${result.repoOwner}/${result.repoName}.`);
      }

      const skillDir = toSkillDir(result.path);
      const subpath = skillDir ? skillDir : undefined;
      const discovered = await discoverSkills(repoDir, subpath);
      if (discovered.length === 0) {
        throw new Error(`Skill not found in ${result.repoOwner}/${result.repoName}.`);
      }

      const expectedPath = join(repoDir, skillDir);
      const fallbackSkill = discovered[0];
      if (!fallbackSkill) {
        throw new Error(`Skill not found in ${result.repoOwner}/${result.repoName}.`);
      }
      const skill = discovered.find((entry) => entry.path === expectedPath) ?? fallbackSkill;
      if (!existsSync(join(skill.path, 'SKILL.md'))) {
        throw new Error(`SKILL.md missing for ${result.name}.`);
      }

      skills.push(skill);

      const displayName = getSkillDisplayName(skill);
      originBySkillName.set(displayName, {
        sourceType: 'github',
        source: `${result.repoOwner}/${result.repoName}`,
        sourceUrl: `https://github.com/${result.repoOwner}/${result.repoName}.git`,
        skillPath: ensureSkillMdPath(result.path),
      });
    }

    return { tempDir, skills, originBySkillName };
  } catch (error) {
    try {
      await cleanupTempDir(tempDir);
    } catch {
      // best-effort cleanup
    }
    throw error;
  }
}
