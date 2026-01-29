import chalk from 'chalk';
import { Box, Text, useInput } from 'ink';
import React from 'react';
import {
  type UpdateStatus,
  type UpdateTarget,
  annotateUpdateTargets,
  collectUpdateTargets,
  updateSkills,
} from '../../flows/update-skills.js';
import type { SkillScope } from '../../installed-skills.js';
import { useNavigation } from '../context/navigation.js';
import { MultiSelect } from '../controls/MultiSelect.js';
import { Header } from '../ui/Header.js';
import {
  BACK_QUIT_HINT,
  UPDATE_EMPTY_HINT,
  UPDATE_HINT_ALL,
  UPDATE_HINT_NEEDS_ONLY,
} from '../ui/hints.js';
import { useSpinnerFrame } from '../ui/spinner.js';

type Status = 'loading' | 'select' | 'running' | 'done' | 'empty';

export function UpdateScreen() {
  const { invocation, navigateTo, setFlash } = useNavigation();
  const [status, setStatus] = React.useState<Status>('loading');
  const [targets, setTargets] = React.useState<UpdateTarget[]>([]);
  const [selected, setSelected] = React.useState<UpdateTarget[]>([]);
  const [summary, setSummary] = React.useState<{
    updated: UpdateTarget[];
    skipped: UpdateTarget[];
    failed: UpdateTarget[];
  } | null>(null);
  const [showOnlyNeeds, setShowOnlyNeeds] = React.useState(false);
  const [rateLimited, setRateLimited] = React.useState(false);
  const spinner = useSpinnerFrame(status === 'running');

  useInput((input) => {
    if (status !== 'select') return;
    if (input === 'u' || input === 'U') {
      setShowOnlyNeeds((prev) => !prev);
    }
  });

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const scopes = resolveScopes(invocation.options);
      const collected = await collectUpdateTargets(scopes);
      if (cancelled) return;
      if (collected.length === 0) {
        setStatus('empty');
        return;
      }
      const annotated = await annotateUpdateTargets(collected);
      if (cancelled) return;
      setRateLimited(annotated.rateLimited);
      const sorted = annotated.targets.slice().sort(sortTargets);
      setTargets(sorted);

      if (invocation.updateSkillNames && invocation.updateSkillNames.length > 0) {
        const desired = new Set(invocation.updateSkillNames);
        const filtered = sorted.filter((t) => desired.has(t.name));
        if (filtered.length === 0) {
          setFlash('No matching skills found to update.');
          setStatus('select');
          return;
        }
        setSelected(filtered);
        setStatus('running');
        return;
      }

      if (invocation.options.yes) {
        const needsUpdate = sorted.filter((t) => t.status === 'needs-update');
        setSelected(needsUpdate.length > 0 ? needsUpdate : sorted);
        setStatus('running');
        return;
      }

      const defaults = sorted.filter((t) => t.status === 'needs-update');
      setSelected(defaults);
      setStatus('select');
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [invocation, setFlash]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (status !== 'running' || selected.length === 0) return;
      const result = await updateSkills(selected);
      if (cancelled) return;
      setSummary(result);
      setStatus('done');
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [status, selected]);

  if (status === 'empty') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Update skills" />
        <Text dimColor>No tracked skills to update yet.</Text>
        <Text dimColor>Re-install a skill once to enable updates.</Text>
      </Box>
    );
  }

  if (status === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Update skills" />
        <Text dimColor>Loading tracked skills...</Text>
      </Box>
    );
  }

  if (status === 'select') {
    const visibleTargets = showOnlyNeeds
      ? targets.filter((t) => t.status === 'needs-update')
      : targets;
    const defaults = selected;
    const hint = showOnlyNeeds ? UPDATE_HINT_NEEDS_ONLY : UPDATE_HINT_ALL;

    if (showOnlyNeeds && visibleTargets.length === 0) {
      return (
        <Box flexDirection="column" padding={1}>
          <Header title="Select skills to update" />
          <Text dimColor>No updates found.</Text>
          {rateLimited ? (
            <Text dimColor>GitHub rate limit hit. Some skills may be marked unknown.</Text>
          ) : null}
          <Box marginTop={1}>
            <Text dimColor>{UPDATE_EMPTY_HINT}</Text>
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Select skills to update" />
        {rateLimited ? (
          <Text dimColor>GitHub rate limit hit. Some skills marked unknown.</Text>
        ) : null}
        <MultiSelect
          items={visibleTargets.map((target) => ({
            value: target,
            label: formatTargetLabel(target),
            hint: `${target.entry.source} • ${formatStatus(target.status)}`,
          }))}
          initialSelected={defaults}
          hint={hint}
          onSubmit={(values) => {
            if (values.length === 0) {
              setFlash('Select at least one skill.');
              return;
            }
            setSelected(values);
            setStatus('running');
          }}
        />
      </Box>
    );
  }

  if (status === 'running') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Updating skills" />
        <Text>
          {spinner} Updating {selected.length} skill{selected.length !== 1 ? 's' : ''}...
        </Text>
      </Box>
    );
  }

  if (!summary) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Update skills" />
        <Text dimColor>Nothing to update.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Update results" />
      {summary.updated.length > 0 ? (
        <Text>{`Updated ${summary.updated.length} skill${summary.updated.length !== 1 ? 's' : ''}`}</Text>
      ) : null}
      {summary.skipped.length > 0 ? (
        <Text dimColor>{`Skipped: ${summary.skipped.map(formatTargetLabel).join(', ')}`}</Text>
      ) : null}
      {summary.failed.length > 0 ? (
        <Text color="red">{`Failed: ${summary.failed.map(formatTargetLabel).join(', ')}`}</Text>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>{BACK_QUIT_HINT}</Text>
      </Box>
    </Box>
  );
}

function resolveScopes(options: { global?: boolean; project?: boolean }): SkillScope[] {
  if (options.global && !options.project) return ['global'];
  if (options.project && !options.global) return ['project'];
  return ['project', 'global'];
}

function formatTargetLabel(target: UpdateTarget): string {
  const status = formatStatus(target.status);
  return `${target.name} ${chalk.dim(`(${target.scope})`)} ${chalk.dim(status)}`;
}

function formatStatus(status?: UpdateStatus): string {
  if (status === 'needs-update') return 'needs update';
  if (status === 'up-to-date') return 'up to date';
  return 'unknown';
}

function sortTargets(a: UpdateTarget, b: UpdateTarget): number {
  const order = (status?: UpdateStatus) => {
    if (status === 'needs-update') return 0;
    if (status === 'unknown') return 1;
    return 2;
  };
  const diff = order(a.status) - order(b.status);
  if (diff !== 0) return diff;
  return a.name.localeCompare(b.name);
}
