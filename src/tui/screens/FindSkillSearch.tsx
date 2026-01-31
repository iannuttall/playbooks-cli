import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import React from 'react';
import { searchSkillDirectory } from '../../flows/find-skill.js';
import { useNavigation } from '../context/navigation.js';
import { useTextInput } from '../hooks/useTextInput.js';
import type { FindSkillResult } from '../types.js';
import { Header } from '../ui/Header.js';
import { TEXT_INPUT_HINT } from '../ui/hints.js';
import { useSpinnerFrame } from '../ui/spinner.js';

const MIN_QUERY_LENGTH = 2;

/**
 * Adaptive debounce timing based on query length.
 * Shorter queries = longer wait (user still typing)
 * 2 chars: 250ms, 3 chars: 200ms, 4+ chars: 150ms
 */
function getDebounceMs(queryLength: number): number {
  return Math.max(150, 350 - queryLength * 50);
}

export function FindSkillSearchScreen() {
  const { findSkill, updateFindSkill, navigateTo, setFlash } = useNavigation();
  const [value, setValue] = React.useState(findSkill.query ?? '');
  const [status, setStatus] = React.useState<'idle' | 'searching' | 'loading' | 'error'>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<FindSkillResult[]>([]);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const spinner = useSpinnerFrame(status === 'searching' || status === 'loading');

  const { wrapOnChange } = useTextInput({
    disabled: status === 'loading',
    onClear: () => {
      setValue('');
      setPreview([]);
      setStatus('idle');
      updateFindSkill({ query: '' });
    },
  });

  // Live lexical search with adaptive debounce
  const triggerLiveSearch = React.useCallback((query: string) => {
    // Clear any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const trimmed = query.trim();

    // Reset if query too short
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setPreview([]);
      setStatus('idle');
      return;
    }

    setStatus('searching');

    const debounceMs = getDebounceMs(trimmed.length);

    debounceRef.current = setTimeout(async () => {
      try {
        const outcome = await searchSkillDirectory(trimmed, 'lexical', 5);
        setPreview(outcome.results);
        setStatus('idle');
      } catch {
        setPreview([]);
        setStatus('idle');
      }
    }, debounceMs);
  }, []);

  // Cleanup debounce on unmount
  React.useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Go to results with lexical search (Enter)
  const goToLexicalResults = React.useCallback(async () => {
    const query = value.trim();
    if (!query || query.length < MIN_QUERY_LENGTH) {
      setFlash(`Enter at least ${MIN_QUERY_LENGTH} characters.`);
      return;
    }

    // Cancel any pending live search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    setStatus('loading');
    try {
      const outcome = await searchSkillDirectory(query, 'lexical', 10);
      updateFindSkill({
        query,
        mode: 'lexical',
        results: outcome.results,
        status: 'ready',
        error: undefined,
      });
      navigateTo('find-skill-results');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed.';
      setError(message);
      setStatus('error');
    }
  }, [value, setFlash, updateFindSkill, navigateTo]);

  // Semantic search on Tab
  const runSemanticSearch = React.useCallback(async () => {
    const query = value.trim();
    if (!query) {
      setFlash('Enter a search term.');
      return;
    }

    if (query.length < MIN_QUERY_LENGTH) {
      setFlash(`Enter at least ${MIN_QUERY_LENGTH} characters.`);
      return;
    }

    // Cancel any pending live search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    setStatus('loading');
    setError(null);
    updateFindSkill({ query, mode: 'semantic', status: 'loading', error: undefined });

    try {
      const outcome = await searchSkillDirectory(query, 'semantic', 10);
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
  }, [setFlash, updateFindSkill, value, navigateTo]);

  // Handle Tab for semantic search
  useInput((input, key) => {
    if (status === 'loading') return;
    if (key.tab || input === '\t') {
      runSemanticSearch();
    }
  });

  const showPreview = preview.length > 0 && status !== 'loading';
  const showSearching = status === 'searching' && value.trim().length >= MIN_QUERY_LENGTH;

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
            triggerLiveSearch(cleaned);
          })}
          onSubmit={() => {
            if (status !== 'loading') {
              goToLexicalResults();
            }
          }}
        />
      </Box>

      {/* Live preview of lexical results */}
      {showSearching && !showPreview ? (
        <Box marginTop={1}>
          <Text dimColor>{spinner} Searching...</Text>
        </Box>
      ) : null}

      {showPreview ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>
            {preview.length} result{preview.length !== 1 ? 's' : ''} found:
          </Text>
          {preview.slice(0, 3).map((result) => (
            <Text key={result.id} dimColor>
              {'  '}• {result.name}
              {result.repoOwner ? ` (${result.repoOwner}/${result.repoName})` : ''}
            </Text>
          ))}
          {preview.length > 3 ? (
            <Text dimColor>
              {'  '}... and {preview.length - 3} more
            </Text>
          ) : null}
        </Box>
      ) : null}

      {status === 'loading' ? (
        <Box marginTop={1}>
          <Text>{spinner} Running AI search...</Text>
        </Box>
      ) : null}

      {status === 'error' ? (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor>Enter for fast results, Tab for AI search</Text>
      </Box>
      <Box>
        <Text dimColor>{TEXT_INPUT_HINT}</Text>
      </Box>
    </Box>
  );
}
