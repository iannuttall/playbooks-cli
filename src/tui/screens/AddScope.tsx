import { Box } from 'ink';
import React from 'react';
import { shortenPath } from '../../cli-utils.js';
import { getCanonicalSkillsBase } from '../../installer.js';
import { useNavigation } from '../context/navigation.js';
import { SingleSelect } from '../controls/SingleSelect.js';
import { AddFlowHeader } from '../ui/AddFlowHeader.js';

export function AddScopeScreen() {
  const { invocation, addSkill, updateAddSkill, navigateTo, navAction } = useNavigation();
  const options = invocation.options;

  React.useEffect(() => {
    if (navAction === 'pop') return;
    if (addSkill.installGlobally !== undefined) {
      navigateTo('add-mode');
      return;
    }
    if (options.global !== undefined || options.yes) {
      updateAddSkill({ installGlobally: options.global ?? false });
      navigateTo('add-mode');
    }
  }, [
    navAction,
    options.global,
    options.yes,
    updateAddSkill,
    navigateTo,
    addSkill.installGlobally,
  ]);

  const cwd = process.cwd();
  const projectBase = getCanonicalSkillsBase({ global: false, cwd });
  const globalBase = getCanonicalSkillsBase({ global: true, cwd });
  const projectHint = `Project base (symlink): ${shortenPath(projectBase, cwd)}`;
  const globalHint = `Global base (symlink): ${shortenPath(globalBase, cwd)}`;

  return (
    <Box flexDirection="column" padding={1}>
      <AddFlowHeader title="Install scope" />
      <SingleSelect
        items={[
          { label: 'Project (current directory)', value: 'project', hint: projectHint },
          { label: 'Global (home directory)', value: 'global', hint: globalHint },
        ]}
        initialValue={addSkill.installGlobally ? 'global' : 'project'}
        onSubmit={(value) => {
          updateAddSkill({
            installGlobally: value === 'global',
            installMode: undefined,
            planLines: undefined,
          });
          navigateTo('add-mode');
        }}
      />
    </Box>
  );
}
