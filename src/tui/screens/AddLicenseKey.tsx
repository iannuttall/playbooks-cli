import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import React from 'react';
import { useNavigation } from '../context/navigation.js';
import { useTextInput } from '../hooks/useTextInput.js';
import { Header } from '../ui/Header.js';
import { TEXT_INPUT_HINT } from '../ui/hints.js';

export function AddLicenseKeyScreen() {
  const { invocation, addSkill, updateAddSkill, navigateTo, setFlash } = useNavigation();
  const [value, setValue] = React.useState(
    addSkill.licenseKey ?? invocation.options.licenseKey ?? ''
  );
  const { wrapOnChange } = useTextInput({
    onClear: () => {
      setValue('');
    },
  });

  const onSubmit = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) {
      setFlash('Enter a license key.');
      return;
    }
    updateAddSkill({ licenseKey: trimmed });
    navigateTo('add-skill-select');
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="License key" />
      <Box marginBottom={1}>
        <Text>Enter the license key for this paid/private skill.</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Tip: you can also pass it via --license-key.</Text>
      </Box>
      <Box>
        <Text color="green">&gt; </Text>
        <TextInput value={value} onChange={wrapOnChange(setValue)} onSubmit={onSubmit} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{TEXT_INPUT_HINT}</Text>
      </Box>
    </Box>
  );
}
