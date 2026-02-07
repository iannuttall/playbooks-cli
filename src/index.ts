#!/usr/bin/env node

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { type Command, program } from 'commander';
import packageJson from '../package.json' with { type: 'json' };
import { agents } from './agents.js';
import { type SearchOutcome, searchSkillDirectory } from './flows/find-skill.js';
import { consumeUrlMarkdownOutput } from './flows/url-markdown-output.js';
import { fetchUrlMarkdown } from './playbooks-api.js';
import { setVersion } from './telemetry.js';
import { setupTempDirCleanup } from './temp-registry.js';
import { runApp } from './tui/App.js';
import type { CliInvocation, Screen } from './tui/types.js';

const version = packageJson.version;
setVersion(version);
setupTempDirCleanup();

program.name('playbooks').description('playbooks CLI').version(version);
program.addHelpCommand();

const applyAddSkillOptions = (cmd: Command) =>
  cmd
    .option('-g, --global', 'Install globally (user-level) instead of project-level')
    .option(
      '-a, --agent <agents...>',
      'Target agents to install to (claude-code, codex, cursor, opencode, and more)'
    )
    .option('-s, --skill <skills...>', 'Install specific skills by name')
    .option('-l, --list', 'List available skills in the repository without installing')
    .option('-y, --yes', 'Skip confirmation prompts')
    .option('--all', 'Install all skills to all agents without prompts (implies -y -g)');

function normalizeOptions(options: Record<string, unknown>) {
  const normalized = { ...options } as Record<string, unknown>;
  if (normalized.all) {
    normalized.yes = true;
    normalized.global = true;
  }
  return normalized;
}

async function launch(invocation: CliInvocation, initialScreen: Screen) {
  const normalized = {
    ...invocation,
    options: normalizeOptions(invocation.options as Record<string, unknown>),
  } as CliInvocation;
  await runApp(normalized, initialScreen);
}

function initialAddSkillScreen(source?: string): Screen {
  return source ? 'add-skill-select' : 'add-source';
}

