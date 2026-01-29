import { Box } from 'ink';
import React from 'react';
import { useNavigation } from '../context/navigation.js';
import { SelectMenu } from '../controls/SelectMenu.js';

export function MainMenu() {
  const { navigateTo, resetAddSkill, resetFindSkill, setInvocation } = useNavigation();
  const items = [
    { label: 'Add skill', value: 'add' },
    { label: 'Find skill', value: 'find' },
    { label: 'List skills', value: 'list' },
    { label: 'Remove skills', value: 'manage' },
    { label: 'Update skills', value: 'update' },
    { label: 'Exit', value: 'exit' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <SelectMenu
        items={items}
        onSelect={(item) => {
          switch (item.value) {
            case 'add':
              resetAddSkill();
              resetFindSkill();
              setInvocation({ intent: 'none', options: {} });
              navigateTo('add-source');
              break;
            case 'find':
              resetAddSkill();
              resetFindSkill();
              setInvocation({ intent: 'find-skill', options: {} });
              navigateTo('find-skill-search');
              break;
            case 'list':
              navigateTo('list');
              break;
            case 'manage':
              navigateTo('manage');
              break;
            case 'update':
              navigateTo('update');
              break;
            case 'exit':
              process.exit(0);
          }
        }}
        showDivider={false}
      />
    </Box>
  );
}
