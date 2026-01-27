import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { cleanupTempDir, cloneRepo } from '../git.js';
import { type SkillScope, findSkillInstallations } from '../installed-skills.js';
import { copySkillDirectory, getCanonicalPath } from '../installer.js';
import { fetchMintlifySkill } from '../mintlify.js';
import { findProvider } from '../providers/index.js';
import { type SkillLockEntry, addSkillToLock, getAllLockedSkills } from '../skill-lock.js';
import { discoverSkills } from '../skills.js';
import { registerTempDir } from '../temp-registry.js';

export type UpdateStatus = 'needs-update' | 'up-to-date' | 'unknown';

export interface UpdateTarget {
  name: string;
  entry: SkillLockEntry;
  scope: SkillScope;
  status?: UpdateStatus;
  latestHash?: string | null;
}

export interface UpdateSummary {
  updated: UpdateTarget[];
  skipped: UpdateTarget[];
  failed: UpdateTarget[];
}

type RepoTree = {
  sha: string;
  tree: Array<{ path: string; type: string; sha: string }>;
};

type RepoTreeResult = { tree: RepoTree | null; rateLimited: boolean };

const repoTreeCache = new Map<string, RepoTreeResult>();

function normalizeSkillFolderPath(skillPath: string): string {
  let folderPath = skillPath;
  if (folderPath.endsWith('/SKILL.md')) {
    folderPath = folderPath.slice(0, -9);
  } else if (folderPath.endsWith('SKILL.md')) {
    folderPath = folderPath.slice(0, -8);
  }
  if (folderPath.endsWith('/')) {
    folderPath = folderPath.slice(0, -1);
  }
  return folderPath;
}

async function fetchRepoTree(ownerRepo: string): Promise<RepoTreeResult> {
  if (repoTreeCache.has(ownerRepo)) {
    return repoTreeCache.get(ownerRepo) ?? { tree: null, rateLimited: false };
  }
  let rateLimited = false;
  const branches = ['main', 'master'];
  for (const branch of branches) {
    try {
      const url = `https://api.github.com/repos/${ownerRepo}/git/trees/${branch}?recursive=1`;
      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'playbooks-cli',
        },
      });
      if (!response.ok) {
        if (response.status === 403) {
          const remaining = response.headers.get('x-ratelimit-remaining');
          if (remaining === '0') {
            rateLimited = true;
            break;
          }
        }
        continue;
      }
      const data = (await response.json()) as RepoTree;
      if (data && Array.isArray(data.tree)) {
        const result = { tree: data, rateLimited: false };
        repoTreeCache.set(ownerRepo, result);
        return result;
      }
    } catch {}
  }
  const result = { tree: null, rateLimited };
  repoTreeCache.set(ownerRepo, result);
  return result;
}

function getFolderHashFromTree(tree: RepoTree, skillPath: string): string | null {
  const folderPath = normalizeSkillFolderPath(skillPath);
  if (!folderPath) {
    return tree.sha;
  }
  const entry = tree.tree.find((item) => item.type === 'tree' && item.path === folderPath);
  return entry?.sha ?? null;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function applyUpdateFromDir(
  skillName: string,
  scope: SkillScope,
  sourceDir: string
): Promise<boolean> {
  const canonicalPath = getCanonicalPath(skillName, { global: scope === 'global' });
  const installs = await findSkillInstallations(skillName, scope);
  const canonicalExists = await pathExists(canonicalPath);
  const hasSymlink = installs.some((i) => i.isSymlink);

  if (!canonicalExists && installs.length === 0) {
    return false;
  }

  if (canonicalExists || hasSymlink) {
    await rm(canonicalPath, { recursive: true, force: true });
    await copySkillDirectory(sourceDir, canonicalPath);
  }

  const updateTargets = installs.filter((i) => !i.isSymlink && i.path !== canonicalPath);

  if (updateTargets.length > 0) {
    for (const install of updateTargets) {
      await rm(install.path, { recursive: true, force: true });
      await copySkillDirectory(sourceDir, install.path);
    }
  }

  return true;
}

async function updateFromRepo(target: UpdateTarget): Promise<boolean> {
  const tempDir = await cloneRepo(target.entry.sourceUrl, target.entry.ref);
  try {
    let sourceDir: string | null = null;

    if (target.entry.skillPath) {
      const normalizedPath = target.entry.skillPath.replace(/\\/g, '/');
      const skillDir = join(tempDir, dirname(normalizedPath));
      if (await pathExists(join(skillDir, 'SKILL.md'))) {
        sourceDir = skillDir;
      }
    }

    if (!sourceDir) {
      const skills = await discoverSkills(tempDir);
      const match = skills.find((skill) => skill.name === target.name);
      if (match) {
        sourceDir = match.path;
      }
    }

    if (!sourceDir) {
      return false;
    }

    return await applyUpdateFromDir(target.name, target.scope, sourceDir);
  } finally {
    await cleanupTempDir(tempDir);
  }
}

async function updateFromRemote(target: UpdateTarget): Promise<boolean> {
  const provider = findProvider(target.entry.sourceUrl);
  let content: string | null = null;

  if (provider) {
    const skill = await provider.fetchSkill(target.entry.sourceUrl);
    if (skill) {
      content = skill.content;
    }
  } else if (target.entry.sourceType === 'mintlify') {
    const legacy = await fetchMintlifySkill(target.entry.sourceUrl);
    if (legacy) {
      content = legacy.content;
    }
  }

  if (!content) {
    return false;
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'playbooks-skill-'));
  registerTempDir(tempDir);
  try {
    await mkdir(tempDir, { recursive: true });
    await writeFile(join(tempDir, 'SKILL.md'), content, 'utf-8');
    return await applyUpdateFromDir(target.name, target.scope, tempDir);
  } finally {
    await cleanupTempDir(tempDir);
  }
}

