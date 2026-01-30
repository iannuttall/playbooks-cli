import type { Skill } from '../types.js';

export interface AddSkillOptions {
  global?: boolean;
  agent?: string[];
  yes?: boolean;
  skill?: string[];
  list?: boolean;
  all?: boolean;
}

export type SkillSourceType =
  | 'github'
  | 'gitlab'
  | 'git'
  | 'local'
  | 'url'
  | 'mintlify'
  | 'huggingface'
  | 'raw'
  | 'well-known';

export interface MarketplaceSkillOrigin {
  sourceType: SkillSourceType;
  sourceUrl: string;
  source: string | null;
  ref?: string;
  skillPath?: string;
}

export interface MarketplaceSkill {
  skill: Skill;
  origin: MarketplaceSkillOrigin;
  pluginName: string;
}
