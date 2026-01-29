import { Box, Text } from 'ink';
import React from 'react';
import { useNavigation } from '../context/navigation.js';
import { MultiSelect } from '../controls/MultiSelect.js';
import { AddFlowHeader } from '../ui/AddFlowHeader.js';
import { BACK_QUIT_HINT } from '../ui/hints.js';

export function MarketplacePluginScreen() {
  const { invocation, addSkill, updateAddSkill, navigateTo, setFlash } = useNavigation();
  const plugins = addSkill.marketplace?.plugins ?? [];
  const options = invocation.options;

  React.useEffect(() => {
    if (plugins.length === 0) {
      return;
    }

    if (options.yes) {
      updateAddSkill({
        marketplace: {
          ...addSkill.marketplace,
          selectedPlugins: plugins,
        },
      });
      navigateTo('add-marketplace-skills');
    }
  }, [plugins, options.yes, updateAddSkill, navigateTo, addSkill.marketplace]);

  if (plugins.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <AddFlowHeader title="Marketplace plugins" />
        <Text dimColor>No plugins found.</Text>
        <Text dimColor>{BACK_QUIT_HINT}</Text>
      </Box>
    );
  }

  if (options.list) {
    return (
      <Box flexDirection="column" padding={1}>
        <AddFlowHeader title={`Marketplace plugins (${plugins.length})`} />
        {plugins.map((plugin) => (
          <Box key={plugin.name} flexDirection="column" marginBottom={1}>
            <Text>{plugin.name}</Text>
            {plugin.description ? <Text dimColor>{plugin.description}</Text> : null}
          </Box>
        ))}
        <Text dimColor>{BACK_QUIT_HINT}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <AddFlowHeader title="Select plugins" />
      <MultiSelect
        items={plugins.map((plugin) => ({
          value: plugin,
          label: plugin.name,
          hint:
            plugin.description && plugin.description.length > 60
              ? `${plugin.description.slice(0, 57)}...`
              : plugin.description,
        }))}
        onSubmit={(values) => {
          if (values.length === 0) {
            setFlash('Select at least one plugin.');
            return;
          }
          updateAddSkill({
            marketplace: {
              ...addSkill.marketplace,
              selectedPlugins: values,
            },
          });
          navigateTo('add-marketplace-skills');
        }}
      />
    </Box>
  );
}
