import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
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

const toSlug = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

const trySwapSkillDir = (skillDir: string) => {
  if (skillDir.startsWith('skill/')) {
    return `skills/${skillDir.slice('skill/'.length)}`;
  }
  if (skillDir.startsWith('skills/')) {
    return `skill/${skillDir.slice('skills/'.length)}`;
  }
  return null;
};

const buildCandidateSubpaths = (result: FindSkillResult): string[] => {
  const candidates: string[] = [];
  const add = (value: string | null | undefined) => {
    if (!value) return;
    const normalized = normalizeSkillPath(value).replace(/\/+$/, '');
    if (!normalized || candidates.includes(normalized)) return;
    candidates.push(normalized);
  };

  if (result.path) {
    const skillDir = toSkillDir(result.path);
    add(skillDir);
    const swapped = trySwapSkillDir(skillDir);
    if (swapped) add(swapped);
  }

  const slug = toSlug(result.skillSlug || result.name);
  if (slug) {
    add(`skills/${slug}`);
    add(`skill/${slug}`);
    add(slug);
  }

  return candidates;
};

const toSkillMdPathFromDir = (repoDir: string, skillDir: string) => {
  const relDir = normalizeSkillPath(relative(repoDir, skillDir));
  const cleaned = relDir === '.' ? '' : relDir;
  return ensureSkillMdPath(cleaned);
};

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

      const candidates = buildCandidateSubpaths(result);
      const slug = toSlug(result.skillSlug || result.name);

      let skill: Skill | null = null;
      let discovered: Skill[] = [];

      for (const candidate of candidates) {
        const candidateDiscovered = await discoverSkills(repoDir, candidate);
        if (candidateDiscovered.length === 0) {
          continue;
        }

        const expectedPath = join(repoDir, candidate);
        const exact = candidateDiscovered.find((entry) => entry.path === expectedPath);
        const nameMatch = candidateDiscovered.find((entry) => toSlug(entry.name) === slug);
        const dirMatch = candidateDiscovered.find((entry) => toSlug(basename(entry.path)) === slug);
        skill = exact ?? nameMatch ?? dirMatch ?? candidateDiscovered[0] ?? null;
        discovered = candidateDiscovered;
        break;
      }

      if (!skill) {
        const fallbackDiscovered = await discoverSkills(repoDir);
        const nameMatch = fallbackDiscovered.find((entry) => toSlug(entry.name) === slug);
        const dirMatch = fallbackDiscovered.find((entry) => toSlug(basename(entry.path)) === slug);
        skill = nameMatch ?? dirMatch ?? fallbackDiscovered[0] ?? null;
        discovered = fallbackDiscovered;
      }

      if (!skill || discovered.length === 0) {
        throw new Error(`Skill not found in ${result.repoOwner}/${result.repoName}.`);
      }

      if (!existsSync(join(skill.path, 'SKILL.md'))) {
        throw new Error(`SKILL.md missing for ${result.name}.`);
      }

      skills.push(skill);

      const displayName = getSkillDisplayName(skill);
      const skillPath =
        skill.path === repoDir ? 'SKILL.md' : toSkillMdPathFromDir(repoDir, skill.path);
      originBySkillName.set(displayName, {
        sourceType: 'github',
        source: `${result.repoOwner}/${result.repoName}`,
        sourceUrl: `https://github.com/${result.repoOwner}/${result.repoName}.git`,
        skillPath,
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
