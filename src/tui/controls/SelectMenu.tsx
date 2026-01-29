import { Box } from 'ink';
import SelectInput from 'ink-select-input';
import type React from 'react';
import { Divider } from '../ui/Divider.js';
import { HelpBar } from '../ui/HelpBar.js';
import { SelectItem } from '../ui/SelectItem.js';
import { MENU_HINT } from '../ui/hints.js';

export type MenuItem<Value = string | number> = { label: string; value: Value };

type SelectInputProps<T> = {
  items: T[];
  onSelect: (item: T) => void;
  itemComponent?: React.ComponentType<{ label: string; isSelected?: boolean }>;
  limit?: number;
};

const SelectInputTyped = SelectInput as unknown as <T>(
  props: SelectInputProps<T>
) => React.ReactElement;

export function SelectMenu<T extends MenuItem>({
  items,
  onSelect,
  hint = MENU_HINT,
  showDivider = false,
  itemComponent = SelectItem,
  limit,
}: {
  items: T[];
  onSelect: (item: T) => void;
  hint?: string;
  showDivider?: boolean;
  itemComponent?: React.ComponentType<{ label: string; isSelected?: boolean }>;
  limit?: number;
}) {
  return (
    <Box flexDirection="column">
      {showDivider && <Divider />}
      <SelectInputTyped
        items={items}
        onSelect={onSelect}
        itemComponent={itemComponent}
        limit={limit}
      />
      <HelpBar text={hint} />
    </Box>
  );
}
