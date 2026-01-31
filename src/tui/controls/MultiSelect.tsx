import { Box, Text, useInput } from 'ink';
import React from 'react';
import { useNavigation } from '../context/navigation.js';
import { MULTI_SELECT_HINT } from '../ui/hints.js';

export type MultiSelectItem<T> = {
  value: T;
  label: string;
  hint?: string;
  info?: string;
  disabled?: boolean;
};

const FILTER_THRESHOLD = 10;

export function MultiSelect<T>({
  items,
  initialSelected = [],
  onSubmit,
  limit = 10,
  hint = MULTI_SELECT_HINT,
  enableFilter,
}: {
  items: MultiSelectItem<T>[];
  initialSelected?: T[];
  onSubmit: (values: T[]) => void;
  limit?: number;
  hint?: string;
  /** Enable filter input. Defaults to true when 10+ items, false otherwise. */
  enableFilter?: boolean;
}) {
  const [cursor, setCursor] = React.useState(0);
  const [infoIndex, setInfoIndex] = React.useState<number | null>(null);
  const [filter, setFilter] = React.useState('');
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

  const showFilter = enableFilter ?? items.length >= FILTER_THRESHOLD;
  const { setTextInputActive, setTextInputEscMode } = useNavigation();
  const resetFocus = React.useCallback(() => {
    setCursor(0);
    setInfoIndex(null);
  }, []);

  React.useEffect(() => {
    if (!showFilter) return;
    setTextInputActive(true);
    setTextInputEscMode('back');
    return () => {
      setTextInputActive(false);
      setTextInputEscMode('back');
    };
  }, [showFilter, setTextInputActive, setTextInputEscMode]);

  // Filter items based on search query, keeping track of original indices
  const filteredItems = React.useMemo(() => {
    if (!filter) return items.map((item, index) => ({ item, originalIndex: index }));
    const lowerFilter = filter.toLowerCase();
    return items
      .map((item, index) => ({ item, originalIndex: index }))
      .filter(
        ({ item }) =>
          item.label.toLowerCase().includes(lowerFilter) ||
          String(item.value).toLowerCase().includes(lowerFilter)
      );
  }, [items, filter]);

  const total = filteredItems.length;
  const maxItems = Math.max(5, Math.min(limit, total));
  const windowStart = Math.min(
    Math.max(0, cursor - Math.floor(maxItems / 2)),
    Math.max(0, total - maxItems)
  );
  const visible = filteredItems.slice(windowStart, windowStart + maxItems);

  const truncate = (value: string, max = 100) => {
    if (value.length <= max) return value;
    return `${value.slice(0, max - 3)}...`;
  };

  useInput((input, key) => {
    // Handle filter input when filter is enabled
    if (showFilter) {
      if (key.backspace || key.delete) {
        setFilter((prev) => prev.slice(0, -1));
        resetFocus();
        return;
      }
      // Regular character input for filtering (excluding control chars)
      if (
        input &&
        input.length === 1 &&
        !key.ctrl &&
        !key.meta &&
        input !== ' ' &&
        input !== 's' &&
        input !== 'S' &&
        input !== 'i' &&
        input !== 'I'
      ) {
        setFilter((prev) => prev + input);
        resetFocus();
        return;
      }
    }

    if (key.downArrow) {
      setCursor((prev) => {
        if (total === 0) return 0;
        const next = (prev + 1) % total;
        if (infoIndex !== null) {
          setInfoIndex(null);
        }
        return next;
      });
    } else if (key.upArrow) {
      setCursor((prev) => {
        if (total === 0) return 0;
        const next = (prev - 1 + total) % total;
        if (infoIndex !== null) {
          setInfoIndex(null);
        }
        return next;
      });
    } else if (input === ' ') {
      if (total === 0) return;
      const currentFiltered = filteredItems[cursor];
      if (!currentFiltered) return;
      const originalIndex = currentFiltered.originalIndex;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(originalIndex)) next.delete(originalIndex);
        else next.add(originalIndex);
        return next;
      });
    } else if (input === 's' || input === 'S') {
      // Select/deselect all visible (filtered) items
      const selectableIndices = filteredItems
        .filter(({ item }) => !item.disabled)
        .map(({ originalIndex }) => originalIndex);
      setSelected((prev) => {
        const allSelected =
          selectableIndices.length > 0 && selectableIndices.every((index) => prev.has(index));
        if (allSelected) {
          // Deselect all filtered items
          const next = new Set(prev);
          for (const index of selectableIndices) {
            next.delete(index);
          }
          return next;
        }
        // Select all filtered items
        const next = new Set(prev);
        for (const index of selectableIndices) {
          next.add(index);
        }
        return next;
      });
    } else if (input === 'i' || input === 'I') {
      setInfoIndex((prev) => (prev === cursor ? null : cursor));
    } else if (key.return) {
      const values = Array.from(selected)
        .map((index) => items[index]?.value)
        .filter((value): value is T => value !== undefined);
      onSubmit(values);
    }
  });

  const filterHint = showFilter ? 'Type to filter, ' : '';
  const displayHint = filterHint + hint;

  return (
    <Box flexDirection="column">
      {showFilter && (
        <Box marginBottom={1}>
          <Text dimColor>Filter: </Text>
          <Text>{filter || ' '}</Text>
          <Text dimColor inverse>
            {' '}
          </Text>
          {filter && (
            <Text dimColor>
              {' '}
              ({filteredItems.length}/{items.length})
            </Text>
          )}
        </Box>
      )}
      {total === 0 ? (
        <Text dimColor>No matches found</Text>
      ) : (
        visible.map(({ item, originalIndex }, index) => {
          const visibleIndex = windowStart + index;
          const isActive = visibleIndex === cursor;
          const isSelected = selected.has(originalIndex);
          const marker = isSelected ? '◼' : '◻';
          const pointer = isActive ? '❯' : ' ';
          const color = item.disabled ? 'gray' : isActive ? 'cyan' : undefined;
          return (
            <Box key={`${item.label}-${originalIndex}`} flexDirection="column">
              <Text color={color}>
                {pointer} {marker} {item.label}
              </Text>
              {infoIndex === visibleIndex && item.info ? (
                <Text dimColor>
                  {'  '} {truncate(item.info)}
                </Text>
              ) : item.hint ? (
                <Text dimColor>
                  {'  '} {item.hint}
                </Text>
              ) : null}
            </Box>
          );
        })
      )}
      <Box marginTop={1}>
        <Text dimColor>{displayHint}</Text>
      </Box>
    </Box>
  );
}
