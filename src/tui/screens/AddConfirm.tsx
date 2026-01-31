import { join } from 'node:path';
import { Box, Text } from 'ink';
import React from 'react';
import { agents } from '../../agents.js';
import { formatList, shortenPath } from '../../cli-utils.js';
import { buildPlanSummary } from '../../flows/plan-summary.js';
import { getCanonicalSkillsBase } from '../../installer.js';
import { useNavigation } from '../context/navigation.js';
import { SelectMenu } from '../controls/SelectMenu.js';
import { AddFlowHeader } from '../ui/AddFlowHeader.js';

export function AddConfirmScreen() {
  const { invocation, addSkill, updateAddSkill, navigateTo, navAction } = useNavigation();
  const options = invocation.options;
  const [lines, setLines] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!addSkill.selectedSkills || !addSkill.targetAgents) return;
    if (addSkill.installGlobally === undefined || !addSkill.installMode) return;

    if (addSkill.planLines && addSkill.planLines.length > 0) {
      setLines(addSkill.planLines);
      return;
    }

    buildPlanSummary(
      addSkill.selectedSkills,
      addSkill.targetAgents,
      addSkill.installGlobally,
      addSkill.installMode
    ).then((summary) => {
      updateAddSkill({ planLines: summary });
      setLines(summary);
    });
  }, [
    addSkill.selectedSkills,
    addSkill.targetAgents,
    addSkill.installGlobally,
    addSkill.installMode,
    addSkill.planLines,
    updateAddSkill,
  ]);

  React.useEffect(() => {
    if (navAction === 'pop') return;
    if (!options.yes) return;
    navigateTo('add-install');
  }, [navAction, options.yes, navigateTo]);

  const skillsCount = addSkill.selectedSkills?.length ?? 0;
  const agentsCount = addSkill.targetAgents?.length ?? 0;
  const cwd = process.cwd();
  const scopeLabel = addSkill.installGlobally ? 'Global' : 'Project';
  const installModeLabel = addSkill.installMode === 'symlink' ? 'Symlink' : 'Copy';
  const canonicalBase = getCanonicalSkillsBase({ global: addSkill.installGlobally, cwd });
  const canonicalLabel = shortenPath(canonicalBase, cwd);
  const targetAgents = addSkill.targetAgents ?? [];
  const keyedLines = React.useMemo(() => {
    const counts = new Map<string, number>();
    return lines.map((line) => {
      const count = (counts.get(line) ?? 0) + 1;
      counts.set(line, count);
      return { line, key: `${line}-${count}` };
    });
  }, [lines]);
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

  return (
    <Box flexDirection="column" padding={1}>
      <AddFlowHeader title="Review plan" />
      <Box flexDirection="column" marginBottom={1}>
        <Text>{`Skills: ${skillsCount} • Agents: ${agentsCount}`}</Text>
        {addSkill.targetAgents ? (
          <Text dimColor>
            {`Targets: ${formatList(addSkill.targetAgents.map((agent) => agents[agent].displayName))}`}
          </Text>
        ) : null}
        {addSkill.installGlobally !== undefined ? (
          <Text dimColor>{`Scope: ${scopeLabel}`}</Text>
        ) : null}
        {addSkill.installMode ? <Text dimColor>{`Mode: ${installModeLabel}`}</Text> : null}
        {addSkill.installMode === 'symlink' ? (
          <Text dimColor>{`Canonical base: ${canonicalLabel}`}</Text>
        ) : null}
        {addSkill.installMode === 'copy' && agentPaths.length > 0 ? (
          <Text dimColor>{`Agent dirs: ${formatList(agentPaths, 3)}`}</Text>
        ) : null}
      </Box>
      {keyedLines.map(({ line, key }) => (
        <Text key={key}>{line}</Text>
      ))}
      <Box marginTop={1}>
        <SelectMenu
          items={[
            { label: 'Install now', value: 'install' },
            { label: 'Cancel', value: 'cancel' },
          ]}
          hint="Confirm to start installation"
          onSelect={(item) => {
            if (item.value === 'install') {
              navigateTo('add-install');
            } else {
              navigateTo('main');
            }
          }}
        />
      </Box>
    </Box>
  );
}
