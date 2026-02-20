import { Box, Text } from 'ink';
import React from 'react';
import { prepareSkillsFromSearchResults } from '../../flows/find-skill.js';
import { useNavigation } from '../context/navigation.js';
import { MultiSelect } from '../controls/MultiSelect.js';
import type { FindSkillResult } from '../types.js';
import { Header } from '../ui/Header.js';
import { BACK_QUIT_HINT, FIND_RESULTS_HINT, FIND_SKILLS_HINT } from '../ui/hints.js';
import { useSpinnerFrame } from '../ui/spinner.js';

const formatStars = (value: number | null) => {
  if (!value || value <= 0) return '';
  if (value >= 1000) {
    const rounded = value >= 10000 ? Math.round(value / 1000) : Math.round(value / 100) / 10;
    return `${rounded}k`;
  }
  return `${value}`;
};

const formatInstalls = (value: number | null) => {
  if (!value || value <= 0) return '';
  if (value >= 1_000_000) {
    const rounded = (value / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${rounded}M`;
  }
  if (value >= 1000) {
    const rounded = (value / 1000).toFixed(1).replace(/\.0$/, '');
    return `${rounded}k`;
  }
  return `${value}`;
};

const buildLabel = (result: FindSkillResult) => {
  const owner = result.repoOwner ?? 'unknown';
  const repo = result.repoName ?? 'repo';
  const stars = formatStars(result.stars ?? null);
  const installs = formatInstalls(result.installCount ?? null);
  const suffixParts = [] as string[];
  if (result.isOfficial) {
    suffixParts.push('official');
  }
  if (stars) {
    suffixParts.push(`stars:${stars}`);
  }
  if (installs) {
    suffixParts.push(`installs:${installs}`);
  }
  const suffix = suffixParts.length > 0 ? ` ${suffixParts.join(' | ')}` : '';
  return `${result.name} (${owner}/${repo})${suffix}`.trim();
};

const truncateLabel = (value: string, max = 100) => {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
};

export function FindSkillResultsScreen() {
  const { findSkill, updateFindSkill, resetAddSkill, updateAddSkill, navigateTo, setFlash } =
    useNavigation();
  const [status, setStatus] = React.useState<'ready' | 'loading' | 'error'>('ready');
  const [error, setError] = React.useState<string | null>(null);
  const spinner = useSpinnerFrame(status === 'loading');

  const results = findSkill.results ?? [];
  const query = findSkill.query ?? '';
  const mode = findSkill.mode ?? 'lexical';
  const modeLabel = mode === 'semantic' ? 'Semantic' : 'Fast';

  const handleSubmit = async (values: FindSkillResult[]) => {
    if (values.length === 0) {
      setFlash('Select at least one skill.');
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const prepared = await prepareSkillsFromSearchResults(values);
      resetAddSkill();
      updateAddSkill({
        source: 'playbooks.com/skills',
        parsed: undefined,
        tempDir: prepared.tempDir,
        skills: prepared.skills,
        selectedSkills: prepared.skills,
        originBySkillName: prepared.originBySkillName,
        targetAgents: undefined,
        installGlobally: undefined,
        installMode: undefined,
        planLines: undefined,
        installResults: undefined,
        installError: undefined,
      });
      updateFindSkill({ status: 'ready' });
      navigateTo('add-targets');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to prepare skills.';
      setError(message);
      setStatus('error');
    }
  };

  React.useEffect(() => {
    if (results.length === 0) {
      setStatus('ready');
    }
  }, [results.length]);

  if (status === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Preparing skills" />
        <Text>{spinner} Cloning repositories...</Text>
      </Box>
    );
  }

  if (results.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="No results" />
        <Text dimColor>No skills found.</Text>
        <Box marginTop={1}>
          <Text dimColor>{BACK_QUIT_HINT}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Select skills" />
      <Box marginBottom={1} flexDirection="column">
        <Text>{`Query: ${query}`}</Text>
        <Text dimColor>{`Mode: ${modeLabel} search`}</Text>
        <Text dimColor>{FIND_SKILLS_HINT}</Text>
      </Box>
      {status === 'error' ? (
        <Box marginBottom={1}>
          <Text color="red">{error}</Text>
        </Box>
      ) : null}
      <MultiSelect
        items={results.map((result) => ({
          value: result,
          label: truncateLabel(buildLabel(result)),
          info: result.shortDescription || result.description || undefined,
        }))}
        onSubmit={handleSubmit}
        limit={10}
        hint={FIND_RESULTS_HINT}
        enableFilter={false}
      />
    </Box>
  );
}
