import { Box, Text } from 'ink';
import React from 'react';
import { shortenPath } from '../../cli-utils.js';
import type { DocUpdateSummary } from '../../docs/types.js';
import { updateDocs } from '../../docs/update.js';
import { Header } from '../ui/Header.js';
import { BACK_QUIT_HINT } from '../ui/hints.js';
import { useSpinnerFrame } from '../ui/spinner.js';

type Status = 'running' | 'done' | 'empty';

export function UpdateDocsScreen() {
  const [status, setStatus] = React.useState<Status>('running');
  const [summary, setSummary] = React.useState<DocUpdateSummary | null>(null);
  const spinner = useSpinnerFrame(status === 'running');

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const output = await updateDocs();
      if (cancelled) return;
      if (output.total === 0) {
        setStatus('empty');
        return;
      }
      setSummary(output);
      setStatus('done');
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'running') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Updating docs" />
        <Text>{spinner} Pulling latest docs...</Text>
      </Box>
    );
  }

  if (status === 'empty') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Update docs" />
        <Text dimColor>No docs installed yet.</Text>
        <Box marginTop={1}>
          <Text dimColor>{BACK_QUIT_HINT}</Text>
        </Box>
      </Box>
    );
  }

  if (!summary) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Update docs" />
        <Text dimColor>Nothing to update.</Text>
      </Box>
    );
  }

  const cwd = process.cwd();

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Docs update results" />
      {summary.updated.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text>{`Updated ${summary.updated.length} repo${summary.updated.length !== 1 ? 's' : ''}`}</Text>
          {summary.updated.map((item) => (
            <Text key={`updated-${item.name}`} dimColor>
              {item.name} → {shortenPath(item.path, cwd)}
            </Text>
          ))}
        </Box>
      ) : null}
      {summary.skipped.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Skipped</Text>
          {summary.skipped.map((item) => (
            <Text key={`skipped-${item.name}`} dimColor>
              {item.name}
              {item.message ? ` (${item.message})` : ''}
            </Text>
          ))}
        </Box>
      ) : null}
      {summary.failed.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="red">Failed</Text>
          {summary.failed.map((item) => (
            <Text key={`failed-${item.name}`} color="red">
              {item.name}
              {item.message ? ` (${item.message})` : ''}
            </Text>
          ))}
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>{BACK_QUIT_HINT}</Text>
      </Box>
    </Box>
  );
}
