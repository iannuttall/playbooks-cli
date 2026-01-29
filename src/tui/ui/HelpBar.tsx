import { Box, Text } from 'ink';
import React from 'react';
import { MENU_HINT } from './hints.js';

export function HelpBar({ text = MENU_HINT }: { text?: string }) {
  return (
    <Box marginTop={1}>
      <Text dimColor>{text}</Text>
    </Box>
  );
}
