import type {
  AddSkillOptions,
  MarketplaceSkill,
  MarketplaceSkillOrigin,
} from '../commands/types.js';
import type { InstallResult } from '../flows/install-summary.js';
import type { MarketplaceContext, MarketplacePlugin } from '../marketplace.js';
import type { AgentType, ParsedSource, Skill } from '../types.js';

export type Screen =
  | 'main'
  | 'add-source'
  | 'add-marketplace-plugins'
  | 'add-marketplace-skills'
  | 'get-url'
  | 'find-skill-search'
  | 'find-skill-results'
  | 'add-skill-select'
  | 'add-targets'
  | 'add-scope'
  | 'add-mode'
  | 'add-confirm'
  | 'add-install'
  | 'add-result'
  | 'list'
  | 'manage'
  | 'update';

export type CliIntent =
  | 'none'
  | 'add-skill'
  | 'skill'
  | 'find-skill'
  | 'get-url'
  | 'list'
  | 'manage'
  | 'update';

export type CliInvocation = {
  intent: CliIntent;
  source?: string;
  options: AddSkillOptions & { project?: boolean; json?: boolean; output?: string };
  updateSkillNames?: string[];
};

export type MarketplaceState = {
  context?: MarketplaceContext;
  plugins?: MarketplacePlugin[];
  selectedPlugins?: MarketplacePlugin[];
  skills?: MarketplaceSkill[];
  warnings?: string[];
};

export type AddSkillState = {
  source?: string;
  parsed?: ParsedSource;
  tempDir?: string | null;
  skills?: Skill[];
  selectedSkills?: Skill[];
  originBySkillName?: Map<string, MarketplaceSkillOrigin>;
  marketplace?: MarketplaceState;
  targetAgents?: AgentType[];
  installGlobally?: boolean;
  installMode?: 'symlink' | 'copy';
  planLines?: string[];
  installResults?: InstallResult[];
  installError?: string;
};

export type FindSkillMode = 'lexical' | 'semantic';

export type FindSkillResult = {
  id: number;
  name: string;
  description: string | null;
  shortDescription: string | null;
  repoOwner: string | null;
  repoName: string | null;
  path: string | null;
  skillSlug: string | null;
  primaryLanguage: string | null;
  stars: number | null;
  tags: string[] | null;
  isOfficial: boolean;
};

export type FindSkillState = {
  query?: string;
  mode?: FindSkillMode;
  status?: 'idle' | 'loading' | 'ready' | 'error';
  results?: FindSkillResult[];
  error?: string;
};
