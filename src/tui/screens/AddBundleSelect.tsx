import { basename } from 'node:path';
import { Box, Text } from 'ink';
import React from 'react';
import { cleanupTempDir, cloneRepo } from '../../git.js';
import { type BundleSkillEntry, fetchBundle } from '../../playbooks-api.js';
import { discoverSkills, getSkillDisplayName } from '../../skills.js';
import type { Skill } from '../../types.js';
import { useNavigation } from '../context/navigation.js';
import { MultiSelect } from '../controls/MultiSelect.js';
import { AddFlowHeader } from '../ui/AddFlowHeader.js';
import { BACK_QUIT_HINT } from '../ui/hints.js';
import { useSpinnerFrame } from '../ui/spinner.js';
import { autoSelect } from '../utils/skill-selection.js';

type Status = 'loading' | 'ready' | 'error' | 'list';

/**
 * Group bundle skills by their GitHub repo so each repo is cloned only once.
 */
function groupByRepo(skills: BundleSkillEntry[]): Map<string, BundleSkillEntry[]> {
  const map = new Map<string, BundleSkillEntry[]>();
  for (const skill of skills) {
    if (!skill.repoOwner || !skill.repoName) continue;
    const key = `${skill.repoOwner}/${skill.repoName}`;
    const list = map.get(key) ?? [];
    list.push(skill);
    map.set(key, list);
  }
  return map;
}

/**
 * Find a discovered skill that matches a bundle entry.
 * Matches on skill name, skill slug, or directory name since the API name
 * may be a slug (e.g. "react-best-practices") while the SKILL.md name is
 * a display name (e.g. "React Best Practices").
 */
function findMatchingSkill(discovered: Skill[], entry: BundleSkillEntry): Skill | undefined {
  const targets = [entry.name, entry.skillSlug]
    .filter((t): t is string => Boolean(t))
    .map((t) => t.toLowerCase());

  for (const skill of discovered) {
    const candidates = [skill.name.toLowerCase(), basename(skill.path).toLowerCase()];
    if (candidates.some((c) => targets.includes(c))) {
      return skill;
    }
  }

  return undefined;
}

