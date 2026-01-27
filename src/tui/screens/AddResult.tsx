import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { AddFlowHeader } from '../ui/AddFlowHeader.js';
import { SelectMenu } from '../controls/SelectMenu.js';
import { useNavigation } from '../context/navigation.js';
import { formatResultSummary } from '../../flows/install-summary.js';
import { formatList } from '../../cli-utils.js';

export function AddResultScreen() {
  const { addSkill, resetAddSkill, navigateTo } = useNavigation();
  const results = addSkill.installResults ?? [];

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const symlinkFailures = successful.filter((r) => r.mode === 'symlink' && r.symlinkFailed);
  const summary = successful.length > 0 ? formatResultSummary(successful) : null;

  return (
    <Box flexDirection="column" padding={1}>
      <AddFlowHeader title="Install results" />
      {summary ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text>{summary.title}</Text>
          {summary.lines.map((line, idx) => (
            <Text key={`${line}-${idx}`}>{line}</Text>
          ))}
        </Box>
      ) : null}
      {failed.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="red">{`Failed to install ${failed.length}`}</Text>
          {failed.map((r) => (
            <Text key={`${r.skill}-${r.agentId}`}>
              {chalk.red('✗')} {r.skill} → {r.agent}: {chalk.dim(r.error)}
            </Text>
          ))}
        </Box>
      ) : null}
      {successful.length > 0 ? (
        <Box marginBottom={1}>
          <Text dimColor>Installed to: {formatList(successful.map((r) => r.agent))}</Text>
        </Box>
      ) : null}
      {symlinkFailures.length > 0 ? (
        <Box marginBottom={1}>
          <Text color="yellow">
            {`Symlinks failed for: ${formatList(symlinkFailures.map((r) => r.agent))}`}
          </Text>
          <Text dimColor>Files were copied instead.</Text>
        </Box>
      ) : null}
      <SelectMenu
        items={[
          { label: 'Install another skill', value: 'add' },
          { label: 'Back to main menu', value: 'main' },
        ]}
        showDivider={false}
        onSelect={(item) => {
          if (item.value === 'add') {
            resetAddSkill();
            navigateTo('add-source');
          } else {
            resetAddSkill();
            navigateTo('main');
          }
        }}
      />
    </Box>
  );
}
