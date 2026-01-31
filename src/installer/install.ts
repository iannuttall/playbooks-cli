import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { agents } from '../agents.js';
import type { AgentType, MintlifySkill, RemoteSkill, Skill } from '../types.js';
import { copySkillDirectory, createSymlink } from './files.js';
import { getInstallTargets, isPathSafe, sanitizeSkillName } from './paths.js';

export type InstallMode = 'symlink' | 'copy';

interface InstallResult {
  success: boolean;
  path: string;
  canonicalPath?: string;
  mode: InstallMode;
  symlinkFailed?: boolean;
  error?: string;
}

export async function installSkillForAgent(
  skill: Skill,
  agentType: AgentType,
  options: { global?: boolean; cwd?: string; mode?: InstallMode } = {}
): Promise<InstallResult> {
  const isGlobal = options.global ?? false;
  const cwd = options.cwd || process.cwd();
  const agent = agents[agentType];
  const installMode = options.mode ?? 'symlink';

  if (isGlobal && !agent.globalSkillsDir) {
    return {
      success: false,
      path: '',
      mode: installMode,
      error: `Agent ${agent.displayName} does not support global installation`,
    };
  }

  const rawSkillName = skill.name || basename(skill.path);
  const { canonicalBase, canonicalDir, agentBase, agentDir } = getInstallTargets(
    rawSkillName,
    agentType,
    { global: isGlobal, cwd }
  );

  if (!isPathSafe(canonicalBase, canonicalDir)) {
    return {
      success: false,
      path: agentDir,
      mode: installMode,
      error: 'Invalid skill name: potential path traversal detected',
    };
  }

  if (!isPathSafe(agentBase, agentDir)) {
    return {
      success: false,
      path: agentDir,
      mode: installMode,
      error: 'Invalid skill name: potential path traversal detected',
    };
  }

  try {
    if (installMode === 'copy') {
      await mkdir(agentDir, { recursive: true });
      await copySkillDirectory(skill.path, agentDir);

      return {
        success: true,
        path: agentDir,
        mode: 'copy',
      };
    }

    await mkdir(canonicalDir, { recursive: true });
    await copySkillDirectory(skill.path, canonicalDir);

    const symlinkCreated = await createSymlink(canonicalDir, agentDir);

    if (!symlinkCreated) {
      try {
        await rm(agentDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      await mkdir(agentDir, { recursive: true });
      await copySkillDirectory(skill.path, agentDir);

      return {
        success: true,
        path: agentDir,
        canonicalPath: canonicalDir,
        mode: 'symlink',
        symlinkFailed: true,
      };
    }

    return {
      success: true,
      path: agentDir,
      canonicalPath: canonicalDir,
      mode: 'symlink',
    };
  } catch (error) {
    return {
      success: false,
      path: agentDir,
      mode: installMode,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function installMintlifySkillForAgent(
  skill: MintlifySkill,
  agentType: AgentType,
  options: { global?: boolean; cwd?: string; mode?: InstallMode } = {}
): Promise<InstallResult> {
  const isGlobal = options.global ?? false;
  const cwd = options.cwd || process.cwd();
  const agent = agents[agentType];
  const installMode = options.mode ?? 'symlink';

  if (isGlobal && !agent.globalSkillsDir) {
    return {
      success: false,
      path: '',
      mode: installMode,
      error: `Agent ${agent.displayName} does not support global installation`,
    };
  }

  const { canonicalBase, canonicalDir, agentBase, agentDir } = getInstallTargets(
    sanitizeSkillName(skill.mintlifySite),
    agentType,
    { global: isGlobal, cwd }
  );

  if (!isPathSafe(canonicalBase, canonicalDir)) {
    return {
      success: false,
      path: agentDir,
      mode: installMode,
      error: 'Invalid skill name: potential path traversal detected',
    };
  }

  if (!isPathSafe(agentBase, agentDir)) {
    return {
      success: false,
      path: agentDir,
      mode: installMode,
      error: 'Invalid skill name: potential path traversal detected',
    };
  }

  try {
    if (installMode === 'copy') {
      await mkdir(agentDir, { recursive: true });
      const skillMdPath = join(agentDir, 'SKILL.md');
      await writeFile(skillMdPath, skill.content, 'utf-8');

      return {
        success: true,
        path: agentDir,
        mode: 'copy',
      };
    }

    await mkdir(canonicalDir, { recursive: true });
    const skillMdPath = join(canonicalDir, 'SKILL.md');
    await writeFile(skillMdPath, skill.content, 'utf-8');

    const symlinkCreated = await createSymlink(canonicalDir, agentDir);

    if (!symlinkCreated) {
      try {
        await rm(agentDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      await mkdir(agentDir, { recursive: true });
      const agentSkillMdPath = join(agentDir, 'SKILL.md');
      await writeFile(agentSkillMdPath, skill.content, 'utf-8');

      return {
        success: true,
        path: agentDir,
        canonicalPath: canonicalDir,
        mode: 'symlink',
        symlinkFailed: true,
      };
    }

    return {
      success: true,
      path: agentDir,
      canonicalPath: canonicalDir,
      mode: 'symlink',
    };
  } catch (error) {
    return {
      success: false,
      path: agentDir,
      mode: installMode,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function installRemoteSkillForAgent(
  skill: RemoteSkill,
  agentType: AgentType,
  options: { global?: boolean; cwd?: string; mode?: InstallMode } = {}
): Promise<InstallResult> {
  const isGlobal = options.global ?? false;
  const cwd = options.cwd || process.cwd();
  const agent = agents[agentType];
  const installMode = options.mode ?? 'symlink';

  if (isGlobal && !agent.globalSkillsDir) {
    return {
      success: false,
      path: '',
      mode: installMode,
      error: `Agent ${agent.displayName} does not support global installation`,
    };
  }

  const { canonicalBase, canonicalDir, agentBase, agentDir } = getInstallTargets(
    sanitizeSkillName(skill.installName),
    agentType,
    { global: isGlobal, cwd }
  );

  if (!isPathSafe(canonicalBase, canonicalDir)) {
    return {
      success: false,
      path: agentDir,
      mode: installMode,
      error: 'Invalid skill name: potential path traversal detected',
    };
  }

  if (!isPathSafe(agentBase, agentDir)) {
    return {
      success: false,
      path: agentDir,
      mode: installMode,
      error: 'Invalid skill name: potential path traversal detected',
    };
  }

  try {
    if (installMode === 'copy') {
      await mkdir(agentDir, { recursive: true });
      const skillMdPath = join(agentDir, 'SKILL.md');
      await writeFile(skillMdPath, skill.content, 'utf-8');

      return {
        success: true,
        path: agentDir,
        mode: 'copy',
      };
    }

    await mkdir(canonicalDir, { recursive: true });
    const skillMdPath = join(canonicalDir, 'SKILL.md');
    await writeFile(skillMdPath, skill.content, 'utf-8');

    const symlinkCreated = await createSymlink(canonicalDir, agentDir);

    if (!symlinkCreated) {
      try {
        await rm(agentDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      await mkdir(agentDir, { recursive: true });
      const agentSkillMdPath = join(agentDir, 'SKILL.md');
      await writeFile(agentSkillMdPath, skill.content, 'utf-8');

      return {
        success: true,
        path: agentDir,
        canonicalPath: canonicalDir,
        mode: 'symlink',
        symlinkFailed: true,
      };
    }

    return {
      success: true,
      path: agentDir,
      canonicalPath: canonicalDir,
      mode: 'symlink',
    };
  } catch (error) {
    return {
      success: false,
      path: agentDir,
      mode: installMode,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function isSkillInstalled(
  skillName: string,
  agentType: AgentType,
  options: { global?: boolean; cwd?: string } = {}
): Promise<boolean> {
  const agent = agents[agentType];
  const sanitized = sanitizeSkillName(skillName);

  // Agent doesn't support global installation
  if (options.global && !agent.globalSkillsDir) {
    return false;
  }

  const targetBase = options.global
    ? agent.globalSkillsDir
    : join(options.cwd || process.cwd(), agent.skillsDir);

  if (!targetBase) {
    return false;
  }

  const skillDir = join(targetBase, sanitized);

  if (!isPathSafe(targetBase, skillDir)) {
    return false;
  }

  try {
    await access(skillDir);
    return true;
  } catch {
    return false;
  }
}
