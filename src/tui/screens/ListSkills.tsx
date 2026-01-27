import { Box, Text } from 'ink';
import React from 'react';
import { agents, detectInstalledAgents } from '../../agents.js';
import { listSkillsForAgent } from '../../installed-skills.js';
import type { AgentType } from '../../types.js';
import { useNavigation } from '../context/navigation.js';
import { SelectMenu } from '../controls/SelectMenu.js';
import { Header } from '../ui/Header.js';

type Summary = {
  agent: AgentType;
  projectSkills: string[];
  globalSkills: string[];
};

export function ListScreen() {
  const { navigateTo, setBackHandler } = useNavigation();
  const [summaries, setSummaries] = React.useState<Summary[]>([]);
  const [selectedAgent, setSelectedAgent] = React.useState<Summary | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const installed = await detectInstalledAgents();
      const list = installed.length > 0 ? installed : (Object.keys(agents) as AgentType[]);
      const next: Summary[] = [];
      for (const agent of list) {
        const projectSkills = await listSkillsForAgent(agent, 'project');
        const globalSkills = await listSkillsForAgent(agent, 'global');
        next.push({
          agent,
          projectSkills: projectSkills.map((s) => s.name),
          globalSkills: globalSkills.map((s) => s.name),
        });
      }
      if (cancelled) return;
      setSummaries(next);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!selectedAgent) {
      setBackHandler(null);
      return;
    }
    setBackHandler(() => {
      setSelectedAgent(null);
      return true;
    });
    return () => {
      setBackHandler(null);
    };
  }, [selectedAgent, setBackHandler]);

  if (selectedAgent) {
    const total = selectedAgent.projectSkills.length + selectedAgent.globalSkills.length;
    return (
      <Box flexDirection="column" padding={1}>
        <Header title={`${agents[selectedAgent.agent].displayName} (${total})`} />
        {selectedAgent.projectSkills.length > 0 ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text>Project</Text>
            {selectedAgent.projectSkills.map((name) => (
              <Text key={`p-${name}`} dimColor>
                {name}
              </Text>
            ))}
          </Box>
        ) : null}
        {selectedAgent.globalSkills.length > 0 ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text>Global</Text>
            {selectedAgent.globalSkills.map((name) => (
              <Text key={`g-${name}`} dimColor>
                {name}
              </Text>
            ))}
          </Box>
        ) : null}
        <SelectMenu
          items={[
            { label: 'Back to agents', value: 'back' },
            { label: 'Main menu', value: 'main' },
          ]}
          showDivider={false}
          onSelect={(item) => {
            if (item.value === 'back') {
              setSelectedAgent(null);
            } else {
              navigateTo('main');
            }
          }}
        />
      </Box>
    );
  }

  const items = summaries.map((summary) => {
    const count = summary.projectSkills.length + summary.globalSkills.length;
    return {
      label: `${agents[summary.agent].displayName}`,
      value: summary.agent,
      hint: `${count} skill${count !== 1 ? 's' : ''}`,
    };
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Installed skills" />
      <SelectMenu
        items={items}
        hint="Select an agent to view skills"
        onSelect={(item) => {
          const summary = summaries.find((s) => s.agent === item.value);
          if (summary) {
            setSelectedAgent(summary);
          }
        }}
      />
    </Box>
  );
}
