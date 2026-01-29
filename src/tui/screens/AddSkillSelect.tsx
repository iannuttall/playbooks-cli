import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Box, Text } from 'ink';
import React from 'react';
import { resolveRemoteSkill } from '../../flows/remote-skill.js';
import { cleanupTempDir, cloneRepo } from '../../git.js';
import { isMarketplaceSource, loadMarketplace, normalizePlugins } from '../../marketplace.js';
import { discoverSkills, getSkillDisplayName } from '../../skills.js';
import { parseSource } from '../../source-parser.js';
import { registerTempDir } from '../../temp-registry.js';
import type { Skill } from '../../types.js';
import { useNavigation } from '../context/navigation.js';
import { MultiSelect } from '../controls/MultiSelect.js';
import { AddFlowHeader } from '../ui/AddFlowHeader.js';
import { BACK_QUIT_HINT } from '../ui/hints.js';
import { useSpinnerFrame } from '../ui/spinner.js';

type Status = 'loading' | 'ready' | 'error' | 'list';

export function AddSkillSelectScreen() {
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
  const [listMode, setListMode] = React.useState(false);
  const [showLoading, setShowLoading] = React.useState(false);
  const spinner = useSpinnerFrame(status === 'loading');

  const source = addSkill.source ?? invocation.source;
  const options = invocation.options;

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!source) {
        navigateTo('add-source');
        return;
      }

      if (addSkill.skills && addSkill.skills.length > 0) {
        setStatus('ready');
        return;
      }

      setStatus('loading');

      let tempDirForCleanup: string | null = null;
      let keepTempDir = false;

      try {
        if (isMarketplaceSource(source)) {
          const marketplace = await loadMarketplace(source);
          const plugins = normalizePlugins(marketplace.json);
          updateAddSkill({
            marketplace: {
              context: marketplace.context,
              plugins,
            },
          });
          navigateTo('add-marketplace-plugins');
          return;
        }

        const parsed = parseSource(source);

        if (parsed.type === 'direct-url') {
          const resolved = await resolveRemoteSkill(parsed.url);
          if (!resolved) {
            throw new Error('Unable to fetch SKILL.md from that URL.');
          }

          const tempDir = await mkdtemp(join(tmpdir(), 'playbooks-skill-'));
          registerTempDir(tempDir);
          tempDirForCleanup = tempDir;
          await mkdir(tempDir, { recursive: true });
          await writeFile(join(tempDir, 'SKILL.md'), resolved.remoteSkill.content, 'utf-8');

          const skill: Skill = {
            name: resolved.remoteSkill.installName,
            description: resolved.remoteSkill.description,
            path: tempDir,
            rawContent: resolved.remoteSkill.content,
          };

          const originMap = new Map<string, typeof resolved.origin>();
          originMap.set(resolved.remoteSkill.installName, resolved.origin);

          updateAddSkill({
            parsed,
            tempDir,
            skills: [skill],
            selectedSkills: [skill],
            originBySkillName: originMap,
          });

          if (options.list) {
            keepTempDir = true;
            setListMode(true);
            setStatus('list');
            return;
          }

          keepTempDir = true;
          navigateTo('add-targets');
          return;
        }

        let skillsDir = '';
        let tempDir: string | null = null;

        if (parsed.type === 'local') {
          if (!parsed.localPath) {
            throw new Error('Local path is missing.');
          }
          skillsDir = parsed.localPath;
          if (!existsSync(skillsDir)) {
            throw new Error(`Local path does not exist: ${skillsDir}`);
          }
        } else {
          tempDir = await cloneRepo(parsed.url, parsed.ref);
          tempDirForCleanup = tempDir;
          skillsDir = tempDir;
        }

        const skills = await discoverSkills(skillsDir, parsed.subpath);
        if (skills.length === 0) {
          if (tempDir) {
            await cleanupTempDir(tempDir);
          }
          throw new Error('No valid skills found. Need a SKILL.md with name and description.');
        }

        if (cancelled) {
          if (tempDir) await cleanupTempDir(tempDir);
          return;
        }

        updateAddSkill({
          parsed,
          tempDir,
          skills,
        });

        if (options.list) {
          if (tempDir) {
            keepTempDir = true;
          }
          setListMode(true);
          setStatus('list');
          return;
        }

        const autoSelection = autoSelect(skills, options);
        if (autoSelection.status === 'selected') {
          if (tempDir) {
            keepTempDir = true;
          }
          updateAddSkill({ selectedSkills: autoSelection.skills });
          navigateTo('add-targets');
          return;
        }

        if (autoSelection.status === 'error') {
          throw new Error(autoSelection.message);
        }

        if (autoSelection.status === 'prompt' && autoSelection.message) {
          setFlash(autoSelection.message);
        }

        if (tempDir) {
          keepTempDir = true;
        }
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        if (tempDirForCleanup && !keepTempDir) {
          try {
            await cleanupTempDir(tempDirForCleanup);
          } catch {
            // best-effort
          }
          updateAddSkill({ tempDir: null, skills: undefined, selectedSkills: undefined });
        }
        setError(err instanceof Error ? err.message : 'Unable to load skills');
        setStatus('error');
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [source, addSkill.skills, updateAddSkill, navigateTo, options, setFlash]);

  React.useEffect(() => {
    if (invocation.source) {
      setBackHandler(() => {
        setLastSource(invocation.source ?? null);
        resetAddSkill();
        setInvocation({ intent: 'none', options: {} });
        resetTo('main');
        return true;
      });
    } else {
      setBackHandler(null);
    }
    return () => {
      setBackHandler(null);
    };
  }, [invocation.source, resetTo, setBackHandler, resetAddSkill, setInvocation, setLastSource]);

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

  if (!source) {
    return (
      <Box flexDirection="column" padding={1}>
        <AddFlowHeader title="Add skills" />
        <Text>{`Missing source. ${BACK_QUIT_HINT}`}</Text>
      </Box>
    );
  }

  if (status === 'loading' && !showLoading) {
    return <Box padding={1} />;
  }

  if (status === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        <AddFlowHeader title="Scanning skills" />
        <Text>
          {spinner} Fetching skills from {source}
        </Text>
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <AddFlowHeader title="Unable to load skills" />
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
        <AddFlowHeader title={`Available skills (${skills.length})`} />
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
      <AddFlowHeader title="Select skills" />
      <MultiSelect
        items={skills.map((skill) => ({
          value: skill,
          label: getSkillDisplayName(skill),
          hint:
            skill.description && skill.description.length > 60
              ? `${skill.description.slice(0, 57)}...`
              : skill.description,
        }))}
        initialSelected={addSkill.selectedSkills ?? []}
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
          });
          navigateTo('add-targets');
        }}
      />
    </Box>
  );
}

function matchesSkillName(skill: Skill, input: string): boolean {
  const normalized = input.toLowerCase();
  const byName = skill.name.toLowerCase() === normalized;
  const byPath = basename(skill.path).toLowerCase() === normalized;
  return byName || byPath;
}

function autoSelect(
  skills: Skill[],
  options: { skill?: string[]; yes?: boolean }
):
  | { status: 'selected'; skills: Skill[] }
  | { status: 'prompt'; message?: string }
  | { status: 'error'; message: string } {
  if (options.skill && options.skill.length > 0) {
    const selected = skills.filter((s) => options.skill?.some((name) => matchesSkillName(s, name)));
    if (selected.length === 0) {
      return {
        status: 'prompt',
        message: `No matching skills found for: ${options.skill.join(', ')}`,
      } as const;
    }
    return { status: 'selected', skills: selected } as const;
  }

  if (skills.length === 1) {
    return { status: 'selected', skills } as const;
  }

  if (options.yes) {
    return { status: 'selected', skills } as const;
  }

  return { status: 'prompt' } as const;
}
