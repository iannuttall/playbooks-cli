import { rm } from 'node:fs/promises';
import chalk from 'chalk';
import { Box, Text } from 'ink';
import React from 'react';
import { collectInstalledSkillDirs } from '../../flows/scan-installed-skills.js';
import { findSkillInstallations } from '../../installed-skills.js';
import { getCanonicalPath } from '../../installer.js';
import { scanSkillDir } from '../../scanner/scan-skill-dir.js';
import { removeSkillFromLock } from '../../skill-lock.js';
import { useNavigation } from '../context/navigation.js';
import { SelectMenu } from '../controls/SelectMenu.js';
import { SingleSelect } from '../controls/SingleSelect.js';
import { Header } from '../ui/Header.js';
import { BACK_QUIT_HINT, SCAN_SKILLS_HINT } from '../ui/hints.js';
import { useSpinnerFrame } from '../ui/spinner.js';

import {
  type Row,
  asyncPool,
  buildRowInfo,
  formatRowLabel,
  isRisky,
  plural,
  removalTargetsForRow,
  scanSummary,
} from './scan-skills-utils.js';

type View =
  | 'loading'
  | 'running'
  | 'select'
  | 'actions'
  | 'confirm-remove'
  | 'removing'
  | 'empty'
  | 'error';

export function ScanSkillsScreen() {
  const { setFlash, setBackHandler } = useNavigation();
  const [view, setView] = React.useState<View>('loading');
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [progress, setProgress] = React.useState<{ completed: number; total: number } | null>(null);
  const [selected, setSelected] = React.useState<Row | null>(null);
  const [removeTargets, setRemoveTargets] = React.useState<Array<{
    path: string;
    label: string;
  }> | null>(null);
  const spinner = useSpinnerFrame(view === 'running' || view === 'removing');

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setView('loading');
        const collected = await collectInstalledSkillDirs(process.cwd());
        if (cancelled) return;

        if (collected.skills.length === 0) {
          setRows([]);
          setView('empty');
          return;
        }

        setView('running');
        setProgress({ completed: 0, total: collected.skills.length });

        const scanned = await asyncPool(
          4,
          collected.skills,
          async (skill): Promise<Row> => {
            try {
              const res = await scanSkillDir(skill.path, {
                maxFiles: 120,
                maxFileBytes: 160_000,
                maxTotalBytes: 900_000,
                maxSignals: 25,
              });
              return {
                skill,
                level: res.staticScan.overall.level,
                score: res.staticScan.overall.score,
                verdict: res.staticScan.overall.verdict,
                issues: res.staticScan.signals.length,
                ruleset: res.staticScan.rulesetVersion,
                topSignals: Array.from(new Set(res.staticScan.signals.map((s) => s.id))).slice(
                  0,
                  8
                ),
              };
            } catch (err) {
              return {
                skill,
                error: err instanceof Error ? err.message : 'Scan failed',
              };
            }
          },
          (completed, total) => {
            if (cancelled) return;
            setProgress({ completed, total });
          }
        );

        if (cancelled) return;
        const sorted = scanned.slice().sort((a, b) => {
          const aScore = a.error ? -1 : (a.score ?? -1);
          const bScore = b.error ? -1 : (b.score ?? -1);
          if (bScore !== aScore) return bScore - aScore;
          return a.skill.name.localeCompare(b.skill.name);
        });
        setRows(sorted);
        const risky = sorted.filter(isRisky);
        setView(risky.length > 0 ? 'select' : 'empty');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Scan failed');
        setView('error');
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (view === 'actions' || view === 'confirm-remove' || view === 'removing') {
      setBackHandler(() => {
        if (view === 'confirm-remove') {
          setView('actions');
          return true;
        }
        if (view === 'actions') {
          setSelected(null);
          setRemoveTargets(null);
          setView('select');
          return true;
        }
        return true;
      });
      return () => setBackHandler(null);
    }
    setBackHandler(null);
    return () => setBackHandler(null);
  }, [view, setBackHandler]);

  const riskyRows = React.useMemo(() => rows.filter(isRisky), [rows]);
  const summary = React.useMemo(() => scanSummary(rows), [rows]);

  if (view === 'empty') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Scan skills" />
        <Text dimColor>
          {rows.length === 0
            ? 'No skills found to scan (project + global).'
            : `Scanned ${rows.length} skill${rows.length === 1 ? '' : 's'}. No risks found.`}
        </Text>
      </Box>
    );
  }

  if (view === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Scan skills" />
        <Text dimColor>Discovering skills...</Text>
      </Box>
    );
  }

  if (view === 'running') {
    const completed = progress?.completed ?? 0;
    const total = progress?.total ?? 0;
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Scan skills" />
        <Text>
          {spinner} Scanning {completed}/{total} skill{total === 1 ? '' : 's'}...
        </Text>
        <Box marginTop={1}>
          <Text dimColor>{BACK_QUIT_HINT}</Text>
        </Box>
      </Box>
    );
  }

  if (view === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Scan skills" />
        <Text color="red">{error ?? 'Scan failed'}</Text>
        <Box marginTop={1}>
          <Text dimColor>{BACK_QUIT_HINT}</Text>
        </Box>
      </Box>
    );
  }

  if (view === 'actions' && selected) {
    const level = selected.level ?? 'none';
    const score = selected.score ?? 0;
    const issues = selected.issues ?? 0;
    const verdict = selected.verdict ?? 'unknown';
    const top = selected.topSignals?.slice(0, 10) ?? [];
    const locationLabels = selected.skill.locations.map((l) => l.label);

    const riskColor =
      level === 'critical' || level === 'high'
        ? 'red'
        : level === 'medium'
          ? 'yellow'
          : level === 'low'
            ? 'green'
            : 'gray';

    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Skill risk details" />
        <Text>
          <Text bold>{selected.skill.name}</Text> <Text dimColor>{`(${selected.skill.slug})`}</Text>
        </Text>
        {selected.error ? (
          <Text color="red">{selected.error}</Text>
        ) : (
          <>
            <Text>
              <Text dimColor>Verdict:</Text> <Text color={riskColor}>{verdict}</Text>
              <Text dimColor>{` • level=${level} score=${score} issues=${issues}`}</Text>
            </Text>
            {top.length > 0 ? <Text dimColor>{`Top signals: ${top.join(', ')}`}</Text> : null}
            {selected.ruleset ? <Text dimColor>{`Ruleset: ${selected.ruleset}`}</Text> : null}
          </>
        )}
        {selected.skill.description ? <Text dimColor>{selected.skill.description}</Text> : null}
        <Text dimColor>{`Path: ${selected.skill.path}`}</Text>
        {locationLabels.length > 0 ? (
          <Text dimColor>{`Locations: ${locationLabels.join(', ')}`}</Text>
        ) : null}

        <Box marginTop={1}>
          <SelectMenu
            items={[
              { label: 'Remove skill', value: 'remove' },
              { label: 'Back', value: 'back' },
            ]}
            showDivider={false}
            onSelect={(item) => {
              if (item.value === 'back') {
                setSelected(null);
                setRemoveTargets(null);
                setView('select');
                return;
              }
              const targets = removalTargetsForRow(selected, process.cwd());
              setRemoveTargets(targets);
              setView('confirm-remove');
            }}
            hint={BACK_QUIT_HINT}
          />
        </Box>
      </Box>
    );
  }

  if (view === 'confirm-remove' && selected && removeTargets) {
    const title = `Remove ${selected.skill.name}`;
    return (
      <Box flexDirection="column" padding={1}>
        <Header title={title} />
        <Text dimColor>These locations will be removed:</Text>
        <Box flexDirection="column" marginTop={1}>
          {removeTargets.length === 0 ? (
            <Text dimColor>None found.</Text>
          ) : (
            removeTargets.map((t) => (
              <Text key={t.path}>
                <Text>{chalk.red('•')}</Text> <Text dimColor>{t.label}</Text> {t.path}
              </Text>
            ))
          )}
        </Box>
        <Box marginTop={1}>
          <SelectMenu
            items={[
              { label: 'Remove now', value: 'remove' },
              { label: 'Cancel', value: 'cancel' },
            ]}
            showDivider={false}
            onSelect={async (item) => {
              if (item.value === 'cancel') {
                setView('actions');
                return;
              }

              setView('removing');
              const cwd = process.cwd();
              try {
                for (const target of removeTargets) {
                  await rm(target.path, { recursive: true, force: true });
                }

                // Best-effort cleanup of canonical + lock entries when no installs remain.
                for (const scope of ['project', 'global'] as const) {
                  const remaining = await findSkillInstallations(selected.skill.slug, scope, cwd);
                  if (remaining.length === 0) {
                    const canonicalPath = getCanonicalPath(selected.skill.slug, {
                      global: scope === 'global',
                      cwd,
                    });
                    await rm(canonicalPath, { recursive: true, force: true });
                    await removeSkillFromLock(selected.skill.name, { global: scope === 'global' });
                  }
                }

                setRows((prev) => prev.filter((r) => r.skill.id !== selected.skill.id));
                setFlash(`Removed ${selected.skill.name}`);
              } catch (err) {
                setFlash(
                  `Could not remove ${selected.skill.name}: ${
                    err instanceof Error ? err.message : 'unknown error'
                  }`
                );
              } finally {
                setSelected(null);
                setRemoveTargets(null);
                // View will be derived from updated rows via the memoized riskyRows.
                setView('select');
              }
            }}
            hint={BACK_QUIT_HINT}
          />
        </Box>
      </Box>
    );
  }

  if (view === 'removing') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Removing skill" />
        <Text>{spinner} Removing...</Text>
        <Box marginTop={1}>
          <Text dimColor>{BACK_QUIT_HINT}</Text>
        </Box>
      </Box>
    );
  }

  if (riskyRows.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Scan skills" />
        <Text dimColor>
          {rows.length === 0
            ? 'No skills found to scan (project + global).'
            : `Scanned ${rows.length} skill${rows.length === 1 ? '' : 's'}. No risks found.`}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Scan skills" />
      <Box marginBottom={1} flexDirection="column">
        <Text dimColor>{`Scanned ${plural(summary.total, 'skill')}.`}</Text>
        <Text>
          <Text color="red">{plural(summary.high, 'high risk')}</Text>
          <Text>, </Text>
          <Text color="yellow">{plural(summary.medium, 'medium risk')}</Text>
          <Text> detected.</Text>
        </Text>
      </Box>
      <SingleSelect
        items={riskyRows.map((row) => ({
          value: row,
          label: formatRowLabel(row),
          info: buildRowInfo(row),
        }))}
        onSubmit={(row) => {
          setSelected(row);
          setView('actions');
        }}
        limit={12}
        enableFilter={false}
        hint={SCAN_SKILLS_HINT}
      />
    </Box>
  );
}
