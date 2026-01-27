import React from 'react';
import { Box, Text } from 'ink';
import { agents, detectInstalledAgents } from '../../agents.js';
import type { AgentType } from '../../types.js';
import { AddFlowHeader } from '../ui/AddFlowHeader.js';
import { MultiSelect } from '../controls/MultiSelect.js';
import { useSpinnerFrame } from '../ui/spinner.js';
import { useNavigation } from '../context/navigation.js';

type Status = 'loading' | 'ready';

export function AddTargetsScreen() {
  const { invocation, addSkill, updateAddSkill, navigateTo, setFlash, navAction } = useNavigation();
  const [status, setStatus] = React.useState<Status>('loading');
  const [availableAgents, setAvailableAgents] = React.useState<AgentType[]>([]);
  const [showLoading, setShowLoading] = React.useState(false);
  const spinner = useSpinnerFrame(status === 'loading');

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setStatus('loading');
      const installed = await detectInstalledAgents();
      if (cancelled) return;
      const list = installed.length > 0 ? installed : (Object.keys(agents) as AgentType[]);
      setAvailableAgents(list);
      setStatus('ready');

      if (navAction !== 'pop' && addSkill.targetAgents && addSkill.targetAgents.length > 0) {
        navigateTo('add-scope');
        return;
      }

      const options = invocation.options;
      if (options.agent && options.agent.length > 0) {
        const validAgents = Object.keys(agents) as AgentType[];
        const invalid = options.agent.filter((a) => !validAgents.includes(a as AgentType));
        if (invalid.length > 0) {
          setFlash(`Invalid agents: ${invalid.join(', ')}`);
          return;
        }
        updateAddSkill({ targetAgents: options.agent as AgentType[] });
        navigateTo('add-scope');
        return;
      }

      if (options.all) {
        updateAddSkill({ targetAgents: Object.keys(agents) as AgentType[] });
        navigateTo('add-scope');
        return;
      }

      if (options.yes) {
        updateAddSkill({ targetAgents: list });
        navigateTo('add-scope');
        return;
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [invocation.options, updateAddSkill, navigateTo, addSkill.targetAgents, setFlash, navAction]);

  React.useEffect(() => {
    if (status !== 'loading') {
      setShowLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowLoading(true);
    }, 150);
    return () => clearTimeout(timer);
  }, [status]);

  if (status === 'loading' && !showLoading) {
    return <Box padding={1} />;
  }

  if (status === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        <AddFlowHeader title="Detecting agents" />
        <Text>{spinner} Checking installed agents...</Text>
      </Box>
    );
  }

  const items = availableAgents.map((agent) => ({
    value: agent,
    label: agents[agent].displayName,
    hint: agents[agent].skillsDir,
  }));

  return (
    <Box flexDirection="column" padding={1}>
      <AddFlowHeader title="Select agents" />
      <MultiSelect
        items={items}
        initialSelected={addSkill.targetAgents ?? availableAgents}
        onSubmit={(values) => {
          if (values.length === 0) {
            setFlash('Select at least one agent.');
            return;
          }
          updateAddSkill({
            targetAgents: values,
            installGlobally: undefined,
            installMode: undefined,
            planLines: undefined,
          });
          navigateTo('add-scope');
        }}
      />
    </Box>
  );
}
