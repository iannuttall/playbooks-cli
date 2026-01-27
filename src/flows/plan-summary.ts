import chalk from 'chalk';
import { agents } from '../agents.js';
import { formatList, shortenPath } from '../cli-utils.js';
import { getCanonicalPath, isSkillInstalled } from '../installer.js';
import { getSkillDisplayName } from '../skills.js';
import type { AgentType, Skill } from '../types.js';

export async function buildPlanSummary(
  skills: Skill[],
  targetAgents: AgentType[],
  installGlobally: boolean,
  installMode: 'symlink' | 'copy'
): Promise<string[]> {
  const cwd = process.cwd();
  const summaryLines: string[] = [];
  const overwriteStatus = new Map<string, Map<string, boolean>>();

  for (const skill of skills) {
    const displayName = getSkillDisplayName(skill);
    const agentStatus = new Map<string, boolean>();
    for (const agent of targetAgents) {
      agentStatus.set(
        agent,
        await isSkillInstalled(displayName, agent, { global: installGlobally })
      );
    }
    overwriteStatus.set(displayName, agentStatus);
  }

  const agentNames = targetAgents.map((a) => agents[a].displayName);

  for (const skill of skills) {
    const displayName = getSkillDisplayName(skill);
    if (summaryLines.length > 0) summaryLines.push('');

    if (installMode === 'symlink') {
      const canonicalPath = getCanonicalPath(displayName, { global: installGlobally });
      const shortCanonical = shortenPath(canonicalPath, cwd);
      summaryLines.push(`${chalk.cyan(shortCanonical)}`);
      summaryLines.push(`  ${chalk.dim('symlink →')} ${formatList(agentNames)}`);
    } else {
      summaryLines.push(`${chalk.cyan(displayName)}`);
      summaryLines.push(`  ${chalk.dim('copy →')} ${formatList(agentNames)}`);
    }

    const skillOverwrites = overwriteStatus.get(displayName);
    const overwriteAgents = targetAgents
      .filter((a) => skillOverwrites?.get(a))
      .map((a) => agents[a].displayName);

    if (overwriteAgents.length > 0) {
      summaryLines.push(`  ${chalk.yellow('overwrites:')} ${formatList(overwriteAgents)}`);
    }
  }

  return summaryLines;
}
