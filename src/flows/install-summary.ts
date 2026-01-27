import chalk from 'chalk';
import { formatList, shortenPath } from '../cli-utils.js';

export interface InstallResult {
  skill: string;
  agentId: string;
  agent: string;
  success: boolean;
  path: string;
  canonicalPath?: string;
  mode: 'symlink' | 'copy';
  symlinkFailed?: boolean;
  error?: string;
}

export function formatResultSummary(results: InstallResult[]): { title: string; lines: string[] } {
  const bySkill = new Map<string, InstallResult[]>();
  for (const r of results) {
    const skillResults = bySkill.get(r.skill) || [];
    skillResults.push(r);
    bySkill.set(r.skill, skillResults);
  }

  const cwd = process.cwd();
  const lines: string[] = [];

  for (const [skillName, skillResults] of bySkill) {
    const firstResult = skillResults[0];
    if (!firstResult) continue;

    if (firstResult.mode === 'copy') {
      lines.push(`${chalk.green('✓')} ${skillName} ${chalk.dim('(copied)')}`);
      for (const r of skillResults) {
        const shortPath = shortenPath(r.path, cwd);
        lines.push(`  ${chalk.dim('→')} ${shortPath}`);
      }
    } else {
      if (firstResult.canonicalPath) {
        const shortPath = shortenPath(firstResult.canonicalPath, cwd);
        lines.push(`${chalk.green('✓')} ${shortPath}`);
      }
      const symlinked = skillResults.filter((r) => !r.symlinkFailed).map((r) => r.agent);
      const copied = skillResults.filter((r) => r.symlinkFailed).map((r) => r.agent);

      if (symlinked.length > 0) {
        lines.push(`  ${chalk.dim('symlink →')} ${formatList(symlinked)}`);
      }
      if (copied.length > 0) {
        lines.push(`  ${chalk.yellow('copied →')} ${formatList(copied)}`);
      }
    }
  }

  const skillCount = bySkill.size;
  const agentCount = new Set(results.map((r) => r.agent)).size;
  const title = chalk.green(
    `Installed ${skillCount} skill${skillCount !== 1 ? 's' : ''} to ${agentCount} agent${
      agentCount !== 1 ? 's' : ''
    }`
  );

  return { title, lines };
}