function formatAgentListMarkdown(): string {
  const entries = Object.values(agents)
    .map((agent) => ({ name: agent.name, displayName: agent.displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const lines: string[] = ['# Supported agents', ''];
  for (const entry of entries) {
    lines.push(`- ${entry.displayName} (\`${entry.name}\`)`);
  }
  return lines.join('\n');
}

function formatFindSkillMarkdown(query: string, outcome: SearchOutcome): string {
  const lines: string[] = [`# Skill search results for "${query}"`];
  lines.push('Ordered by best match; official sources recommended.');
  if (outcome.fallback) {
    lines.push('_Note: semantic search unavailable. Showing fast results._');
  }

  if (outcome.results.length === 0) {
    lines.push('', '_No results._');
    return lines.join('\n');
  }

  lines.push('');

  for (const result of outcome.results.slice(0, 10)) {
    const description = result.shortDescription ?? result.description ?? '';
    const repo =
      result.repoOwner && result.repoName ? `${result.repoOwner}/${result.repoName}` : null;
    const skillName = result.skillSlug ?? result.name;
    if (!repo || !skillName) {
      continue;
    }
    const tag = result.isOfficial ? '[official]' : '[community]';
    lines.push(`- ${tag} npx playbooks add skill ${repo} --skill ${skillName}`);
    if (description) {
      lines.push(`  ${truncateLine(description, 140)}`);
    }
  }

  return lines.join('\n');
}

function truncateLine(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const sliced = value.slice(0, Math.max(0, maxLength - 1)).trimEnd();
  return sliced ? `${sliced}…` : value.slice(0, maxLength);
}

applyAddSkillOptions(
  program
    .command('add-skill [source]', { hidden: true })
    .description('Legacy: use playbooks add skill')
    .action(async (source: string | undefined, options) => {
      await launch({ intent: 'add-skill', source, options }, initialAddSkillScreen(source));
    })
);

const addCmd = program.command('add').description('Add resources to your agents');

applyAddSkillOptions(
  addCmd
    .command('skill [source]')
    .description('Add skills')
    .action(async (source: string | undefined, options) => {
      await launch({ intent: 'add-skill', source, options }, initialAddSkillScreen(source));
    })
);

addCmd
  .command('docs')
  .description('Add docs')
  .action(async (options) => {
    await launch({ intent: 'add-docs', options }, 'add-docs');
  });

const listCmd = program.command('list').description('List installed resources');

listCmd
  .command('skill')
  .description('List installed skills')
  .action(async () => {
    await launch({ intent: 'list', options: {} }, 'list');
  });

listCmd
  .command('agents')
  .description('List supported agents')
  .action(() => {
    console.log(formatAgentListMarkdown());
  });

const manageCmd = program.command('manage').description('Remove installed resources');

manageCmd
  .command('skill')
  .description('Remove installed skills')
  .action(async () => {
    await launch({ intent: 'manage', options: {} }, 'manage');
  });

const updateCmd = program.command('update').description('Update installed resources');

updateCmd
  .command('skill [skill-names...]')
  .description('Update installed skills')
  .option('--global', 'Only update global installs')
  .option('--project', 'Only update project installs')
  .option('-y, --yes', 'Skip prompts and update all matching skills')
  .action(async (skillNames: string[] | undefined, options) => {
    await launch({ intent: 'update', options, updateSkillNames: skillNames }, 'update');
  });

updateCmd
  .command('docs')
  .description('Update installed docs')
  .action(async (options) => {
    await launch({ intent: 'update-docs', options }, 'update-docs');
  });

const skillCmd = applyAddSkillOptions(
  program.command('skill [source]', { hidden: true }).description('Legacy: use playbooks add skill')
);

applyAddSkillOptions(
  skillCmd
    .command('add [source]')
    .description('Add skills')
    .action(async (source: string | undefined, options) => {
      await launch({ intent: 'add-skill', source, options }, initialAddSkillScreen(source));
    })
);

skillCmd
  .command('list')
  .description('Show installed skills')
  .action(async () => {
    await launch({ intent: 'list', options: {} }, 'list');
  });

skillCmd
  .command('manage')
  .description('Remove installed skills')
  .action(async () => {
    await launch({ intent: 'manage', options: {} }, 'manage');
  });

skillCmd
  .command('update [skill-names...]')
  .description('Update installed skills from their original sources')
  .option('--global', 'Only update global installs')
  .option('--project', 'Only update project installs')
  .option('-y, --yes', 'Skip prompts and update all matching skills')
  .action(async (skillNames: string[] | undefined, options) => {
    await launch({ intent: 'update', options, updateSkillNames: skillNames }, 'update');
  });

skillCmd.action(async (source: string | undefined, options) => {
  await launch(
    { intent: source ? 'add-skill' : 'skill', source, options },
    source ? initialAddSkillScreen(source) : 'main'
  );
});

const findCmd = program.command('find').description('Search the playbooks directory');

findCmd
  .command('skill [query]')
  .description('Find skills')
  .option('--semantic', 'Use semantic search (falls back to fast search)')
  .action(async (query: string | undefined, options: { semantic?: boolean }) => {
    if (!query) {
      await launch({ intent: 'find-skill', options: {} }, 'find-skill-search');
      return;
    }

    const mode = options.semantic ? 'semantic' : 'lexical';
    try {
      const outcome = await searchSkillDirectory(query, mode, 10);
      console.log(formatFindSkillMarkdown(query, outcome));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed.';
      console.error(message);
      process.exit(1);
    }
  });

const scanCmd = program.command('scan').description('Scan installed resources');

scanCmd
  .command('skills')
  .description('Security scan all installed skills (project + global)')
  .action(async () => {
    await launch({ intent: 'scan', options: {} }, 'scan-skills');
  });

program
  .command('get <url> [outKeyword] [outPath]')
  .description('Fetch a URL as markdown')
  .option('--json', 'Output JSON metadata instead of raw markdown')
  .action(
    async (
      url: string,
      outKeyword: string | undefined,
      outPath: string | undefined,
      options: { json?: boolean }
    ) => {
      let outputPath: string | undefined = undefined;
      if (outKeyword || outPath) {
        if (outKeyword !== 'out' || !outPath) {
          console.error('Usage: playbooks get <url> [out <path>]');
          process.exit(1);
        }
        outputPath = outPath;
      }

      const shouldUseTui = Boolean(process.stdout.isTTY) && !outputPath;

      if (!shouldUseTui) {
        try {
          const data = await fetchUrlMarkdown(url);
          if (outputPath) {
            if (options.json) {
              writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
              return;
            }
            const body = data.markdown.endsWith('\n') ? data.markdown : `${data.markdown}\n`;
            writeFileSync(outputPath, body, 'utf8');
            return;
          }

          if (options.json) {
            process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
            return;
          }
          const body = data.markdown.endsWith('\n') ? data.markdown : `${data.markdown}\n`;
          process.stdout.write(body);
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch markdown.';
          console.error(`Failed to fetch markdown: ${message}`);
          process.exit(1);
        }
      }

      await runApp(
        { intent: 'get-url', source: url, options: { json: options.json, output: outputPath } },
        'get-url'
      );

      const output = consumeUrlMarkdownOutput();
      if (!output) {
        return;
      }
      if (output.status === 'error') {
        console.error(`Failed to fetch markdown: ${output.message}`);
        process.exit(1);
      }
      if (outputPath) {
        if (options.json) {
          writeFileSync(outputPath, `${JSON.stringify(output.data, null, 2)}\n`, 'utf8');
          return;
        }
        const body = output.data.markdown.endsWith('\n')
          ? output.data.markdown
          : `${output.data.markdown}\n`;
        writeFileSync(outputPath, body, 'utf8');
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(output.data, null, 2));
        return;
      }
      const body = output.data.markdown.endsWith('\n')
        ? output.data.markdown
        : `${output.data.markdown}\n`;
      process.stdout.write(body);
    }
  );

program.action(async () => {
  await launch({ intent: 'none', options: {} }, 'main');
});

await program.parseAsync();
