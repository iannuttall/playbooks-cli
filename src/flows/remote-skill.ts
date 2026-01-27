import type { MarketplaceSkillOrigin } from '../commands/types.js';
import { fetchMintlifySkill } from '../mintlify.js';
import { getProviders } from '../providers/index.js';
import type { RemoteSkill } from '../types.js';

export type ResolvedRemoteSkill = {
  remoteSkill: RemoteSkill;
  origin: MarketplaceSkillOrigin;
  providerLabel: string;
};

export async function resolveRemoteSkill(url: string): Promise<ResolvedRemoteSkill | null> {
  const providers = getProviders();

  for (const provider of providers) {
    const match = provider.match(url);
    if (!match.matches) continue;

    const skill = await provider.fetchSkill(url);
    if (!skill) continue;

    const remoteSkill: RemoteSkill = {
      name: skill.name,
      description: skill.description,
      content: skill.content,
      installName: skill.installName,
      sourceUrl: skill.sourceUrl,
      providerId: provider.id,
      sourceIdentifier: provider.getSourceIdentifier(url),
      metadata: skill.metadata,
    };

    return {
      remoteSkill,
      providerLabel: provider.displayName,
      origin: {
        source: remoteSkill.sourceIdentifier,
        sourceType: provider.id as MarketplaceSkillOrigin['sourceType'],
        sourceUrl: url,
        skillPath: 'SKILL.md',
      },
    };
  }

  const legacy = await fetchMintlifySkill(url);
  if (!legacy) return null;

  const remoteSkill: RemoteSkill = {
    name: legacy.name,
    description: legacy.description,
    content: legacy.content,
    installName: legacy.mintlifySite,
    sourceUrl: legacy.sourceUrl,
    providerId: 'mintlify',
    sourceIdentifier: legacy.sourceUrl,
    metadata: {},
  };

  return {
    remoteSkill,
    providerLabel: 'Mintlify',
    origin: {
      source: 'mintlify/skills',
      sourceType: 'mintlify',
      sourceUrl: url,
      skillPath: 'SKILL.md',
    },
  };
}
