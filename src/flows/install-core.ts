import { agents } from '../agents.js';
import type { MarketplaceSkillOrigin } from '../commands/types.js';
import { installSkillForAgent } from '../installer.js';
import { getSkillDisplayName } from '../skills.js';
import type { AgentType, ParsedSource, Skill } from '../types.js';
import type { InstallResult } from './install-summary.js';
import { recordMarketplaceTracking, recordParsedTracking } from './install-tracking.js';

export interface InstallContext {
  parsed?: ParsedSource;
  tempDir?: string | null;
  originBySkillName?: Map<string, MarketplaceSkillOrigin>;
}

export type InstallOutcome = {
  results: InstallResult[];
  successful: InstallResult[];
  failed: InstallResult[];
  symlinkFailures: InstallResult[];
};

export async function performInstall(
  selectedSkills: Skill[],
  targetAgents: AgentType[],
  installGlobally: boolean,
  installMode: 'symlink' | 'copy',
  context: InstallContext = {}
): Promise<InstallOutcome> {
  const results: InstallResult[] = [];

  for (const skill of selectedSkills) {
    const displayName = getSkillDisplayName(skill);
    for (const agent of targetAgents) {
      const result = await installSkillForAgent(skill, agent, {
        global: installGlobally,
        mode: installMode,
      });
      results.push({
        skill: displayName,
        agentId: agent,
        agent: agents[agent].displayName,
        ...result,
      });
    }
  }

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const symlinkFailures = successful.filter((r) => r.mode === 'symlink' && r.symlinkFailed);

  if (successful.length > 0) {
    if (context.originBySkillName) {
      await recordMarketplaceTracking(
        selectedSkills,
        successful,
        installGlobally,
        context.originBySkillName
      );
    } else if (context.parsed) {
      await recordParsedTracking(
        selectedSkills,
        successful,
        installGlobally,
        context.parsed,
        context.tempDir
      );
    }
  }

  return { results, successful, failed, symlinkFailures };
}
