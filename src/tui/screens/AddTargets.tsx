import { Box, Text } from 'ink';
import React from 'react';
import { agents, detectInstalledAgents } from '../../agents.js';
import { getLastSelectedAgents, saveSelectedAgents } from '../../skill-lock.js';
import type { AgentType } from '../../types.js';
import { useNavigation } from '../context/navigation.js';
import { MultiSelect } from '../controls/MultiSelect.js';
import { SingleSelect } from '../controls/SingleSelect.js';
import { AddFlowHeader } from '../ui/AddFlowHeader.js';
import { useSpinnerFrame } from '../ui/spinner.js';

type Status = 'loading' | 'ready';
type Mode = 'choice' | 'select';

export function AddTargetsScreen() {
  const { invocation, addSkill, updateAddSkill, navigateTo, setFlash, navAction } = useNavigation();
  const [status, setStatus] = React.useState<Status>('loading');
  const [mode, setMode] = React.useState<Mode>('choice');
  const [availableAgents, setAvailableAgents] = React.useState<AgentType[]>([]);
  const [lastSelected, setLastSelected] = React.useState<AgentType[]>([]);
  const [showLoading, setShowLoading] = React.useState(false);
  const spinner = useSpinnerFrame(status === 'loading');

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setStatus('loading');
      const [installed, lastAgents] = await Promise.all([
        detectInstalledAgents(),
        getLastSelectedAgents({ global: true }).catch(() => undefined),
      ]);
      if (cancelled) return;
      const list = installed.length > 0 ? installed : (Object.keys(agents) as AgentType[]);
      setAvailableAgents(list);

      // Filter last selected to only include currently available agents
      if (lastAgents && lastAgents.length > 0) {
        const validLast = lastAgents.filter((a) => list.includes(a as AgentType)) as AgentType[];
        setLastSelected(validLast);
      }

      setStatus('ready');
      setMode('choice');

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
  }));

  return (
    <Box flexDirection="column" padding={1}>
      {mode === 'choice' ? (
        <>
          <AddFlowHeader title="Install to" />
          <SingleSelect
            items={[
              {
                label: 'All detected agents (Recommended)',
                value: 'all',
                hint: `Install to all ${availableAgents.length} detected agents`,
              },
              {
                label: 'Select specific agents',
                value: 'select',
                hint: 'Choose a subset of detected agents',
              },
            ]}
            initialValue="all"
            onSubmit={async (value) => {
              if (value === 'all') {
                // Save selection for next time
                saveSelectedAgents(availableAgents, { global: true }).catch(() => {});
                updateAddSkill({
                  targetAgents: availableAgents,
                  installGlobally: undefined,
                  installMode: undefined,
                  planLines: undefined,
                });
                navigateTo('add-scope');
                return;
              }

              setMode('select');
            }}
          />
        </>
      ) : (
        <>
          <AddFlowHeader title="Select agents" />
          <MultiSelect
            items={items}
            initialSelected={
              addSkill.targetAgents ?? (lastSelected.length > 0 ? lastSelected : availableAgents)
            }
            enableFilter={true}
            onSubmit={(values) => {
              if (values.length === 0) {
                setFlash('Select at least one agent.');
                return;
              }
              // Save selection for next time
              saveSelectedAgents(values, { global: true }).catch(() => {});
              updateAddSkill({
                targetAgents: values,
                installGlobally: undefined,
                installMode: undefined,
                planLines: undefined,
              });
              navigateTo('add-scope');
            }}
          />
        </>
      )}
    </Box>
  );
}
