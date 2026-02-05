import { Box, Text, useInput } from 'ink';
import React from 'react';
import { useNavigation } from '../context/navigation.js';
import { SINGLE_SELECT_HINT } from '../ui/hints.js';

export type SingleSelectItem<T> = {
  value: T;
  label: string;
  hint?: string;
  info?: string;
  disabled?: boolean;
};

const FILTER_THRESHOLD = 10;

export function SingleSelect<T>({
  items,
  onSubmit,
  limit = 10,
  hint = SINGLE_SELECT_HINT,
  enableFilter,
  hintMode = 'active',
  initialValue,
}: {
  items: SingleSelectItem<T>[];
  onSubmit: (value: T) => void;
  limit?: number;
  hint?: string;
  /** Enable filter input. Defaults to true when 10+ items, false otherwise. */
  enableFilter?: boolean;
  /** Control per-item hint display. */
  hintMode?: 'all' | 'active' | 'none';
  /** Optional initial selection value. */
  initialValue?: T;
}) {
  const [cursor, setCursor] = React.useState(() => {
    if (initialValue === undefined) return 0;
    const index = items.findIndex((item) => item.value === initialValue);
    return index >= 0 ? index : 0;
  });
  const [infoIndex, setInfoIndex] = React.useState<number | null>(null);
  const [filter, setFilter] = React.useState('');

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

  React.useEffect(() => {
    if (total === 0) {
      setCursor(0);
      return;
    }
    if (cursor >= total) {
      setCursor(total - 1);
    }
  }, [total, cursor]);

  useInput((input, key) => {
    if (showFilter) {
      if (key.backspace || key.delete) {
        setFilter((prev) => prev.slice(0, -1));
        resetFocus();
        return;
      }
      if (
        input &&
        input.length === 1 &&
        !key.ctrl &&
        !key.meta &&
        !key.return &&
        !key.tab &&
        input !== ' ' &&
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
        const next = Math.min(prev + 1, total - 1);
        if (infoIndex !== null) {
          setInfoIndex(null);
        }
        return next;
      });
    } else if (key.upArrow) {
      setCursor((prev) => {
        if (total === 0) return 0;
        const next = Math.max(prev - 1, 0);
        if (infoIndex !== null) {
          setInfoIndex(null);
        }
        return next;
      });
    } else if (input === 'i' || input === 'I') {
      setInfoIndex((prev) => (prev === cursor ? null : cursor));
    } else if (key.return) {
      const current = filteredItems[cursor];
      if (!current) return;
      if (current.item.disabled) return;
      onSubmit(current.item.value);
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
          const pointer = isActive ? '❯' : ' ';
          const color = item.disabled ? 'gray' : isActive ? 'cyan' : undefined;
          const showHint = hintMode === 'all' || (hintMode === 'active' && isActive);
          return (
            <Box key={`${item.label}-${originalIndex}`} flexDirection="column">
              <Text color={color}>
                {pointer} {item.label}
              </Text>
              {infoIndex === visibleIndex && item.info ? (
                <Text dimColor>
                  {'  '} {truncate(item.info)}
                </Text>
              ) : item.hint && showHint ? (
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
