import { Box, Text } from 'ink';
import React from 'react';
import { formatList, shortenPath } from '../../cli-utils.js';
import { getSkillDisplayName } from '../../skills.js';
import { useNavigation } from '../context/navigation.js';
import { Header } from './Header.js';

export function AddFlowHeader({ title }: { title: string }) {
  const { invocation, addSkill } = useNavigation();
  const source = addSkill.source ?? invocation.source;
  const cwd = process.cwd();

  let sourceLabel = source ?? '';
  if (addSkill.parsed?.type === 'local' && addSkill.parsed.localPath) {
    sourceLabel = shortenPath(addSkill.parsed.localPath, cwd);
  }

  const selected = addSkill.selectedSkills;
  const available = addSkill.skills;

  let skillsLabel: string | null = null;
  if (selected && selected.length > 0) {
    skillsLabel = formatList(selected.map(getSkillDisplayName), 3);
  } else if (available && available.length > 0) {
    skillsLabel = `${available.length} available`;
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Header title={title} />
      {source ? <Text dimColor>{`Source: ${sourceLabel}`}</Text> : null}
      {skillsLabel ? <Text dimColor>{`Skills: ${skillsLabel}`}</Text> : null}
    </Box>
  );
}
