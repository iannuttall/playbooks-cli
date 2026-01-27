import type { MarketplaceSkillOrigin } from '../commands/types.js';
import { addSkillToLock, fetchSkillFolderHash } from '../skill-lock.js';
import { getSkillDisplayName } from '../skills.js';
import { getOwnerRepo, parseSource } from '../source-parser.js';
import { trackInstall } from '../telemetry.js';
import type { AgentType, ParsedSource, Skill } from '../types.js';
import type { InstallResult } from './install-summary.js';

export async function recordMarketplaceTracking(
  skills: Skill[],
  results: InstallResult[],
  installGlobally: boolean,
  originBySkillName: Map<string, MarketplaceSkillOrigin>
) {
  const successfulSkillNames = new Set(results.filter((r) => r.success).map((r) => r.skill));
  const originGroups = new Map<
    string,
    {
      origin: MarketplaceSkillOrigin;
      skills: string[];
      skillFiles: Record<string, string>;
    }
  >();

  for (const skill of skills) {
    const displayName = getSkillDisplayName(skill);
    if (!successfulSkillNames.has(displayName)) continue;
    const origin = originBySkillName.get(displayName);
    if (!origin) continue;

    const key = origin.source
      ? `${origin.sourceType}:${origin.source}`
      : `${origin.sourceType}:${origin.sourceUrl}`;
    const group = originGroups.get(key) ?? {
      origin,
      skills: [],
      skillFiles: {},
    };
    group.skills.push(displayName);
    if (origin.skillPath) {
      group.skillFiles[displayName] = origin.skillPath;
    }
    originGroups.set(key, group);
  }

  const successfulAgents = Array.from(
    new Set(results.filter((r) => r.success).map((r) => r.agentId))
  ) as AgentType[];

  for (const group of originGroups.values()) {
    const fallbackSource =
      group.origin.source ?? getOwnerRepo(parseSource(group.origin.sourceUrl)) ?? null;

    if (!fallbackSource) continue;

    trackInstall({
      source: fallbackSource,
      sourceType: group.origin.sourceType,
      skills: group.skills,
      agents: successfulAgents,
      ...(installGlobally && { global: true }),
      skillFiles: group.skillFiles,
    });
  }

  for (const skill of skills) {
    const displayName = getSkillDisplayName(skill);
    if (!successfulSkillNames.has(displayName)) continue;
    const origin = originBySkillName.get(displayName);
    if (!origin) continue;

    try {
      let skillFolderHash = '';
      if (origin.sourceType === 'github' && origin.source && origin.skillPath) {
        const hash = await fetchSkillFolderHash(origin.source, origin.skillPath);
        if (hash) skillFolderHash = hash;
      }

      await addSkillToLock(
        displayName,
        {
          source: origin.source ?? origin.sourceUrl,
          sourceType: origin.sourceType,
          sourceUrl: origin.sourceUrl,
          skillPath: origin.skillPath,
          skillFolderHash,
          ref: origin.ref,
        },
        { global: installGlobally }
      );
    } catch {
      // Ignore lock update errors
    }
  }
}

export async function recordParsedTracking(
  skills: Skill[],
  results: InstallResult[],
  installGlobally: boolean,
  parsed: ParsedSource,
  tempDir?: string | null
) {
  const successful = results.filter((r) => r.success);
  const successfulSkillNames = new Set(successful.map((r) => r.skill));
  const skillFiles: Record<string, string> = {};

  for (const skill of skills) {
    const displayName = getSkillDisplayName(skill);
    if (!successfulSkillNames.has(displayName)) continue;

    let relativePath: string | null = null;
    if (tempDir && skill.path === tempDir) {
      relativePath = 'SKILL.md';
    } else if (tempDir && skill.path.startsWith(`${tempDir}/`)) {
      relativePath = `${skill.path.slice(tempDir.length + 1)}/SKILL.md`;
    }

    if (relativePath) {
      skillFiles[displayName] = relativePath;
    }
  }

  const normalizedSource = getOwnerRepo(parsed);
  if (normalizedSource && successful.length > 0) {
    const successfulAgents = Array.from(new Set(successful.map((r) => r.agentId))) as AgentType[];
    trackInstall({
      source: normalizedSource,
      sourceType: parsed.type,
      skills: Array.from(successfulSkillNames),
      agents: successfulAgents,
      ...(installGlobally && { global: true }),
      skillFiles,
    });
  }

  for (const skill of skills) {
    const displayName = getSkillDisplayName(skill);
    if (!successfulSkillNames.has(displayName)) continue;

    try {
      let skillFolderHash = '';
      const skillPathValue = skillFiles[displayName];
      if (parsed.type === 'github' && normalizedSource && skillPathValue) {
        const hash = await fetchSkillFolderHash(normalizedSource, skillPathValue);
        if (hash) skillFolderHash = hash;
      }

      await addSkillToLock(
        displayName,
        {
          source: normalizedSource ?? parsed.url,
          sourceType: parsed.type,
          sourceUrl: parsed.url,
          skillPath: skillPathValue,
          skillFolderHash,
          ref: parsed.ref,
        },
        { global: installGlobally }
      );
    } catch {
      // Ignore lock update errors
    }
  }
}
