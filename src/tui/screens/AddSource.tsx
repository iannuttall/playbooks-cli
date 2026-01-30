import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import React from 'react';
import { useNavigation } from '../context/navigation.js';
import { useTextInput } from '../hooks/useTextInput.js';
import { Header } from '../ui/Header.js';
import { TEXT_INPUT_HINT } from '../ui/hints.js';

export function AddSourceScreen() {
  const { invocation, addSkill, updateAddSkill, navigateTo, setFlash, lastSource, setLastSource } =
    useNavigation();
  const [value, setValue] = React.useState(
    addSkill.source ?? invocation.source ?? lastSource ?? ''
  );
  const didAutofillRef = React.useRef(false);
  const { wrapOnChange } = useTextInput({
    onClear: () => {
      setValue('');
    },
  });

  React.useEffect(() => {
    const preset = invocation.source;
    if (!preset || didAutofillRef.current) return;
    didAutofillRef.current = true;
    updateAddSkill({ source: preset });
    navigateTo('add-skill-select');
  }, [invocation.source, updateAddSkill, navigateTo]);

  const onSubmit = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) {
      setFlash('Enter a repository, URL, or local path.');
      return;
    }
    setLastSource(trimmed);
    updateAddSkill({ source: trimmed });
    navigateTo('add-skill-select');
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Add skills" />
      <Box marginBottom={1}>
        <Text>Where should we fetch skills from?</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Examples: owner/repo, https://.../SKILL.md, ./local/path</Text>
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
