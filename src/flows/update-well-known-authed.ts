import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { cleanupTempDir } from '../git.js';
import type { SkillScope } from '../installed-skills.js';
import { isPathSafe } from '../installer/paths.js';
import { wellKnownProvider } from '../providers/index.js';
import type { SkillLockEntry } from '../skill-lock.js';
import { discoverSkills } from '../skills.js';
import { registerTempDir } from '../temp-registry.js';

type AuthedContentResponse = { success: true; data: unknown } | { success: false; error?: string };

function resolveAuthedIndexAuth(
  entry: {
    auth?: { tokenHeader: string; tokenPrefix?: string };
    content: { tokenHeader?: string; tokenPrefix?: string };
    verify?: { tokenHeader?: string; tokenPrefix?: string };
  },
  endpoint: 'content' | 'verify'
): { tokenHeader: string; tokenPrefix: string } {
  if (entry.auth?.tokenHeader) {
    return { tokenHeader: entry.auth.tokenHeader, tokenPrefix: entry.auth.tokenPrefix ?? '' };
  }

  const spec = endpoint === 'content' ? entry.content : entry.verify;
  const tokenHeader = spec?.tokenHeader;
  const tokenPrefix = spec?.tokenPrefix;
  if (!tokenHeader) {
    throw new Error(
      'Invalid well-known index entry: missing auth.tokenHeader (or legacy tokenHeader).'
    );
  }
  return { tokenHeader, tokenPrefix: tokenPrefix ?? '' };
}

async function fetchWellKnownAuthedManifest(
  sourceUrl: string,
  licenseKey: string
): Promise<unknown> {
  const result = await wellKnownProvider.fetchIndex(sourceUrl);
  if (!result) return null;

  const entry = result.index.skills.find(
    (e) => e && typeof e === 'object' && 'content' in e && !('files' in e)
  ) as
    | {
        auth?: { tokenHeader: string; tokenPrefix?: string };
        content: { endpoint: string; method: string; tokenHeader?: string; tokenPrefix?: string };
        verify?: { endpoint: string; method: string; tokenHeader?: string; tokenPrefix?: string };
      }
    | undefined;

  if (!entry?.content?.endpoint) return null;

  const contentAuth = resolveAuthedIndexAuth(entry, 'content');
  const tokenValue = `${contentAuth.tokenPrefix}${licenseKey}`;

  if (entry.verify?.endpoint) {
    const verifyAuth = resolveAuthedIndexAuth(entry, 'verify');
    const verifyRes = await fetch(entry.verify.endpoint, {
      method: entry.verify.method,
      headers: { [verifyAuth.tokenHeader]: tokenValue },
    });
    if (!verifyRes.ok) {
      const text = await verifyRes.text().catch(() => '');
      let msg = text;
      try {
        const parsed = JSON.parse(text) as { error?: unknown };
        if (typeof parsed?.error === 'string' && parsed.error) {
          msg = parsed.error;
        }
      } catch {}
      throw new Error(msg || `License verification failed (${verifyRes.status}).`);
    }
  }

  const res = await fetch(entry.content.endpoint, {
    method: entry.content.method,
    headers: { [contentAuth.tokenHeader]: tokenValue },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Unable to fetch skill content (${res.status}).`);
  }

  const json = (await res.json()) as unknown;
  if (json && typeof json === 'object' && 'success' in json) {
    const wrapped = json as AuthedContentResponse;
    if (!wrapped.success) {
      throw new Error(wrapped.error || 'Unable to fetch skill content.');
    }
    return wrapped.data;
  }
  return json;
}

export type UpdateTargetLike = {
  name: string;
  scope: SkillScope;
  entry: SkillLockEntry;
  status?: 'needs-update' | 'up-to-date' | 'unknown';
  latestHash?: string | null;
};

export async function updateFromWellKnownAuthed(
  target: UpdateTargetLike,
  helpers: {
    applyUpdateFromDir: (
      skillName: string,
      scope: SkillScope,
      sourceDir: string
    ) => Promise<boolean>;
    pathExists: (path: string) => Promise<boolean>;
  }
): Promise<boolean> {
  if (target.entry.sourceType !== 'well-known') return false;
  if (!target.entry.licenseKey) return false;

  const sourceUrl = target.entry.sourceUrl || target.entry.source;
  const manifest = (await fetchWellKnownAuthedManifest(sourceUrl, target.entry.licenseKey)) as {
    files?: Record<string, string>;
    contentHash?: string;
  } | null;

  if (!manifest?.files || typeof manifest.files !== 'object') {
    return false;
  }

  if (manifest.contentHash) {
    target.latestHash = manifest.contentHash;
    if (target.entry.skillFolderHash && target.entry.skillFolderHash === manifest.contentHash) {
      target.status = 'up-to-date';
      return false;
    }
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'playbooks-well-known-'));
  registerTempDir(tempDir);
  try {
    await mkdir(tempDir, { recursive: true });
    for (const [filePath, fileContent] of Object.entries(manifest.files)) {
      const targetPath = join(tempDir, filePath);
      if (!isPathSafe(tempDir, targetPath)) continue;
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, fileContent, 'utf-8');
    }

    // The manifest may contain multiple skills. Only update when we can resolve the intended skill dir.
    let sourceDir: string | null = null;
    if (target.entry.skillPath) {
      const normalized = target.entry.skillPath.replace(/\\/g, '/').replace(/^\/+/, '');
      const folder = normalized.toLowerCase().endsWith('skill.md')
        ? dirname(normalized)
        : normalized;
      const candidate = join(tempDir, folder);
      if (await helpers.pathExists(join(candidate, 'SKILL.md'))) {
        sourceDir = candidate;
      }
    }

    if (!sourceDir) {
      const discovered = await discoverSkills(tempDir);
      const match = discovered.find((s) => s.name === target.name) ?? null;
      sourceDir = match ? match.path : null;
    }

    if (!sourceDir) {
      // Skill no longer present in the product manifest (or it was renamed). Leave local install as-is.
      return false;
    }

    return await helpers.applyUpdateFromDir(target.name, target.scope, sourceDir);
  } finally {
    await cleanupTempDir(tempDir);
  }
}
