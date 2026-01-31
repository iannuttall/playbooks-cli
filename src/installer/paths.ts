import { homedir } from 'node:os';
import { join, normalize, resolve, sep } from 'node:path';
import { agents } from '../agents.js';
import type { AgentType } from '../types.js';

const AGENTS_DIR = '.agents';
const SKILLS_SUBDIR = 'skills';

/**
 * Sanitizes a filename/directory name to prevent path traversal attacks.
 */
export function sanitizeSkillName(name: string): string {
  let sanitized = name.replace(/[\/\\:\0]/g, '');
  sanitized = sanitized.replace(/^[.\s]+|[.\s]+$/g, '');
  sanitized = sanitized.replace(/^\.+/, '');

  if (!sanitized || sanitized.length === 0) {
    sanitized = 'unnamed-skill';
  }

  if (sanitized.length > 255) {
    sanitized = sanitized.substring(0, 255);
  }

  return sanitized;
}

/**
 * Validates that a path is within an expected base directory.
 */
export function isPathSafe(basePath: string, targetPath: string): boolean {
  const normalizedBase = normalize(resolve(basePath));
  const normalizedTarget = normalize(resolve(targetPath));

  return normalizedTarget.startsWith(normalizedBase + sep) || normalizedTarget === normalizedBase;
}

export function getCanonicalSkillsBase(options: { global?: boolean; cwd?: string } = {}): string {
  const baseDir = options.global ? homedir() : options.cwd || process.cwd();
  return join(baseDir, AGENTS_DIR, SKILLS_SUBDIR);
}

function getCanonicalSkillsDir(global: boolean, cwd?: string): string {
  return getCanonicalSkillsBase({ global, cwd });
}

export function getCanonicalPath(
  skillName: string,
  options: { global?: boolean; cwd?: string } = {}
): string {
  const sanitized = sanitizeSkillName(skillName);
  const canonicalBase = getCanonicalSkillsDir(options.global ?? false, options.cwd);
  const canonicalPath = join(canonicalBase, sanitized);

  if (!isPathSafe(canonicalBase, canonicalPath)) {
    throw new Error('Invalid skill name: potential path traversal detected');
  }

  return canonicalPath;
}

export function getInstallPath(
  skillName: string,
  agentType: AgentType,
  options: { global?: boolean; cwd?: string } = {}
): string {
  const agent = agents[agentType];
  const cwd = options.cwd || process.cwd();
  const sanitized = sanitizeSkillName(skillName);

  let targetBase: string;
  if (options.global) {
    if (!agent.globalSkillsDir) {
      throw new Error(`Agent ${agent.displayName} does not support global installation`);
    }
    targetBase = agent.globalSkillsDir;
  } else {
    targetBase = join(cwd, agent.skillsDir);
  }
  const installPath = join(targetBase, sanitized);

  if (!isPathSafe(targetBase, installPath)) {
    throw new Error('Invalid skill name: potential path traversal detected');
  }

  return installPath;
}

export function getInstallTargets(
  rawSkillName: string,
  agentType: AgentType,
  options: { global?: boolean; cwd?: string } = {}
) {
  const agent = agents[agentType];
  const isGlobal = options.global ?? false;
  const cwd = options.cwd || process.cwd();
  const skillName = sanitizeSkillName(rawSkillName);

  const canonicalBase = getCanonicalSkillsDir(isGlobal, cwd);
  const canonicalDir = join(canonicalBase, skillName);

  let agentBase: string;
  if (isGlobal) {
    if (!agent.globalSkillsDir) {
      throw new Error(`Agent ${agent.displayName} does not support global installation`);
    }
    agentBase = agent.globalSkillsDir;
  } else {
    agentBase = join(cwd, agent.skillsDir);
  }
  const agentDir = join(agentBase, skillName);

  return {
    skillName,
    canonicalBase,
    canonicalDir,
    agentBase,
    agentDir,
  };
}
