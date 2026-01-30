import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { MarketplaceSkillOrigin } from '../commands/types.js';
import { isPathSafe } from '../installer/paths.js';
import { wellKnownProvider } from '../providers/index.js';
import { getSkillDisplayName } from '../skills.js';
import { registerTempDir } from '../temp-registry.js';
import type { Skill } from '../types.js';

export type WellKnownPreparedSkills = {
  tempDir: string;
  skills: Skill[];
  originBySkillName: Map<string, MarketplaceSkillOrigin>;
};

export async function prepareWellKnownSkills(sourceUrl: string): Promise<WellKnownPreparedSkills> {
  const discovered = await wellKnownProvider.fetchAllSkills(sourceUrl);
  if (discovered.length === 0) {
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

  for (const skill of discovered) {
    const skillDir = join(tempDir, skill.installName);
    await mkdir(skillDir, { recursive: true });

    for (const [filePath, content] of skill.files.entries()) {
      const targetPath = join(skillDir, filePath);
      if (!isPathSafe(skillDir, targetPath)) {
        throw new Error('Invalid file path in well-known skill index.');
      }
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, content, 'utf-8');
    }

    const localSkill: Skill = {
      name: skill.installName,
      description: skill.description,
      path: skillDir,
      rawContent: skill.content,
      metadata: skill.metadata as Record<string, string> | undefined,
    };

    skills.push(localSkill);
    originMap.set(getSkillDisplayName(localSkill), {
      sourceType: 'well-known',
      sourceUrl: skill.sourceUrl,
      source: sourceIdentifier,
      skillPath: skill.sourceUrl,
    });
  }

  return { tempDir, skills, originBySkillName: originMap };
}
