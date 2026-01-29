import { rm } from 'node:fs/promises';
import chalk from 'chalk';
import { Box, Text } from 'ink';
import React from 'react';
import { agents, detectInstalledAgents } from '../../agents.js';
import {
  type InstalledSkill,
  findSkillInstallations,
  listSkillsForAgent,
} from '../../installed-skills.js';
import { getCanonicalPath } from '../../installer.js';
import { removeSkillFromLock } from '../../skill-lock.js';
import type { AgentType } from '../../types.js';
import { useNavigation } from '../context/navigation.js';
import { MultiSelect } from '../controls/MultiSelect.js';
import { SelectMenu } from '../controls/SelectMenu.js';
import { Header } from '../ui/Header.js';
import { BACK_QUIT_HINT } from '../ui/hints.js';

type AgentSummary = { agent: AgentType; skills: InstalledSkill[] };

export function ManageScreen() {
  const { navigateTo, setFlash, setBackHandler } = useNavigation();
  const [summaries, setSummaries] = React.useState<AgentSummary[]>([]);
  const [selectedAgent, setSelectedAgent] = React.useState<AgentSummary | null>(null);
  const [selectedSkills, setSelectedSkills] = React.useState<InstalledSkill[] | null>(null);
  const [isRemoving, setIsRemoving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const installedAgents = await detectInstalledAgents();
      if (installedAgents.length === 0) {
        setFlash('No coding agents detected on this machine.');
        return;
      }
      const next: AgentSummary[] = [];
      for (const agent of installedAgents) {
        const projectSkills = await listSkillsForAgent(agent, 'project');
        const globalSkills = await listSkillsForAgent(agent, 'global');
        next.push({ agent, skills: [...projectSkills, ...globalSkills] });
      }
      if (cancelled) return;
      setSummaries(next.filter((summary) => summary.skills.length > 0));
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [setFlash]);

  React.useEffect(() => {
    if (isRemoving) {
      setBackHandler(() => true);
      return () => setBackHandler(null);
    }
    if (selectedSkills) {
      setBackHandler(() => {
        setSelectedSkills(null);
        return true;
      });
      return () => setBackHandler(null);
    }
    if (selectedAgent) {
      setBackHandler(() => {
        setSelectedAgent(null);
        return true;
      });
      return () => setBackHandler(null);
    }
    setBackHandler(null);
    return () => setBackHandler(null);
  }, [isRemoving, selectedSkills, selectedAgent, setBackHandler]);

  if (summaries.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Remove skills" />
        <Text dimColor>No skills found yet.</Text>
        <Text dimColor>{BACK_QUIT_HINT}</Text>
      </Box>
    );
  }

  if (!selectedAgent) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Select agent" />
        <SelectMenu
          items={summaries.map((summary) => ({
            value: summary.agent,
            label: agents[summary.agent].displayName,
            hint: `${summary.skills.length} skill${summary.skills.length !== 1 ? 's' : ''}`,
          }))}
          onSelect={(item) => {
            const match = summaries.find((summary) => summary.agent === item.value);
            if (match) setSelectedAgent(match);
          }}
        />
      </Box>
    );
  }

  if (!selectedSkills) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title={`Remove skills (${agents[selectedAgent.agent].displayName})`} />
        <MultiSelect
          items={selectedAgent.skills.map((skill) => ({
            value: skill,
            label: formatSkillLabel(skill),
            hint: skill.scope,
          }))}
          onSubmit={(values) => {
            if (values.length === 0) {
              setFlash('Select at least one skill.');
              return;
            }
            setSelectedSkills(values);
          }}
        />
      </Box>
    );
  }

  if (isRemoving) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Removing skills" />
        <Text>Removing selected skills...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Confirm removal" />
      {selectedSkills.map((skill) => (
        <Text key={`${skill.slug}-${skill.scope}`}>
          {formatSkillLabel(skill)} {chalk.dim(`(${skill.scope})`)}
        </Text>
      ))}
      <SelectMenu
        items={[
          {
            label: `Remove ${selectedSkills.length} skill${selectedSkills.length !== 1 ? 's' : ''}`,
            value: 'remove',
          },
          { label: 'Cancel', value: 'cancel' },
        ]}
        showDivider={false}
        onSelect={async (item) => {
          if (item.value === 'cancel') {
            setSelectedSkills(null);
            return;
          }
          setIsRemoving(true);
          const failures: string[] = [];
          for (const skill of selectedSkills) {
            try {
              await rm(skill.path, { recursive: true, force: true });
              const remaining = await findSkillInstallations(skill.slug, skill.scope);
              if (remaining.length === 0) {
                const canonicalPath = getCanonicalPath(skill.slug, {
                  global: skill.scope === 'global',
                });
                await rm(canonicalPath, { recursive: true, force: true });
                await removeSkillFromLock(skill.name, { global: skill.scope === 'global' });
              }
            } catch (error) {
              failures.push(skill.name);
              setFlash(
                `Could not remove ${skill.name}: ${error instanceof Error ? error.message : 'unknown error'}`
              );
            }
          }
          setIsRemoving(false);
          if (failures.length > 0) {
            setFlash(
              `Removed ${selectedSkills.length - failures.length}, ${failures.length} failed`
            );
          } else {
            setFlash(
              `Removed ${selectedSkills.length} skill${selectedSkills.length !== 1 ? 's' : ''}`
            );
          }
          setSelectedSkills(null);
          setSelectedAgent(null);
          navigateTo('main');
        }}
      />
    </Box>
  );
}

function formatSkillLabel(skill: InstalledSkill): string {
  const base = skill.name;
  if (skill.name !== skill.slug) {
    return `${base} ${chalk.dim(`(${skill.slug})`)}`;
  }
  return base;
}
