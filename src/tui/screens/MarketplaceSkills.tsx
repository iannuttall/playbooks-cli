import { Box, Text } from 'ink';
import React from 'react';
import type { MarketplaceSkill } from '../../commands/types.js';
import { buildOriginMap, collectMarketplaceSkills } from '../../flows/marketplace.js';
import { getSkillDisplayName } from '../../skills.js';
import { useNavigation } from '../context/navigation.js';
import { MultiSelect } from '../controls/MultiSelect.js';
import { AddFlowHeader } from '../ui/AddFlowHeader.js';
import { BACK_QUIT_HINT } from '../ui/hints.js';
import { useSpinnerFrame } from '../ui/spinner.js';

type Status = 'loading' | 'ready' | 'error';

export function MarketplaceSkillScreen() {
  const { invocation, addSkill, updateAddSkill, navigateTo, setFlash } = useNavigation();
  const options = invocation.options;
  const [status, setStatus] = React.useState<Status>('loading');
  const [error, setError] = React.useState<string | null>(null);
  const spinner = useSpinnerFrame(status === 'loading');

  const selectedPlugins = addSkill.marketplace?.selectedPlugins ?? [];
  const context = addSkill.marketplace?.context;

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!context || selectedPlugins.length === 0) {
        navigateTo('add-marketplace-plugins');
        return;
      }

      if (addSkill.marketplace?.skills && addSkill.marketplace.skills.length > 0) {
        setStatus('ready');
        return;
      }

      setStatus('loading');
      try {
        const { skills, warnings } = await collectMarketplaceSkills(selectedPlugins, context);
        if (cancelled) return;

        updateAddSkill({
          marketplace: {
            ...addSkill.marketplace,
            skills,
            warnings,
          },
          skills: skills.map((entry) => entry.skill),
        });

        if (skills.length === 0) {
          setError('No skills found in selected plugins.');
          setStatus('error');
          return;
        }

        const auto = autoSelect(skills, options.skill, options.yes);
        if (auto.status === 'selected') {
          const selected = auto.skills;
          updateAddSkill({
            selectedSkills: selected.map((entry) => entry.skill),
            originBySkillName: buildOriginMap(selected),
          });
          navigateTo('add-targets');
          return;
        }

        if (auto.status === 'error') {
          setError(auto.message);
          setStatus('error');
          return;
        }

        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unable to scan marketplace plugins.');
        setStatus('error');
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [
    context,
    selectedPlugins,
    addSkill.marketplace,
    updateAddSkill,
    navigateTo,
    options.skill,
    options.yes,
  ]);

  if (status === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        <AddFlowHeader title="Scanning marketplace" />
        <Text>{spinner} Discovering skills from plugins...</Text>
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <AddFlowHeader title="Marketplace scan failed" />
        <Text color="red">{error}</Text>
        <Text dimColor>{BACK_QUIT_HINT}</Text>
      </Box>
    );
  }

  const skills = addSkill.marketplace?.skills ?? [];
  const warnings = addSkill.marketplace?.warnings ?? [];

  return (
    <Box flexDirection="column" padding={1}>
      <AddFlowHeader title="Select skills" />
      {warnings.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          {warnings.map((warning) => (
            <Text key={warning} dimColor>
              {warning}
            </Text>
          ))}
        </Box>
      ) : null}
      <MultiSelect
        items={skills.map((entry) => ({
          value: entry,
          label: getSkillDisplayName(entry.skill),
          hint:
            entry.skill.description && entry.skill.description.length > 60
              ? `${entry.skill.description.slice(0, 57)}...`
              : entry.skill.description,
        }))}
        onSubmit={(values) => {
          if (values.length === 0) {
            setFlash('Select at least one skill.');
            return;
          }
          updateAddSkill({
            selectedSkills: values.map((entry) => entry.skill),
            originBySkillName: buildOriginMap(values),
          });
          navigateTo('add-targets');
        }}
      />
    </Box>
  );
}

function autoSelect(skills: MarketplaceSkill[], names?: string[], yes?: boolean) {
  if (names && names.length > 0) {
    const selected = skills.filter((entry) =>
      names.some(
        (name) =>
          entry.skill.name.toLowerCase() === name.toLowerCase() ||
          getSkillDisplayName(entry.skill).toLowerCase() === name.toLowerCase()
      )
    );
    if (selected.length === 0) {
      return {
        status: 'error',
        message: `No matching skills found for: ${names.join(', ')}`,
      } as const;
    }
    return { status: 'selected', skills: selected } as const;
  }

  if (skills.length === 1) {
    return { status: 'selected', skills } as const;
  }

  if (yes) {
    return { status: 'selected', skills } as const;
  }

  return { status: 'prompt' } as const;
}
