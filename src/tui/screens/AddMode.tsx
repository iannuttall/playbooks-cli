import { join } from 'node:path';
import { Box } from 'ink';
import React from 'react';
import { agents } from '../../agents.js';
import { formatList, shortenPath } from '../../cli-utils.js';
import { getCanonicalSkillsBase } from '../../installer.js';
import { useNavigation } from '../context/navigation.js';
import { SingleSelect } from '../controls/SingleSelect.js';
import { AddFlowHeader } from '../ui/AddFlowHeader.js';

export function AddModeScreen() {
  const { invocation, addSkill, updateAddSkill, navigateTo, navAction } = useNavigation();
  const options = invocation.options;

  React.useEffect(() => {
    if (navAction === 'pop') return;
    if (addSkill.installMode) {
      navigateTo('add-confirm');
      return;
    }
    if (options.yes) {
      updateAddSkill({ installMode: 'symlink' });
      navigateTo('add-confirm');
    }
  }, [navAction, options.yes, updateAddSkill, navigateTo, addSkill.installMode]);

  const cwd = process.cwd();
  const canonicalBase = getCanonicalSkillsBase({ global: addSkill.installGlobally, cwd });
  const canonicalLabel = shortenPath(canonicalBase, cwd);
  const symlinkHint = `Symlink: store once at ${canonicalLabel}`;
  const targetAgents = addSkill.targetAgents ?? [];
  const agentPaths =
    targetAgents.length > 0
      ? targetAgents
          .map((agent) => {
            const config = agents[agent];
            const base = addSkill.installGlobally
              ? config.globalSkillsDir
              : join(cwd, config.skillsDir);
            return base ? shortenPath(base, cwd) : null;
          })
          .filter((p): p is string => p !== null)
      : [];
  const copyHint =
    agentPaths.length > 0
      ? `Copy into: ${formatList(agentPaths, 3)}`
      : 'Copy: duplicate into each agent folder';
  const items = [
    { label: 'Symlink (recommended)', value: 'symlink', hint: symlinkHint },
    { label: 'Copy to each agent', value: 'copy', hint: copyHint },
  ] satisfies Array<{ label: string; value: 'symlink' | 'copy'; hint: string }>;

  return (
    <Box flexDirection="column" padding={1}>
      <AddFlowHeader title="Install mode" />
      <SingleSelect
        items={items}
        initialValue={addSkill.installMode ?? 'symlink'}
        onSubmit={(value) => {
          updateAddSkill({ installMode: value, planLines: undefined });
          navigateTo('add-confirm');
        }}
      />
    </Box>
  );
}
