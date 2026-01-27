import React from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useNavigation } from '../context/navigation.js';
import { Header } from '../ui/Header.js';

export function AddSourceScreen() {
  const { invocation, addSkill, updateAddSkill, navigateTo, setFlash, lastSource, setLastSource } =
    useNavigation();
  const [value, setValue] = React.useState(
    addSkill.source ?? invocation.source ?? lastSource ?? ''
  );
  const didAutofillRef = React.useRef(false);

  React.useEffect(() => {
    const preset = addSkill.source ?? invocation.source;
    if (!preset || didAutofillRef.current) return;
    didAutofillRef.current = true;
    updateAddSkill({ source: preset });
    navigateTo('add-skill-select');
  }, [addSkill.source, invocation.source, updateAddSkill, navigateTo]);

  useInput((input, key) => {
    if (key.ctrl && input === 'd') {
      setValue('');
    }
  });

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
        <TextInput value={value} onChange={setValue} onSubmit={onSubmit} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press ← to go back, Ctrl+D to clear, q/esc to quit</Text>
      </Box>
    </Box>
  );
}
