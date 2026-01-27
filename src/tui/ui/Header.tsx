import React from 'react';
import { Box, Text } from 'ink';

export function Header({ title }: { title: string }) {
  return (
    <Box marginBottom={1}>
      <Text bold color="cyan">
        {title}
      </Text>
    </Box>
  );
}

export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Text>
      <Text bold>{label}:</Text> {children}
    </Text>
  );
}
