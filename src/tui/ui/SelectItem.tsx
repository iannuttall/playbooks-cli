import { Text } from 'ink';
import React from 'react';

export function SelectItem({ label }: { label: string; isSelected?: boolean }) {
  const l = label.toLowerCase();
  let color: 'red' | 'green' | undefined;
  if (l.startsWith('delete ')) color = 'red';
  else if (l.startsWith('yes, delete')) color = 'red';
  else if (l.includes('failed ✗') || l.includes('inactive ✗')) color = 'red';
  else if (l.includes('sent ✓') || l.includes('success ✓') || l.includes('active ✓'))
    color = 'green';
  return <Text color={color}>{label}</Text>;
}