export function AddBundleSelectScreen() {
  const {
    invocation,
    addSkill,
    updateAddSkill,
    navigateTo,
    setFlash,
    setBackHandler,
    resetTo,
    setInvocation,
    resetAddSkill,
    setLastSource,
  } = useNavigation();
  const [status, setStatus] = React.useState<Status>(
    addSkill.skills && addSkill.skills.length > 0 ? 'ready' : 'loading'
  );
  const [error, setError] = React.useState<string | null>(null);
  const [bundleName, setBundleName] = React.useState<string | null>(null);
  const [listMode, setListMode] = React.useState(false);
  const [showLoading, setShowLoading] = React.useState(false);
  const spinner = useSpinnerFrame(status === 'loading');

  const slug = invocation.source;
  const options = invocation.options;

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!slug) {
        setError('Missing bundle slug.');
        setStatus('error');
        return;
      }

      if (addSkill.skills && addSkill.skills.length > 0) {
        setStatus('ready');
        return;
      }

      setStatus('loading');

      const tempDirs: string[] = [];

      try {
        const bundle = await fetchBundle(slug);
        if (cancelled) return;

        setBundleName(bundle.bundle.name);

        const cloneable = bundle.skills.filter((s) => s.repoOwner && s.repoName);
        const skippedCount = bundle.skills.length - cloneable.length;

        if (cloneable.length === 0) {
          throw new Error('No installable skills found in this bundle.');
        }

        const grouped = groupByRepo(cloneable);
        const allSkills: Skill[] = [];
        const warnings: string[] = [];

        for (const [repo, entries] of grouped) {
          if (cancelled) break;

          const repoUrl = `https://github.com/${repo}.git`;
          let tempDir: string;
          try {
            tempDir = await cloneRepo(repoUrl);
          } catch {
            warnings.push(`Failed to clone ${repo}`);
            continue;
          }
          tempDirs.push(tempDir);

          // Discover all skills in the repo once, then match bundle entries by name
          let discovered: Skill[];
          try {
            discovered = await discoverSkills(tempDir);
          } catch {
            warnings.push(`Failed to discover skills in ${repo}`);
            continue;
          }

          for (const entry of entries) {
            if (cancelled) break;

            const match = findMatchingSkill(discovered, entry);
            if (match) {
              allSkills.push(match);
            } else {
              warnings.push(`Could not find skill "${entry.name}" in ${repo}`);
            }
          }
        }

        if (cancelled) {
          for (const dir of tempDirs) {
            try {
              await cleanupTempDir(dir);
            } catch {
              /* best-effort */
            }
          }
          return;
        }

        if (allSkills.length === 0) {
          for (const dir of tempDirs) {
            try {
              await cleanupTempDir(dir);
            } catch {
              /* best-effort */
            }
          }
          const detail = warnings.length > 0 ? `\n${warnings.join('\n')}` : '';
          throw new Error(`No skills could be resolved from this bundle.${detail}`);
        }

        if (skippedCount > 0) {
          warnings.push(`${skippedCount} skill(s) skipped (missing repo info)`);
        }

        if (warnings.length > 0) {
          setFlash(warnings.join('. '));
        }

        // Store the first temp dir in state for the existing flow's cleanup;
        // all temp dirs are registered with the temp registry for process-exit cleanup.
        updateAddSkill({
          tempDir: tempDirs[0] ?? null,
          skills: allSkills,
        });

        if (options.list) {
          setListMode(true);
          setStatus('list');
          return;
        }

        const autoSelection = autoSelect(allSkills, options);
        if (autoSelection.status === 'selected') {
          updateAddSkill({
            selectedSkills: autoSelection.skills,
            securityBySkillName: undefined,
            securityScanRows: undefined,
            securityAccepted: undefined,
          });
          navigateTo('add-security-scan');
          return;
        }

        if (autoSelection.status === 'error') {
          throw new Error(autoSelection.message);
        }

        if (autoSelection.status === 'prompt' && autoSelection.message) {
          setFlash(autoSelection.message);
        }

        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        for (const dir of tempDirs) {
          try {
            await cleanupTempDir(dir);
          } catch {
            /* best-effort */
          }
        }
        updateAddSkill({ tempDir: null, skills: undefined, selectedSkills: undefined });
        setError(err instanceof Error ? err.message : 'Failed to load bundle');
        setStatus('error');
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [slug, addSkill.skills, updateAddSkill, navigateTo, options, setFlash]);

  React.useEffect(() => {
    setBackHandler(() => {
      setLastSource(null);
      resetAddSkill();
      setInvocation({ intent: 'none', options: {} });
      resetTo('main');
      return true;
    });
    return () => {
      setBackHandler(null);
    };
  }, [resetTo, setBackHandler, resetAddSkill, setInvocation, setLastSource]);

  React.useEffect(() => {
    if (status !== 'loading') {
      setShowLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowLoading(true);
    }, 150);
    return () => clearTimeout(timer);
  }, [status]);

  if (status === 'loading' && !showLoading) {
    return <Box padding={1} />;
  }

  if (status === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        <AddFlowHeader title={bundleName ? `Bundle: ${bundleName}` : 'Loading bundle'} />
        <Text>
          {spinner} {bundleName ? 'Cloning skills...' : `Fetching bundle "${slug}"...`}
        </Text>
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <AddFlowHeader title="Unable to load bundle" />
        <Text color="red">{error}</Text>
        <Box marginTop={1}>
          <Text dimColor>{BACK_QUIT_HINT}</Text>
        </Box>
      </Box>
    );
  }

  const skills = addSkill.skills ?? [];

  if (listMode || status === 'list') {
    return (
      <Box flexDirection="column" padding={1}>
        <AddFlowHeader title={`${bundleName ?? 'Bundle'} (${skills.length} skills)`} />
        {skills.map((skill) => (
          <Box key={skill.name} flexDirection="column" marginBottom={1}>
            <Text>{getSkillDisplayName(skill)}</Text>
            {skill.description ? <Text dimColor>{skill.description}</Text> : null}
          </Box>
        ))}
        <Text dimColor>{BACK_QUIT_HINT}</Text>
      </Box>
    );
  }

  if (skills.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <AddFlowHeader title="No skills found" />
        <Text dimColor>{BACK_QUIT_HINT}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <AddFlowHeader title={`${bundleName ?? 'Bundle'} - Select skills`} />
      <MultiSelect
        items={skills.map((skill) => ({
          value: skill,
          label: getSkillDisplayName(skill),
          hint:
            skill.description && skill.description.length > 60
              ? `${skill.description.slice(0, 57)}...`
              : skill.description,
        }))}
        initialSelected={addSkill.selectedSkills ?? skills}
        onSubmit={(values) => {
          if (values.length === 0) {
            setFlash('Select at least one skill.');
            return;
          }
          updateAddSkill({
            selectedSkills: values,
            targetAgents: undefined,
            installGlobally: undefined,
            installMode: undefined,
            planLines: undefined,
            securityBySkillName: undefined,
            securityScanRows: undefined,
            securityAccepted: undefined,
          });
          navigateTo('add-security-scan');
        }}
      />
    </Box>
  );
}
