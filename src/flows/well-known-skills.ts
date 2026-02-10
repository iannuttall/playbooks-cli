import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { MarketplaceSkillOrigin } from '../commands/types.js';
import { isPathSafe } from '../installer/paths.js';
import { wellKnownProvider } from '../providers/index.js';
import type {
  WellKnownAuthedSkillEntry,
  WellKnownSkillEntry,
  WellKnownStaticSkillEntry,
} from '../providers/wellknown.js';
import { discoverSkills, getSkillDisplayName } from '../skills.js';
import { registerTempDir } from '../temp-registry.js';
import type { Skill } from '../types.js';

export type WellKnownPreparedSkills = {
  tempDir: string;
  skills: Skill[];
  originBySkillName: Map<string, MarketplaceSkillOrigin>;
  /** Present when the well-known index required auth and returned a manifest with a content hash. */
  contentHash?: string;
};

export class WellKnownLicenseKeyRequiredError extends Error {
  readonly code = 'LICENSE_KEY_REQUIRED';
  constructor() {
    super('A license key is required to install this skill.');
  }
}

function isStaticEntry(entry: WellKnownSkillEntry): entry is WellKnownStaticSkillEntry {
  return 'files' in entry;
}

function isAuthedEntry(entry: WellKnownSkillEntry): entry is WellKnownAuthedSkillEntry {
  return 'content' in entry && !('files' in entry);
}

type AuthedContentResponse = { success: true; data: unknown } | { success: false; error?: string };

function resolveAuthForEndpoint(
  entry: WellKnownAuthedSkillEntry,
  endpoint: 'content' | 'verify'
): { tokenHeader: string; tokenPrefix: string } {
  if (entry.auth?.tokenHeader) {
    return { tokenHeader: entry.auth.tokenHeader, tokenPrefix: entry.auth.tokenPrefix ?? '' };
  }

  const spec = endpoint === 'content' ? entry.content : entry.verify;
  const tokenHeader = (spec as { tokenHeader?: unknown } | undefined)?.tokenHeader;
  const tokenPrefix = (spec as { tokenPrefix?: unknown } | undefined)?.tokenPrefix;

  if (typeof tokenHeader !== 'string' || !tokenHeader) {
    throw new Error(
      'Invalid well-known index entry: missing auth.tokenHeader (or legacy tokenHeader).'
    );
  }

  return { tokenHeader, tokenPrefix: typeof tokenPrefix === 'string' ? tokenPrefix : '' };
}

