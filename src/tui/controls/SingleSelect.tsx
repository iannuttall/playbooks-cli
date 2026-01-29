import { Box, Text, useInput } from 'ink';
import React from 'react';
import { SINGLE_SELECT_HINT } from '../ui/hints.js';

export type SingleSelectItem<T> = {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
};

export function SingleSelect<T>({
  items,
  initialValue,
  onSubmit,
  hint = SINGLE_SELECT_HINT,
}: {
  items: SingleSelectItem<T>[];
  initialValue?: T;
  onSubmit: (value: T) => void;
  hint?: string;
}) {
  const initialIndex = initialValue
    ? Math.max(
        0,
        items.findIndex((item) => item.value === initialValue)
      )
    : 0;
  const [cursor, setCursor] = React.useState(initialIndex);

  useInput((input, key) => {
    if (key.downArrow) {
      setCursor((prev) => (prev + 1) % items.length);
    } else if (key.upArrow) {
      setCursor((prev) => (prev - 1 + items.length) % items.length);
    } else if (key.return) {
      const selected = items[cursor];
      if (selected && !selected.disabled) {
        onSubmit(selected.value);
      }
    }
  });

  const active = items[cursor];
  const activeHint = active?.hint ?? hint;

  return (
    <Box flexDirection="column">
      {items.map((item, index) => {
        const isActive = index === cursor;
        const pointer = isActive ? '>' : ' ';
        const color = item.disabled ? 'gray' : isActive ? 'cyan' : undefined;
        return (
          <Text key={`${item.label}-${index}`} color={color}>
            {pointer} {item.label}
          </Text>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>{activeHint}</Text>
      </Box>
    </Box>
  );
}
