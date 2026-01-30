import { basename } from 'node:path';
import type { Skill } from '../../types.js';

function matchesSkillName(skill: Skill, input: string): boolean {
  const normalized = input.toLowerCase();
  const byName = skill.name.toLowerCase() === normalized;
  const byPath = basename(skill.path).toLowerCase() === normalized;
  return byName || byPath;
}

export function autoSelect(
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
