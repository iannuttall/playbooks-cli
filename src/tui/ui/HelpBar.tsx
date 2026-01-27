import { Box, Text } from 'ink';
import React from 'react';

export const DEFAULT_HINT = 'Use ↑↓ to navigate, Enter to select, m for main, q/esc to quit';

export function HelpBar({ text = DEFAULT_HINT }: { text?: string }) {
  return (
    <Box marginTop={1}>
      <Text dimColor>{text}</Text>
    </Box>
  );
}
