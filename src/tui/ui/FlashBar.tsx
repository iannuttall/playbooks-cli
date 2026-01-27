import { Box, Text } from 'ink';
import React from 'react';
import { useNavigation } from '../context/navigation.js';

function classify(msg: string): 'success' | 'error' | 'warning' | 'info' {
  const m = msg.toLowerCase();
  if (/(error|failed|unable|denied|invalid|cannot|not found)/i.test(msg)) return 'error';
  if (/(deleted|linked|unlinked|updated|created|saved|enabled|disabled|added|removed|✓)/i.test(msg))
    return 'success';
  if (/(warn|deprecated|missing|retry|timeout)/i.test(msg)) return 'warning';
  return 'info';
}

export function FlashBar({ align = 'left' }: { align?: 'left' | 'center' }) {
  const { flashes } = useNavigation();
  if (flashes.length === 0) return <Box height={1} />;

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      paddingY={0}
      gap={0}
      justifyContent={align === 'center' ? 'center' : 'flex-start'}
    >
      {flashes.map((flash) => {
        const kind = classify(flash.text);
        const color =
          kind === 'success'
            ? 'green'
            : kind === 'error'
              ? 'red'
              : kind === 'warning'
                ? 'yellow'
                : 'cyan';
        const label =
          kind === 'success' ? '✓' : kind === 'error' ? 'x' : kind === 'warning' ? '!' : 'i';
        return (
          <Text key={flash.id} color={color}>
            [{label}] {flash.text}
          </Text>
        );
      })}
    </Box>
  );
}
