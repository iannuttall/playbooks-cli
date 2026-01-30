import { Box, Text, useApp } from 'ink';
import React from 'react';
import { setUrlMarkdownOutput } from '../../flows/url-markdown-output.js';
import { fetchUrlMarkdown } from '../../playbooks-api.js';
import { useNavigation } from '../context/navigation.js';
import { Header } from '../ui/Header.js';
import { useSpinnerFrame } from '../ui/spinner.js';

export function GetUrlScreen() {
  const { exit } = useApp();
  const { invocation } = useNavigation();
  const spinner = useSpinnerFrame(true);
  const didRun = React.useRef(false);
  const outputPath = invocation.options?.output ?? null;
  const outputFormat = invocation.options?.json ? 'json' : 'markdown';

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (didRun.current) return;
      didRun.current = true;

      const url = invocation.source;
      const json = Boolean(invocation.options?.json);

      if (!url) {
        setUrlMarkdownOutput({ status: 'error', message: 'Missing URL.' });
        exit();
        return;
      }

      try {
        const data = await fetchUrlMarkdown(url);
        if (cancelled) return;
        setUrlMarkdownOutput({ status: 'success', json, data });
        exit();
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to fetch markdown.';
        setUrlMarkdownOutput({ status: 'error', message });
        exit();
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [exit, invocation]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Fetching URL" />
      {invocation.source ? <Text dimColor>{`URL: ${invocation.source}`}</Text> : null}
      {outputPath ? <Text dimColor>{`Output: ${outputPath}`}</Text> : null}
      {outputFormat === 'json' ? <Text dimColor>Format: json</Text> : null}
      <Text>{spinner} Fetching markdown...</Text>
    </Box>
  );
}
