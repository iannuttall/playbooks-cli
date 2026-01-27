import React from 'react';
import { Box } from 'ink';
import SelectInput from 'ink-select-input';
import { Divider } from '../ui/Divider.js';
import { HelpBar, DEFAULT_HINT } from '../ui/HelpBar.js';
import { SelectItem } from '../ui/SelectItem.js';

export type MenuItem<Value = string | number> = { label: string; value: Value };

export function SelectMenu<T extends MenuItem>({
  items,
  onSelect,
  hint = DEFAULT_HINT,
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
      <SelectInput
        items={items as unknown as any}
        onSelect={onSelect as unknown as any}
        itemComponent={itemComponent as unknown as any}
        limit={limit}
      />
      <HelpBar text={hint} />
    </Box>
  );
}
