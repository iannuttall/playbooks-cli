import { Box, Text } from 'ink';
import React from 'react';
import { type SecurityScanRow, scanSkillsForSecurity } from '../../flows/security-scan.js';
import { useNavigation } from '../context/navigation.js';
import { useTextInput } from '../hooks/useTextInput.js';
import { AddFlowHeader } from '../ui/AddFlowHeader.js';
import { BACK_QUIT_HINT } from '../ui/hints.js';
import { useSpinnerFrame } from '../ui/spinner.js';

import type { ManualView } from './add-confirm-security.js';
import { ManualSecurityGate } from './add-confirm-security.js';

type Status = 'scanning' | 'risky' | 'done' | 'error';

export function AddSecurityScanScreen() {
  const { invocation, addSkill, updateAddSkill, navigateTo, resetTo, setFlash, setBackHandler } =
    useNavigation();
  const options = invocation.options;
  const [status, setStatus] = React.useState<Status>('scanning');
  const [error, setError] = React.useState<string | null>(null);
  const [manualView, setManualView] = React.useState<ManualView>('menu');
  const [confirmText, setConfirmText] = React.useState('');
  const [selectedRow, setSelectedRow] = React.useState<SecurityScanRow | null>(null);
  const spinner = useSpinnerFrame(status === 'scanning');

  const { wrapOnChange } = useTextInput({
    onClear: () => setConfirmText(''),
    disabled: status !== 'risky' || manualView !== 'type-confirm',
  });

  React.useEffect(() => {
    const selectedSkills = addSkill.selectedSkills;
    if (!selectedSkills || selectedSkills.length === 0) {
      navigateTo('add-skill-select');
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        setStatus('scanning');
        const scanned = await scanSkillsForSecurity(selectedSkills, {
          maxFiles: 120,
          maxFileBytes: 160_000,
          maxTotalBytes: 900_000,
          maxSignals: 25,
        });

        if (cancelled) return;
        updateAddSkill({
          securityBySkillName: scanned.securityBySkillName,
          securityScanRows: scanned.rows,
        });

        if (!scanned.isHighRisk) {
          setStatus('done');
          navigateTo('add-targets');
          return;
        }

        setSelectedRow(null);
        setManualView('menu');
        setStatus('risky');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Scan failed');
        setStatus('error');
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [addSkill.selectedSkills, navigateTo, updateAddSkill]);

  React.useEffect(() => {
    if (status !== 'risky') {
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
  }, [status, manualView, setBackHandler]);

  if (status === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <AddFlowHeader title="Security scan" />
        <Text color="red">{error ?? 'Scan failed'}</Text>
        <Box marginTop={1}>
          <Text dimColor>{BACK_QUIT_HINT}</Text>
        </Box>
      </Box>
    );
  }

  if (status === 'scanning') {
    const count = addSkill.selectedSkills?.length ?? 0;
    return (
      <Box flexDirection="column" padding={1}>
        <AddFlowHeader title="Security scan" />
        <Text>
          {spinner} Scanning {count} skill{count === 1 ? '' : 's'}...
        </Text>
      </Box>
    );
  }

  if (status === 'risky') {
    return (
      <Box flexDirection="column" padding={1}>
        <AddFlowHeader title="Security scan" />
        <ManualSecurityGate
          scanRows={addSkill.securityScanRows ?? []}
          manualView={manualView}
          setManualView={setManualView}
          selectedRow={selectedRow}
          setSelectedRow={setSelectedRow}
          confirmText={confirmText}
          setConfirmText={setConfirmText}
          wrapOnChange={wrapOnChange}
          setFlash={setFlash}
          onInstall={() => {
            // User acknowledged risk, continue setup.
            updateAddSkill({ securityAccepted: true });
            navigateTo('add-targets');
          }}
          onCancel={() => {
            resetTo('main');
          }}
        />
      </Box>
    );
  }

  // We usually auto-advance to add-targets when safe. This is a fallback render.
  if (options.yes) {
    return <Box padding={1} />;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <AddFlowHeader title="Security scan" />
      <Text dimColor>Scan complete.</Text>
      <Box marginTop={1}>
        <Text dimColor>{BACK_QUIT_HINT}</Text>
      </Box>
    </Box>
  );
}
