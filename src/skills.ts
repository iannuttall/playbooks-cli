import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import matter from 'gray-matter';
import type { Skill } from './types.js';

const SKIP_DIRS = ['node_modules', '.git', '.github', 'dist', 'build', '__pycache__'];

const DENIED_SEGMENTS = new Set([
  '.git',
  'node_modules',
  '.github',
  'playbooks',
  'context',
  'prompts',
  'backups',
  'backup',
  'dist',
  'deprecated',
]);

const normalizePath = (value: string) => value.replace(/^\/+/, '');

const normalizeRoot = (value: string) =>
  normalizePath(value).replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');

const isDeniedPath = (path: string): boolean => {
  const cleaned = normalizePath(path);
  const segments = cleaned.split('/').map((segment) => segment.toLowerCase());
  for (const segment of segments) {
    if (!segment) continue;
    if (segment === '.claude-plugin') {
      continue;
    }
    if (DENIED_SEGMENTS.has(segment)) {
      return true;
    }
  }
  return false;
};

async function hasSkillMd(dir: string): Promise<boolean> {
  try {
    if (isDeniedPath(dir)) return false;
    const skillPath = join(dir, 'SKILL.md');
    const stats = await stat(skillPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function parseSkillMd(skillMdPath: string): Promise<Skill | null> {
  try {
    if (isDeniedPath(skillMdPath)) return null;
    const content = await readFile(skillMdPath, 'utf-8');
    const { data } = matter(content);

    if (!data.name || !data.description) {
      return null;
    }

    return {
      name: data.name,
      description: data.description,
      path: dirname(skillMdPath),
      rawContent: content,
      metadata: data.metadata,
    };
  } catch {
    return null;
  }
}

async function findSkillDirs(dir: string, depth = 0, maxDepth = 5): Promise<string[]> {
  const skillDirs: string[] = [];

  if (depth > maxDepth) return skillDirs;
  if (isDeniedPath(dir)) return skillDirs;

  try {
    if (await hasSkillMd(dir)) {
      skillDirs.push(dir);
    }

    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP_DIRS.includes(entry.name)) {
        const subDirs = await findSkillDirs(join(dir, entry.name), depth + 1, maxDepth);
        skillDirs.push(...subDirs);
      }
    }
  } catch {
    // Ignore errors
  }

  return skillDirs;
}

type MarketplaceJson = {
  plugins?: Array<{ source?: unknown }> | null;
};

async function readMarketplacePluginRoots(basePath: string): Promise<string[]> {
  const filePath = join(basePath, '.claude-plugin', 'marketplace.json');
  if (!existsSync(filePath)) return [];
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as MarketplaceJson;
    const roots = (parsed.plugins ?? [])
      .map((plugin) => (typeof plugin.source === 'string' ? plugin.source : null))
      .filter(Boolean) as string[];
    return roots.map((root) => normalizeRoot(root)).filter(Boolean);
  } catch {
    return [];
  }
}

async function collectSkillsFromRoot(root: string, seenSlugs: Set<string>, skills: Skill[]) {
  if (!root || !existsSync(root) || isDeniedPath(root)) return;
  const skillDirs = await findSkillDirs(root);
  for (const skillDir of skillDirs) {
    const skill = await parseSkillMd(join(skillDir, 'SKILL.md'));
    if (!skill) continue;
    const slug = basename(skill.path).toLowerCase();
    if (seenSlugs.has(slug)) continue;
    skills.push(skill);
    seenSlugs.add(slug);
  }
}

async function listPluginSkillRoots(basePath: string): Promise<string[]> {
  const pluginsDir = join(basePath, 'plugins');
  if (!existsSync(pluginsDir)) return [];
  try {
    const entries = await readdir(pluginsDir, { withFileTypes: true });
    const roots: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = join(pluginsDir, entry.name, 'skills');
      if (existsSync(candidate)) {
        roots.push(candidate);
      }
    }
    return roots;
  } catch {
    return [];
  }
}

export async function discoverSkills(basePath: string, subpath?: string): Promise<Skill[]> {
  const skills: Skill[] = [];
  const seenSlugs = new Set<string>();
  const searchPath = subpath ? join(basePath, subpath) : basePath;

  // If pointing directly at a skill, return just that
  if (await hasSkillMd(searchPath)) {
    const skill = await parseSkillMd(join(searchPath, 'SKILL.md'));
    if (skill) {
      skills.push(skill);
      return skills;
    }
  }

  // Priority 1: marketplace plugin roots
  const marketplaceRoots = await readMarketplacePluginRoots(searchPath);
  for (const root of marketplaceRoots) {
    const skillsRoot = root.toLowerCase().endsWith('/skills') ? root : `${root}/skills`;
    await collectSkillsFromRoot(join(searchPath, skillsRoot), seenSlugs, skills);
  }

  // Priority 2: repo /skills
  await collectSkillsFromRoot(join(searchPath, 'skills'), seenSlugs, skills);

  // Priority 3: plugins/*/skills
  const pluginRoots = await listPluginSkillRoots(searchPath);
  for (const root of pluginRoots) {
    await collectSkillsFromRoot(root, seenSlugs, skills);
  }

  // Priority 4: .claude-plugin
  await collectSkillsFromRoot(join(searchPath, '.claude-plugin'), seenSlugs, skills);

  // Priority 5: known agent directories
  const agentRoots = [
    join(searchPath, '.agent/skills'),
    join(searchPath, '.agents/skills'),
    join(searchPath, '.cline/skills'),
    join(searchPath, '.commandcode/skills'),
    join(searchPath, '.continue/skills'),
    join(searchPath, '.cursor/skills'),
    join(searchPath, '.factory/skills'),
    join(searchPath, '.github/skills'),
    join(searchPath, '.goose/skills'),
    join(searchPath, '.kilocode/skills'),
    join(searchPath, '.kiro/skills'),
    join(searchPath, '.neovate/skills'),
    join(searchPath, '.openhands/skills'),
    join(searchPath, '.pi/skills'),
    join(searchPath, '.qoder/skills'),
    join(searchPath, '.roo/skills'),
    join(searchPath, '.trae/skills'),
    join(searchPath, '.windsurf/skills'),
    join(searchPath, '.zencoder/skills'),
  ];

  for (const root of agentRoots) {
    await collectSkillsFromRoot(root, seenSlugs, skills);
  }

  // Fall back to recursive search if nothing found
  if (skills.length === 0) {
    const allSkillDirs = await findSkillDirs(searchPath);

    for (const skillDir of allSkillDirs) {
      const skill = await parseSkillMd(join(skillDir, 'SKILL.md'));
      if (!skill) continue;
      const slug = basename(skill.path).toLowerCase();
      if (seenSlugs.has(slug)) continue;
      skills.push(skill);
      seenSlugs.add(slug);
    }
  }

  return skills;
}

export function getSkillDisplayName(skill: Skill): string {
  return skill.name || basename(skill.path);
}