async function updateTargetSkill(target: UpdateTarget): Promise<boolean> {
  if (
    target.entry.sourceType === 'github' ||
    target.entry.sourceType === 'gitlab' ||
    target.entry.sourceType === 'git'
  ) {
    return await updateFromRepo(target);
  }

  return await updateFromRemote(target);
}

export async function collectUpdateTargets(scopes: SkillScope[]): Promise<UpdateTarget[]> {
  const targets: UpdateTarget[] = [];

  for (const scope of scopes) {
    const locked = await getAllLockedSkills({ global: scope === 'global' });
    for (const [name, entry] of Object.entries(locked)) {
      targets.push({ name, entry, scope });
    }
  }

  return targets;
}

export async function annotateUpdateTargets(
  targets: UpdateTarget[]
): Promise<{ targets: UpdateTarget[]; rateLimited: boolean }> {
  const grouped = new Map<string, UpdateTarget[]>();
  let rateLimited = false;
  for (const target of targets) {
    if (target.entry.sourceType !== 'github') {
      target.status = 'unknown';
      continue;
    }
    if (!target.entry.source || !target.entry.skillPath) {
      target.status = 'unknown';
      continue;
    }
    const list = grouped.get(target.entry.source) ?? [];
    list.push(target);
    grouped.set(target.entry.source, list);
  }

  for (const [source, list] of grouped.entries()) {
    const result = await fetchRepoTree(source);
    if (result.rateLimited) {
      rateLimited = true;
    }
    if (!result.tree) {
      for (const target of list) {
        target.status = 'unknown';
      }
      continue;
    }
    for (const target of list) {
      const skillPath = target.entry.skillPath;
      if (!skillPath) {
        target.status = 'unknown';
        continue;
      }
      const latestHash = getFolderHashFromTree(result.tree, skillPath);
      target.latestHash = latestHash;
      if (!latestHash || !target.entry.skillFolderHash) {
        target.status = 'unknown';
        continue;
      }
      target.status = latestHash === target.entry.skillFolderHash ? 'up-to-date' : 'needs-update';
    }
  }

  return { targets, rateLimited };
}

export async function updateSkills(targets: UpdateTarget[]): Promise<UpdateSummary> {
  const updated: UpdateTarget[] = [];
  const skipped: UpdateTarget[] = [];
  const failed: UpdateTarget[] = [];

  for (const target of targets) {
    if (target.status === 'up-to-date') {
      skipped.push(target);
      continue;
    }
    try {
      const didUpdate = await updateTargetSkill(target);
      if (!didUpdate) {
        skipped.push(target);
        continue;
      }
      const { installedAt, updatedAt, ...entry } = target.entry;
      const nextEntry = {
        ...entry,
        skillFolderHash: target.latestHash ?? entry.skillFolderHash,
      };
      await addSkillToLock(target.name, nextEntry, { global: target.scope === 'global' });
      updated.push(target);
    } catch {
      failed.push(target);
    }
  }

  return { updated, skipped, failed };
}
