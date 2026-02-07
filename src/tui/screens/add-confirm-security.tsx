import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import React from 'react';
import type { SecurityScanRow } from '../../flows/security-scan.js';
import type { SkillStaticSignal } from '../../scanner/static-scan.js';
import { SelectMenu } from '../controls/SelectMenu.js';
import { SingleSelect } from '../controls/SingleSelect.js';
import { BACK_QUIT_HINT, TEXT_INPUT_HINT } from '../ui/hints.js';

export type ManualView = 'menu' | 'details' | 'detail-skill' | 'type-confirm';

function formatSignalsBrief(signals: SkillStaticSignal[]): string {
  if (signals.length === 0) return 'None';
  const uniq = Array.from(new Set(signals.map((s) => s.id)));
  return uniq.slice(0, 6).join(', ') + (uniq.length > 6 ? ` (+${uniq.length - 6} more)` : '');
}

function formatFindingLine(sig: SkillStaticSignal): string {
  const loc = sig.line ? `${sig.file}:${sig.line}` : sig.file;
  const snippet = sig.snippet.length > 120 ? `${sig.snippet.slice(0, 117)}...` : sig.snippet;
  return `${sig.severity} ${sig.id} ${loc} ${snippet}`;
}

export function getRiskyScanRows(scanRows: SecurityScanRow[]): SecurityScanRow[] {
  return scanRows.filter((r) => {
    if (r.error) return true;
    return r.level !== 'none';
  });
}

export function ManualSecurityGate({
  scanRows,
  manualView,
  setManualView,
  selectedRow,
  setSelectedRow,
  confirmText,
  setConfirmText,
  wrapOnChange,
  setFlash,
  onInstall,
  onCancel,
}: {
  scanRows: SecurityScanRow[];
  manualView: ManualView;
  setManualView: (view: ManualView) => void;
  selectedRow: SecurityScanRow | null;
  setSelectedRow: (row: SecurityScanRow | null) => void;
  confirmText: string;
  setConfirmText: (value: string) => void;
  wrapOnChange: (handler: (next: string) => void) => (next: string) => void;
  setFlash: (msg: string | null) => void;
  onInstall: () => void;
  onCancel: () => void;
}) {
  const riskyScanRows = React.useMemo(() => getRiskyScanRows(scanRows), [scanRows]);

  if (manualView === 'details') {
    return (
      <Box flexDirection="column">
        <Text dimColor>Skills with scan findings:</Text>
        <Box marginTop={1}>
          {riskyScanRows.length === 0 ? (
            <Text dimColor>None.</Text>
          ) : (
            <SingleSelect
              items={riskyScanRows.map((row) => ({
                value: row,
                label: row.error
                  ? `${row.name} scan failed`
                  : `${row.name} ${row.level} score=${row.score} issues=${row.signals.length}`,
                info: row.error
                  ? `Scan failed: ${row.error}`
                  : `Top: ${formatSignalsBrief(row.signals)} • Ruleset: ${row.ruleset} • ${
                      row.truncated ? 'truncated' : 'full'
                    }`,
              }))}
              enableFilter={false}
              limit={10}
              hint={BACK_QUIT_HINT}
              onSubmit={(row) => {
                setSelectedRow(row);
                setManualView('detail-skill');
              }}
            />
          )}
        </Box>
      </Box>
    );
  }

  if (manualView === 'detail-skill' && selectedRow) {
    const riskColor =
      selectedRow.level === 'critical' || selectedRow.level === 'high'
        ? 'red'
        : selectedRow.level === 'medium'
          ? 'yellow'
          : selectedRow.level === 'low'
            ? 'green'
            : 'gray';

    return (
      <Box flexDirection="column">
        <Text>
          <Text bold>{selectedRow.name}</Text>
        </Text>
        {selectedRow.error ? (
          <Text color="red">{selectedRow.error}</Text>
        ) : (
          <>
            <Text>
              <Text dimColor>Verdict:</Text> <Text color={riskColor}>{selectedRow.verdict}</Text>
              <Text
                dimColor
              >{` • level=${selectedRow.level} score=${selectedRow.score} issues=${selectedRow.signals.length}`}</Text>
            </Text>
            <Text dimColor>{`Top signals: ${formatSignalsBrief(selectedRow.signals)}`}</Text>
            <Text dimColor>{`Ruleset: ${selectedRow.ruleset}`}</Text>
            {selectedRow.truncated ? (
              <Text dimColor>Note: scan was truncated due to file/byte/signal limits.</Text>
            ) : null}
          </>
        )}
        <Text dimColor>{`Path: ${selectedRow.path}`}</Text>

        {!selectedRow.error && selectedRow.signals.length > 0 ? (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>{`Findings (${selectedRow.signals.length}):`}</Text>
            {selectedRow.signals.slice(0, 12).map((sig, idx) => (
              <Text key={`${sig.id}-${idx}`} dimColor>
                {'• '} {formatFindingLine(sig)}
              </Text>
            ))}
            {selectedRow.signals.length > 12 ? (
              <Text dimColor>{`… ${selectedRow.signals.length - 12} more`}</Text>
            ) : null}
          </Box>
        ) : null}

        <Box marginTop={1}>
          <Text dimColor>{BACK_QUIT_HINT}</Text>
        </Box>
      </Box>
    );
  }

  if (manualView === 'type-confirm') {
    return (
      <Box flexDirection="column">
        <Text color="red">High risk patterns detected.</Text>
        <Text dimColor>
          If you still want to proceed, type <Text bold>install</Text> and press Enter.
        </Text>
        <Box marginTop={1}>
          <Text color="green">&gt; </Text>
          <TextInput
            value={confirmText}
            onChange={wrapOnChange(setConfirmText)}
            onSubmit={(value) => {
              const trimmed = value.trim().toLowerCase();
              if (trimmed === 'install') {
                onInstall();
                return;
              }
              setFlash('Cancelled.');
              onCancel();
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>{TEXT_INPUT_HINT}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="red">High risk patterns detected.</Text>
      <Text dimColor>
        Review the scan summary below (or open scan details). If you proceed, you will need to type{' '}
        <Text bold>install</Text>.
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {riskyScanRows.slice(0, 6).map((row) => {
          const level = row.level ?? 'none';
          const top = row.error ? '' : ` top=${formatSignalsBrief(row.signals)}`;
          const suffix = row.error
            ? ` scan failed: ${row.error}`
            : ` score=${row.score} issues=${row.signals.length}${top}`;
          return (
            <Text key={row.path} dimColor>
              {'•'} {row.name} {level}
              {suffix}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <SelectMenu
          items={[
            { label: 'View scan details', value: 'details' },
            { label: 'Install anyway', value: 'install' },
            { label: 'Cancel', value: 'cancel' },
          ]}
          hint="Review findings before installing"
          onSelect={(item) => {
            if (item.value === 'details') {
              setManualView('details');
              return;
            }
            if (item.value === 'install') {
              setConfirmText('');
              setManualView('type-confirm');
              return;
            }
            onCancel();
          }}
        />
      </Box>
    </Box>
  );
}
