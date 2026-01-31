import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import matter from 'gray-matter';
import { agents } from './agents.js';
import { getCanonicalPath } from './installer.js';
import type { AgentType } from './types.js';

export type SkillScope = 'project' | 'global';

export interface InstalledSkill {
  /** Directory slug used on disk */
  slug: string;
  /** Display name (frontmatter name or slug) */
  name: string;
  description?: string;
  agent: AgentType;
  scope: SkillScope;
  path: string;
  isSymlink: boolean;
  isBroken?: boolean;
}

export interface SkillInstallation {
  agent: AgentType;
  scope: SkillScope;
  path: string;
  isSymlink: boolean;
}

function getAgentSkillsDir(agent: AgentType, scope: SkillScope, cwd: string): string | undefined {
  const config = agents[agent];
  return scope === 'global' ? config.globalSkillsDir : join(cwd, config.skillsDir);
}

async function readSkillFrontmatter(skillMdPath: string): Promise<{
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

export async function listSkillsForAgent(
  agent: AgentType,
  scope: SkillScope,
  cwd: string = process.cwd()
): Promise<InstalledSkill[]> {
  const dir = getAgentSkillsDir(agent, scope, cwd);
  const skills: InstalledSkill[] = [];

  // Agent doesn't support this scope (e.g., Replit has no global)
  if (!dir) {
    return skills;
  }

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }

      const slug = entry.name;
      const skillDir = join(dir, slug);
      const isSymlink = entry.isSymbolicLink();
      let isBroken = false;

      if (isSymlink) {
        try {
          await stat(skillDir);
        } catch {
          isBroken = true;
        }
      }

      const skillMdPath = join(skillDir, 'SKILL.md');

      if (isBroken) {
        skills.push({
          slug,
          name: slug,
          description: 'Broken link',
          agent,
          scope,
          path: skillDir,
          isSymlink,
          isBroken,
        });
        continue;
      }

      try {
        await stat(skillMdPath);
      } catch {
        continue;
      }

      const frontmatter = await readSkillFrontmatter(skillMdPath);

      skills.push({
        slug,
        name: frontmatter.name || slug,
        description: frontmatter.description,
        agent,
        scope,
        path: skillDir,
        isSymlink,
      });
    }
  } catch {
    return skills;
  }

  return skills;
}

export async function listSkillsForAgents(
  agentsList: AgentType[],
  scopes: SkillScope[],
  cwd: string = process.cwd()
): Promise<InstalledSkill[]> {
  const all: InstalledSkill[] = [];
  for (const agent of agentsList) {
    for (const scope of scopes) {
      const skills = await listSkillsForAgent(agent, scope, cwd);
      all.push(...skills);
    }
  }
  return all;
}

export async function findSkillInstallations(
  skillName: string,
  scope: SkillScope,
  cwd: string = process.cwd()
): Promise<SkillInstallation[]> {
  const installs: SkillInstallation[] = [];
  const sanitized = basename(getCanonicalPath(skillName, { global: scope === 'global', cwd }));

  if (!sanitized) {
    return installs;
  }

  for (const agent of Object.keys(agents) as AgentType[]) {
    const baseDir = getAgentSkillsDir(agent, scope, cwd);
    if (!baseDir) continue;
    const skillDir = join(baseDir, sanitized);

    try {
      const stats = await lstat(skillDir);
      installs.push({
        agent,
        scope,
        path: skillDir,
        isSymlink: stats.isSymbolicLink(),
      });
    } catch {}
  }

  return installs;
}
