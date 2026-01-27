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

export type CliIntent = 'none' | 'add-skill' | 'skill' | 'list' | 'manage' | 'update';

export type CliInvocation = {
  intent: CliIntent;
  source?: string;
  options: AddSkillOptions & { project?: boolean };
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
