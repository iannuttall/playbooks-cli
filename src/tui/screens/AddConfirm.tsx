import { join } from 'node:path';
import { Box, Text } from 'ink';
import React from 'react';
import { agents } from '../../agents.js';
import { formatList, shortenPath } from '../../cli-utils.js';
import { type SkillSecuritySummary, buildPlanSummary } from '../../flows/plan-summary.js';
import { type SecurityScanRow, scanSkillsForSecurity } from '../../flows/security-scan.js';
import { getCanonicalSkillsBase } from '../../installer.js';
import { getSkillDisplayName } from '../../skills.js';
import { useNavigation } from '../context/navigation.js';
import { SelectMenu } from '../controls/SelectMenu.js';
import { useTextInput } from '../hooks/useTextInput.js';
import { AddFlowHeader } from '../ui/AddFlowHeader.js';
import { useSpinnerFrame } from '../ui/spinner.js';

import type { ManualView } from './add-confirm-security.js';
import { ManualSecurityGate } from './add-confirm-security.js';

export function AddConfirmScreen() {
  const {
    invocation,
    addSkill,
    updateAddSkill,
    navigateTo,
    navAction,
    setFlash,
    resetTo,
    setBackHandler,
  } = useNavigation();
  const options = invocation.options;
  const [lines, setLines] = React.useState<string[]>([]);
  const [scanStatus, setScanStatus] = React.useState<'idle' | 'scanning' | 'done'>('idle');
  const [requiresManual, setRequiresManual] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState('');
  const [scanRows, setScanRows] = React.useState<SecurityScanRow[]>([]);
  const [manualView, setManualView] = React.useState<ManualView>('menu');
  const [selectedRow, setSelectedRow] = React.useState<SecurityScanRow | null>(null);
  const spinner = useSpinnerFrame(scanStatus === 'scanning');
  const { wrapOnChange } = useTextInput({
    onClear: () => {
      setConfirmText('');
    },
    disabled: !requiresManual || manualView !== 'type-confirm',
  });

  React.useEffect(() => {
    const selectedSkills = addSkill.selectedSkills;
    const targetAgents = addSkill.targetAgents;
    const installGlobally = addSkill.installGlobally;
    const installMode = addSkill.installMode;

    if (!selectedSkills || !targetAgents) return;
    if (installGlobally === undefined || !installMode) return;
    let cancelled = false;

    const run = async () => {
      setScanStatus('scanning');

      let securityBySkillName: Map<string, SkillSecuritySummary> | undefined =
        addSkill.securityBySkillName;
      let rows: SecurityScanRow[] | undefined = addSkill.securityScanRows;
      const expectedNames = selectedSkills.map(getSkillDisplayName);

      const map = securityBySkillName;
      const cachedOk = !!map && !!rows && expectedNames.every((name) => map.has(name));

      if (!cachedOk) {
        const scanned = await scanSkillsForSecurity(selectedSkills, {
          maxFiles: 120,
          maxFileBytes: 160_000,
          maxTotalBytes: 900_000,
          maxSignals: 25,
        });
        securityBySkillName = scanned.securityBySkillName;
        rows = scanned.rows;
        updateAddSkill({ securityBySkillName, securityScanRows: rows });
      }

      const summary = await buildPlanSummary(
        selectedSkills,
        targetAgents,
        installGlobally,
        installMode,
        securityBySkillName
      );

      if (cancelled) return;

      const isRisky = Array.from(securityBySkillName?.values() ?? []).some(
        (s) => s.verdict === 'block' || s.level === 'high' || s.level === 'critical'
      );

      setRequiresManual(isRisky && !addSkill.securityAccepted);
      setManualView('menu');
      setSelectedRow(null);
      setScanStatus('done');
      updateAddSkill({ planLines: summary });
      setLines(summary);
      setScanRows(rows ?? []);

      const canAutoProceed = !isRisky || addSkill.securityAccepted;
      if (options.yes && canAutoProceed && navAction !== 'pop') {
        navigateTo('add-install');
      }
    };

    run().catch((err) => {
      if (cancelled) return;
      setScanStatus('done');
      setFlash(err instanceof Error ? err.message : 'Failed to scan skills.');
    });

    return () => {
      cancelled = true;
    };
  }, [
    addSkill.selectedSkills,
    addSkill.targetAgents,
    addSkill.installGlobally,
    addSkill.installMode,
    addSkill.securityBySkillName,
    addSkill.securityScanRows,
    addSkill.securityAccepted,
    updateAddSkill,
    options.yes,
    navAction,
    navigateTo,
    setFlash,
  ]);

  React.useEffect(() => {
    if (!requiresManual) {
      setBackHandler(null);
      return () => setBackHandler(null);
    }
    if (manualView === 'details') {
      setBackHandler(() => {
        setManualView('menu');
        return true;
      });
      return () => setBackHandler(null);
    }
    if (manualView === 'detail-skill') {
      setBackHandler(() => {
        setSelectedRow(null);
        setManualView('details');
        return true;
      });
      return () => setBackHandler(null);
    }
    setBackHandler(null);
    return () => setBackHandler(null);
  }, [requiresManual, manualView, setBackHandler]);

  const skillsCount = addSkill.selectedSkills?.length ?? 0;
  const agentsCount = addSkill.targetAgents?.length ?? 0;
  const cwd = process.cwd();
  const scopeLabel = addSkill.installGlobally ? 'Global' : 'Project';
  const installModeLabel = addSkill.installMode === 'symlink' ? 'Symlink' : 'Copy';
  const canonicalBase = getCanonicalSkillsBase({ global: addSkill.installGlobally, cwd });
  const canonicalLabel = shortenPath(canonicalBase, cwd);
  const targetAgents = addSkill.targetAgents ?? [];
  const keyedLines = React.useMemo(() => {
    const counts = new Map<string, number>();
    return lines.map((line) => {
      const count = (counts.get(line) ?? 0) + 1;
      counts.set(line, count);
      return { line, key: `${line}-${count}` };
    });
  }, [lines]);
  const agentPaths =
    targetAgents.length > 0
      ? Array.from(
          new Set(
            targetAgents
              .map((agent) => {
                const config = agents[agent];
                const base = addSkill.installGlobally
                  ? config.globalSkillsDir
                  : join(cwd, config.skillsDir);
                return base ? shortenPath(base, cwd) : null;
              })
              .filter((p): p is string => p !== null)
          )
        )
      : [];

  return (
    <Box flexDirection="column" padding={1}>
      <AddFlowHeader title="Review plan" />
      <Box flexDirection="column" marginBottom={1}>
        <Text>{`Skills: ${skillsCount} • Agents: ${agentsCount}`}</Text>
        {addSkill.targetAgents ? (
          <Text dimColor>
            {`Targets: ${formatList(addSkill.targetAgents.map((agent) => agents[agent].displayName))}`}
          </Text>
        ) : null}
        {addSkill.installGlobally !== undefined ? (
          <Text dimColor>{`Scope: ${scopeLabel}`}</Text>
        ) : null}
        {addSkill.installMode ? <Text dimColor>{`Mode: ${installModeLabel}`}</Text> : null}
        {addSkill.installMode === 'symlink' ? (
          <Text dimColor>{`Canonical base: ${canonicalLabel}`}</Text>
        ) : null}
        {addSkill.installMode === 'copy' && agentPaths.length > 0 ? (
          <Text dimColor>{`Agent dirs: ${formatList(agentPaths, 3)}`}</Text>
        ) : null}
      </Box>
      {keyedLines.map(({ line, key }) => (
        <Text key={key}>{line}</Text>
      ))}
      <Box marginTop={1}>
        {scanStatus === 'scanning' ? (
          <Text dimColor>{spinner} Scanning skills for suspicious patterns...</Text>
        ) : requiresManual ? (
          <ManualSecurityGate
            scanRows={scanRows}
            manualView={manualView}
            setManualView={setManualView}
            selectedRow={selectedRow}
            setSelectedRow={setSelectedRow}
            confirmText={confirmText}
            setConfirmText={setConfirmText}
            wrapOnChange={wrapOnChange}
            setFlash={setFlash}
            onInstall={() => navigateTo('add-install')}
            onCancel={() => resetTo('main')}
          />
        ) : (
          <SelectMenu
            items={[
              { label: 'Install now', value: 'install' },
              { label: 'Cancel', value: 'cancel' },
            ]}
            hint="Confirm to start installation"
            onSelect={(item) => {
              if (item.value === 'install') {
                navigateTo('add-install');
              } else {
                resetTo('main');
              }
            }}
          />
        )}
      </Box>
    </Box>
  );
}
