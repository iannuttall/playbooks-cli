#!/usr/bin/env node

import 'dotenv/config';
import { program, Command } from 'commander';
import packageJson from '../package.json' with { type: 'json' };
import { setVersion } from './telemetry.js';
import { runApp } from './tui/App.js';
import { setupTempDirCleanup } from './temp-registry.js';
import type { CliInvocation, Screen } from './tui/types.js';

const version = packageJson.version;
setVersion(version);
setupTempDirCleanup();

program.name('playbooks').description('Playbooks CLI').version(version);

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

applyAddSkillOptions(
  program
    .command('add-skill [source]')
    .description('Install skills onto coding agents')
    .action(async (source: string | undefined, options) => {
      await launch({ intent: 'add-skill', source, options }, initialAddSkillScreen(source));
    })
);

const skillCmd = applyAddSkillOptions(
  program.command('skill [source]').description('Manage installed skills')
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

program.action(async () => {
  await launch({ intent: 'none', options: {} }, 'main');
});

await program.parseAsync();
