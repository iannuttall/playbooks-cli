import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import React from 'react';
import { searchSkillDirectory } from '../../flows/find-skill.js';
import { useNavigation } from '../context/navigation.js';
import { useTextInput } from '../hooks/useTextInput.js';
import type { FindSkillMode } from '../types.js';
import { Header } from '../ui/Header.js';
import { FIND_SEARCH_HINT, TEXT_INPUT_HINT } from '../ui/hints.js';
import { useSpinnerFrame } from '../ui/spinner.js';

export function FindSkillSearchScreen() {
  const { findSkill, updateFindSkill, navigateTo, setFlash } = useNavigation();
  const [value, setValue] = React.useState(findSkill.query ?? '');
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const spinner = useSpinnerFrame(status === 'loading');
  const { wrapOnChange } = useTextInput({
    disabled: status === 'loading',
    onClear: () => {
      setValue('');
      updateFindSkill({ query: '' });
    },
  });

  const runSearch = React.useCallback(
    async (mode: FindSkillMode) => {
      const query = value.trim();
      if (!query) {
        setFlash('Enter a search term.');
        return;
      }

      setStatus('loading');
      setError(null);
      updateFindSkill({ query, mode, status: 'loading', error: undefined });

      try {
        const outcome = await searchSkillDirectory(query, mode, 10);
        updateFindSkill({
          query,
          mode: outcome.mode,
          results: outcome.results,
          status: 'ready',
          error: undefined,
        });
        if (outcome.fallback) {
          setFlash('AI search unavailable. Showing fast results.');
        }
        navigateTo('find-skill-results');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Search failed.';
        setError(message);
        setStatus('error');
        updateFindSkill({ status: 'error', error: message });
      }
    },
    [setFlash, updateFindSkill, value, navigateTo]
  );

  useInput((input, key) => {
    if (status === 'loading') return;
    if (key.tab) {
      runSearch('semantic');
      return;
    }
    if (input === '\t') {
      runSearch('semantic');
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Find skills" />
      <Box marginBottom={1}>
        <Text>Find a skill to give your agent new capabilities.</Text>
      </Box>
      <Box>
        <Text color="green">&gt; </Text>
        <TextInput
          value={value}
          onChange={wrapOnChange((next) => {
            const cleaned = next.replace(/\t/g, '');
            setValue(cleaned);
            updateFindSkill({ query: cleaned });
          })}
          onSubmit={() => {
            if (status !== 'loading') {
              runSearch('lexical');
            }
          }}
        />
      </Box>
      {status === 'loading' ? (
        <Box marginTop={1}>
          <Text>{spinner} Searching...</Text>
        </Box>
      ) : null}
      {status === 'error' ? (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>{FIND_SEARCH_HINT}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{TEXT_INPUT_HINT}</Text>
      </Box>
    </Box>
  );
}
