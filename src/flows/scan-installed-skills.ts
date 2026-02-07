import { existsSync } from 'node:fs';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import { agents } from '../agents.js';
import type { SkillScope } from '../installed-skills.js';
import { listSkillsForAgents } from '../installed-skills.js';
import { getCanonicalSkillsBase } from '../installer/paths.js';
import type { AgentType } from '../types.js';

export type CollectedSkillDir = {
  /** Real path for dedupe */
  id: string;
  /** Name from SKILL.md frontmatter (fallback to slug) */
  name: string;
  /** Directory name in the skills folder */
  slug: string;
  /** Path to scan (may be symlink path; id is realpath) */
  path: string;
  description?: string;
  locations: Array<{ kind: 'agent' | 'canonical'; label: string }>;
};

async function safeRealpath(value: string): Promise<string> {
  try {
    return await realpath(value);
  } catch {
    return value;
  }
}

async function readFrontmatter(skillMdPath: string): Promise<{
  name?: string;
  description?: string;
}> {
  try {
    const content = await readFile(skillMdPath, 'utf-8');
    const { data } = matter(content);
    return {
      name: typeof data.name === 'string' ? data.name : undefined,
      description: typeof data.description === 'string' ? data.description : undefined,
    };
  } catch {
    return {};
  }
}

async function listCanonicalSkills(
  baseDir: string,
  scopeLabel: string
): Promise<CollectedSkillDir[]> {
  if (!existsSync(baseDir)) return [];

  const out: CollectedSkillDir[] = [];
  let entries: Array<import('node:fs').Dirent>;
  try {
    entries = await readdir(baseDir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const slug = entry.name;
    const skillDir = join(baseDir, slug);
    const skillMd = join(skillDir, 'SKILL.md');
    try {
      await stat(skillMd);
    } catch {
      continue;
    }
    const fm = await readFrontmatter(skillMd);
    const id = await safeRealpath(skillDir);
    out.push({
      id,
      name: fm.name || slug,
      slug,
      path: skillDir,
      description: fm.description,
      locations: [{ kind: 'canonical', label: scopeLabel }],
    });
  }

  return out;
}

export async function collectInstalledSkillDirs(cwd: string = process.cwd()): Promise<{
  skills: CollectedSkillDir[];
  stats: {
    agentSkills: number;
    canonicalSkills: number;
  };
}> {
  const allAgents = Object.keys(agents) as AgentType[];
  const scopes: SkillScope[] = ['project', 'global'];

  const agentSkills = await listSkillsForAgents(allAgents, scopes, cwd);

  const canonicalProject = await listCanonicalSkills(
    getCanonicalSkillsBase({ global: false, cwd }),
    'project'
  );
  const canonicalGlobal = await listCanonicalSkills(
    getCanonicalSkillsBase({ global: true }),
    'global'
  );
  const canonicalSkills = [...canonicalProject, ...canonicalGlobal];

  const map = new Map<string, CollectedSkillDir>();

  for (const skill of agentSkills) {
    // Prefer scanning the resolved target to avoid double scanning symlinked installs.
    const id = await safeRealpath(skill.path);
    const existing = map.get(id);
    const label = `${skill.agent}:${skill.scope}`;

    if (existing) {
      existing.locations.push({ kind: 'agent', label });
      continue;
    }

    map.set(id, {
      id,
      name: skill.name,
      slug: skill.slug,
      path: skill.path,
      description: skill.description,
      locations: [{ kind: 'agent', label }],
    });
  }

  for (const skill of canonicalSkills) {
    const existing = map.get(skill.id);
    if (existing) {
      existing.locations.push(...skill.locations);
      continue;
    }
    map.set(skill.id, skill);
  }

  const skills = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  return {
    skills,
    stats: {
      agentSkills: agentSkills.length,
      canonicalSkills: canonicalSkills.length,
    },
  };
}
