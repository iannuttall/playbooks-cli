import React from 'react';
import { Box, Text, useInput } from 'ink';

export type MultiSelectItem<T> = {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
};

export function MultiSelect<T>({
  items,
  initialSelected = [],
  onSubmit,
  limit = 10,
  hint = 'Space to toggle, s to select all, Enter to continue, m for main, q/esc to quit',
}: {
  items: MultiSelectItem<T>[];
  initialSelected?: T[];
  onSubmit: (values: T[]) => void;
  limit?: number;
  hint?: string;
}) {
  const [cursor, setCursor] = React.useState(0);
  const [selected, setSelected] = React.useState<Set<number>>(
    new Set(
      initialSelected.length > 0
        ? items
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => initialSelected.includes(item.value))
            .map(({ index }) => index)
        : []
    )
  );

  const total = items.length;
  const maxItems = Math.max(5, Math.min(limit, total));
  const windowStart = Math.min(
    Math.max(0, cursor - Math.floor(maxItems / 2)),
    Math.max(0, total - maxItems)
  );
  const visible = items.slice(windowStart, windowStart + maxItems);

  useInput((input, key) => {
    if (key.downArrow) {
      setCursor((prev) => (prev + 1) % total);
    } else if (key.upArrow) {
      setCursor((prev) => (prev - 1 + total) % total);
    } else if (input === ' ') {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(cursor)) next.delete(cursor);
        else next.add(cursor);
        return next;
      });
    } else if (input === 's' || input === 'S') {
      setSelected((prev) => {
        const selectable = items
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => !item.disabled)
          .map(({ index }) => index);
        const allSelected = selectable.length > 0 && selectable.every((index) => prev.has(index));
        if (allSelected) {
          return new Set();
        }
        return new Set(selectable);
      });
    } else if (key.return) {
      const values = Array.from(selected).map((index) => items[index]!.value);
      onSubmit(values);
    }
  });

  return (
    <Box flexDirection="column">
      {visible.map((item, index) => {
        const actualIndex = windowStart + index;
        const isActive = actualIndex === cursor;
        const isSelected = selected.has(actualIndex);
        const marker = isSelected ? '◼' : '◻';
        const pointer = isActive ? '❯' : ' ';
        const color = item.disabled ? 'gray' : isActive ? 'cyan' : undefined;
        return (
          <Box key={`${item.label}-${actualIndex}`} flexDirection="column">
            <Text color={color}>
              {pointer} {marker} {item.label}
            </Text>
            {item.hint ? (
              <Text dimColor>
                {'  '} {item.hint}
              </Text>
            ) : null}
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>{hint}</Text>
      </Box>
    </Box>
  );
}
