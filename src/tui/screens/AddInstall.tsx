import { Box, Text } from 'ink';
import React from 'react';
import { performInstall } from '../../flows/install-core.js';
import { formatResultSummary } from '../../flows/install-summary.js';
import { cleanupTempDir } from '../../git.js';
import { useNavigation } from '../context/navigation.js';
import { AddFlowHeader } from '../ui/AddFlowHeader.js';
import { BACK_QUIT_HINT } from '../ui/hints.js';
import { useSpinnerFrame } from '../ui/spinner.js';

export function AddInstallScreen() {
  const { addSkill, updateAddSkill, navigateTo } = useNavigation();
  const spinner = useSpinnerFrame(true);
  const [status, setStatus] = React.useState<'running' | 'done' | 'error'>('running');
  const [error, setError] = React.useState<string | null>(null);
  const didRun = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (didRun.current) return;
      didRun.current = true;
      if (!addSkill.selectedSkills || !addSkill.targetAgents) {
        setError('Missing selection data.');
        setStatus('error');
        return;
      }
      if (addSkill.installGlobally === undefined || !addSkill.installMode) {
        setError('Missing install configuration.');
        setStatus('error');
        return;
      }

      try {
        const outcome = await performInstall(
          addSkill.selectedSkills,
          addSkill.targetAgents,
          addSkill.installGlobally,
          addSkill.installMode,
          {
            parsed: addSkill.parsed,
            tempDir: addSkill.tempDir,
            originBySkillName: addSkill.originBySkillName,
          }
        );

        if (cancelled) return;

        const summary = formatResultSummary(outcome.successful);
        updateAddSkill({
          installResults: outcome.results,
          planLines: summary.lines,
        });

        setStatus('done');
        navigateTo('add-result');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Install failed.');
        setStatus('error');
      } finally {
        if (addSkill.tempDir) {
          try {
            await cleanupTempDir(addSkill.tempDir);
          } catch {
            // ignore
          }
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [addSkill, updateAddSkill, navigateTo]);

  if (status === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <AddFlowHeader title="Install failed" />
        <Text color="red">{error}</Text>
        <Text dimColor>{BACK_QUIT_HINT}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <AddFlowHeader title="Installing skills" />
      <Text>{spinner} Installing...</Text>
    </Box>
  );
}