async function fetchAuthedManifest(
  entry: WellKnownAuthedSkillEntry,
  licenseKey: string
): Promise<unknown> {
  const contentAuth = resolveAuthForEndpoint(entry, 'content');
  const tokenValue = `${contentAuth.tokenPrefix}${licenseKey}`;

  // Optional verify step (gives nicer errors than failing content fetch).
  if (entry.verify) {
    const verifyAuth = resolveAuthForEndpoint(entry, 'verify');
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
  // Prefer the "success/data" wrapper if present (Playbooks API style), otherwise treat body as manifest.
  if (json && typeof json === 'object' && 'success' in json) {
    const wrapped = json as AuthedContentResponse;
    if (!wrapped.success) {
      throw new Error(wrapped.error || 'Unable to fetch skill content.');
    }
    return wrapped.data;
  }

  return json;
}

export async function prepareWellKnownSkills(
  sourceUrl: string,
  options?: { licenseKey?: string }
): Promise<WellKnownPreparedSkills> {
  const result = await wellKnownProvider.fetchIndex(sourceUrl);
  if (!result) {
    throw new Error(
      'No skills found at this URL. Make sure it exposes /.well-known/skills/index.json.'
    );
  }

  const { index, resolvedBaseUrl } = result;
  const entries = index.skills ?? [];
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(
      'No skills found at this URL. Make sure it exposes /.well-known/skills/index.json.'
    );
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'playbooks-skill-'));
  registerTempDir(tempDir);
  await mkdir(tempDir, { recursive: true });

  const originMap = new Map<string, MarketplaceSkillOrigin>();
  const skills: Skill[] = [];
  const sourceIdentifier = wellKnownProvider.getSourceIdentifier(sourceUrl);
  let contentHash: string | undefined;

  const authedEntries = entries.filter(isAuthedEntry);
  const staticEntries = entries.filter(isStaticEntry);

  // Authenticated flow: fetch a manifest and discover skills from it.
  if (authedEntries.length > 0) {
    const licenseKey = options?.licenseKey?.trim();
    if (!licenseKey) {
      throw new WellKnownLicenseKeyRequiredError();
    }

    // If there are multiple authed entries, keep them separated under subdirs to avoid file collisions.
    const prefixPerEntry = authedEntries.length > 1;

    for (const entry of authedEntries) {
      const manifest = await fetchAuthedManifest(entry, licenseKey);

      const m = manifest as { files?: unknown; contentHash?: unknown };
      if (!m || typeof m !== 'object' || !m.files || typeof m.files !== 'object') {
        throw new Error('Invalid manifest returned from content endpoint.');
      }
      if (typeof m.contentHash === 'string' && m.contentHash) {
        contentHash = m.contentHash;
      }

      const base = prefixPerEntry ? join(tempDir, entry.name) : tempDir;
      if (prefixPerEntry) {
        await mkdir(base, { recursive: true });
      }

      for (const [filePath, fileContent] of Object.entries(m.files as Record<string, unknown>)) {
        if (typeof fileContent !== 'string') continue;
        const targetPath = join(base, filePath);
        if (!isPathSafe(base, targetPath)) {
          continue;
        }
        await mkdir(dirname(targetPath), { recursive: true });
        await writeFile(targetPath, fileContent, 'utf-8');
      }

      const discovered = await discoverSkills(base);
      for (const skill of discovered) {
        skills.push(skill);
        // Origin mapping is per installed skill, for lockfile + telemetry.
        const displayName = getSkillDisplayName(skill);
        const relativeSkillDir = skill.path.startsWith(`${tempDir}/`)
          ? skill.path.slice(tempDir.length + 1)
          : null;
        const relativeSkillMd = relativeSkillDir ? `${relativeSkillDir}/SKILL.md` : null;

        originMap.set(displayName, {
          sourceType: 'well-known',
          sourceUrl: sourceUrl,
          source: sourceIdentifier,
          skillPath: relativeSkillMd ?? undefined,
        });
      }
    }
  }

  // Static flow: fetch SKILL.md (+ other files) from /.well-known/skills/<name>/...
  for (const entry of staticEntries) {
    const fetched = await wellKnownProvider.fetchSkillByEntry(resolvedBaseUrl, entry);
    if (!fetched) continue;

    const skillDir = join(tempDir, fetched.installName);
    await mkdir(skillDir, { recursive: true });

    for (const [filePath, fileContent] of fetched.files.entries()) {
      const targetPath = join(skillDir, filePath);
      if (!isPathSafe(skillDir, targetPath)) {
        throw new Error('Invalid file path in well-known skill index.');
      }
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, fileContent, 'utf-8');
    }

    const localSkill: Skill = {
      name: fetched.installName,
      description: fetched.description,
      path: skillDir,
      rawContent: fetched.content,
      metadata: fetched.metadata as Record<string, string> | undefined,
    };

    skills.push(localSkill);
    originMap.set(getSkillDisplayName(localSkill), {
      sourceType: 'well-known',
      sourceUrl: fetched.sourceUrl,
      source: sourceIdentifier,
      skillPath: fetched.sourceUrl,
    });
  }

  if (skills.length === 0) {
    throw new Error(
      'No skills found at this URL. Make sure it exposes /.well-known/skills/index.json.'
    );
  }

  return { tempDir, skills, originBySkillName: originMap, contentHash };
}
