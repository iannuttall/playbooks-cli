import { Box, Text, useInput } from 'ink';
import React from 'react';
import { shortenPath } from '../../cli-utils.js';
import { installDocs } from '../../docs/install.js';
import { getDocsBase } from '../../docs/paths.js';
import { type RefOption, type RepoRefs, buildRefOptions, fetchRepoRefs } from '../../docs/refs.js';
import { getDocSources } from '../../docs/sources.js';
import type { DocInstallResult, DocSource } from '../../docs/types.js';
import { useNavigation } from '../context/navigation.js';
import { MultiSelect } from '../controls/MultiSelect.js';
import { SelectMenu } from '../controls/SelectMenu.js';
import { SingleSelect } from '../controls/SingleSelect.js';
import { Header } from '../ui/Header.js';
import { BACK_QUIT_HINT } from '../ui/hints.js';
import { useSpinnerFrame } from '../ui/spinner.js';

const DOCS_HINT = 'Space to toggle, Enter to install, m for main, q/esc to quit';
const REF_HINT = 'Enter to select, Ctrl+P to toggle prerelease, m for main, q/esc to quit';

type Status = 'select' | 'choose-ref' | 'installing' | 'done' | 'empty';

export function AddDocsScreen() {
  const { navigateTo, setFlash, setBackHandler } = useNavigation();
  const sources = React.useMemo(() => getDocSources(), []);
  const [status, setStatus] = React.useState<Status>(sources.length === 0 ? 'empty' : 'select');
  const [selected, setSelected] = React.useState<DocSource[]>([]);
  const [results, setResults] = React.useState<DocInstallResult[] | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [pendingSources, setPendingSources] = React.useState<DocSource[]>([]);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [repoRefs, setRepoRefs] = React.useState<RepoRefs | null>(null);
  const [refStatus, setRefStatus] = React.useState<'idle' | 'loading' | 'ready'>('idle');
  const [refError, setRefError] = React.useState<string | null>(null);
  const [refSelections, setRefSelections] = React.useState<Map<string, RefOption>>(new Map());
  const [includePrerelease, setIncludePrerelease] = React.useState(false);
  const spinner = useSpinnerFrame(status === 'installing' || refStatus === 'loading');

  useInput((input, key) => {
    if (status !== 'choose-ref') return;
    if (key.ctrl && (input === 'p' || input === 'P')) {
      setIncludePrerelease((prev) => !prev);
    }
  });

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (status !== 'installing' || selected.length === 0) return;
      try {
        const output = await installDocs(selected);
        if (cancelled) return;
        setResults(output);
        setStatus('done');
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to install docs.';
        setFlash(message);
        setStatus('select');
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [status, selected, setFlash]);

  React.useEffect(() => {
    if (status !== 'choose-ref') {
      setBackHandler(null);
      return;
    }
    setBackHandler(() => {
      setStatus('select');
      setPendingSources([]);
      setCurrentIndex(0);
      setRefSelections(new Map());
      setRepoRefs(null);
      return true;
    });
    return () => {
      setBackHandler(null);
    };
  }, [status, setBackHandler]);

  React.useEffect(() => {
    let cancelled = false;
    const loadRefs = async () => {
      if (status !== 'choose-ref') return;
      const source = pendingSources[currentIndex];
      if (!source) return;

      setRefStatus('loading');
      setRefError(null);
      setRepoRefs(null);

      try {
        const refs = await fetchRepoRefs(source);
        if (cancelled) return;
        if (!refs) {
          setRefError('Unable to load refs. Using default branch.');
          setRepoRefs({ defaultBranch: 'main', branches: ['main', 'master'], tags: [] });
          setRefStatus('ready');
          return;
        }
        setRepoRefs(refs);
        setRefStatus('ready');
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to load refs.';
        setRefError(message);
        setRepoRefs({ defaultBranch: 'main', branches: ['main', 'master'], tags: [] });
        setRefStatus('ready');
      }
    };

    loadRefs();

    return () => {
      cancelled = true;
    };
  }, [status, pendingSources, currentIndex]);

  if (status === 'empty') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Add docs" />
        <Text dimColor>No curated docs configured yet.</Text>
        <Box marginTop={1}>
          <Text dimColor>{BACK_QUIT_HINT}</Text>
        </Box>
      </Box>
    );
  }

  if (status === 'choose-ref') {
    const source = pendingSources[currentIndex];
    if (!source) {
      return (
        <Box flexDirection="column" padding={1}>
          <Header title="Select branch or tag" />
          <Text dimColor>No docs selected.</Text>
        </Box>
      );
    }

    const built = repoRefs
      ? buildRefOptions(repoRefs, includePrerelease)
      : { options: [], note: '' };
    const prereleaseNote = includePrerelease
      ? 'Showing prerelease refs.'
      : 'Stable only (Ctrl+P for prerelease).';

    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Select branch or tag" />
        <Box marginBottom={1} flexDirection="column">
          <Text>{source.name}</Text>
          <Text dimColor>{source.docs ? `docs: ${source.docs}` : 'full repo'}</Text>
          <Text dimColor>Tags are pinned; update docs will skip them.</Text>
          <Text dimColor>{`Repo ${currentIndex + 1}/${pendingSources.length}`}</Text>
        </Box>
        {refError ? (
          <Box marginBottom={1}>
            <Text color="red">{refError}</Text>
          </Box>
        ) : null}
        {refStatus === 'loading' ? (
          <Text>{spinner} Loading refs...</Text>
        ) : (
          <SingleSelect
            items={built.options.map((option) => ({
              value: option,
              label: option.label,
            }))}
            onSubmit={(value) => {
              const sourceKey = source.url;
              const nextSelections = new Map(refSelections);
              nextSelections.set(sourceKey, value);
              setRefSelections(nextSelections);

              const nextIndex = currentIndex + 1;
              if (nextIndex >= pendingSources.length) {
                const resolved = pendingSources.map((entry) => {
                  const selection = nextSelections.get(entry.url);
                  return selection ? { ...entry, ref: selection.ref } : entry;
                });
                setSelected(resolved);
                setStatus('installing');
                return;
              }
              setCurrentIndex(nextIndex);
            }}
            limit={10}
            hint={REF_HINT}
            enableFilter
            hintMode="active"
          />
        )}
        <Box marginTop={1}>
          <Text dimColor>{prereleaseNote}</Text>
          {built.note ? <Text dimColor>{built.note}</Text> : null}
        </Box>
      </Box>
    );
  }

  if (status === 'installing') {
    const docsBase = shortenPath(getDocsBase(), process.cwd());
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Installing docs" />
        <Text>
          {spinner} Cloning {selected.length} repo{selected.length !== 1 ? 's' : ''} into {docsBase}
        </Text>
      </Box>
    );
  }

  if (status === 'done' && results) {
    const installed = results.filter((r) => r.status === 'installed');
    const skipped = results.filter((r) => r.status === 'skipped');
    const failed = results.filter((r) => r.status === 'failed');
    const cwd = process.cwd();

    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Docs installed" />
        {installed.length > 0 ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text>{`Installed ${installed.length} repo${installed.length !== 1 ? 's' : ''}`}</Text>
            {installed.map((item) => (
              <Text key={`installed-${item.slug}`} dimColor>
                {item.source.name}
                {' -> '}
                {shortenPath(item.path, cwd)}
              </Text>
            ))}
          </Box>
        ) : null}
        {skipped.length > 0 ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text dimColor>Skipped</Text>
            {skipped.map((item) => (
              <Text key={`skipped-${item.slug}`} dimColor>
                {item.source.name}
                {item.message ? ` (${item.message})` : ''}
              </Text>
            ))}
          </Box>
        ) : null}
        {failed.length > 0 ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text color="red">Failed</Text>
            {failed.map((item) => (
              <Text key={`failed-${item.slug}`} color="red">
                {item.source.name}
                {item.message ? ` (${item.message})` : ''}
              </Text>
            ))}
          </Box>
        ) : null}
        <SelectMenu
          items={[
            { label: 'Add more docs', value: 'add' },
            { label: 'Main menu', value: 'main' },
          ]}
          showDivider={false}
          onSelect={(item) => {
            if (item.value === 'add') {
              setResults(null);
              setSelected([]);
              setPendingSources([]);
              setCurrentIndex(0);
              setRefSelections(new Map());
              setRepoRefs(null);
              setStatus('select');
            } else {
              navigateTo('main');
            }
          }}
        />
      </Box>
    );
  }

  const items = sources.map((source) => {
    const docsHint = source.docs ? `docs: ${source.docs}` : 'full repo';
    return {
      value: source,
      label: source.name,
      hint: docsHint,
      info: source.url,
      disabled: false,
    };
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Select docs" />
      <MultiSelect
        items={items}
        enableFilter
        limit={6}
        hintMode="active"
        hint={DOCS_HINT}
        onSelectionChange={(values) => {
          if (values.length > 0) {
            setNotice(null);
          }
        }}
        onSubmit={(values) => {
          if (values.length === 0) {
            const message = 'Select at least one doc.';
            setNotice(message);
            return;
          }
          setNotice(null);
          setPendingSources(values);
          setCurrentIndex(0);
          setRefSelections(new Map());
          setRepoRefs(null);
          setIncludePrerelease(false);
          setStatus('choose-ref');
        }}
      />
      {notice ? (
        <Box marginTop={1}>
          <Text color="cyan">[i] {notice}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
