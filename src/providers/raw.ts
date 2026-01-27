import matter from 'gray-matter';
import type { HostProvider, ProviderMatch, RemoteSkill } from './types.js';

export class RawSkillProvider implements HostProvider {
  readonly id = 'raw';
  readonly displayName = 'Direct URL';

  match(url: string): ProviderMatch {
    if (!/^https?:\/\//.test(url)) {
      return { matches: false };
    }

    if (!url.toLowerCase().endsWith('/skill.md')) {
      return { matches: false };
    }

    return { matches: true, sourceIdentifier: this.getSourceIdentifier(url) };
  }

  async fetchSkill(url: string): Promise<RemoteSkill | null> {
    try {
      const response = await fetch(this.toRawUrl(url));
      if (!response.ok) {
        return null;
      }

      const content = await response.text();
      const { data } = matter(content);

      if (!data.name || !data.description) {
        return null;
      }

      return {
        name: data.name,
        description: data.description,
        content,
        installName: data.name,
        sourceUrl: url,
        metadata: data.metadata,
      };
    } catch {
      return null;
    }
  }

  toRawUrl(url: string): string {
    return url;
  }

  getSourceIdentifier(url: string): string {
    try {
      const parsed = new URL(url);
      return `raw/${parsed.hostname}${parsed.pathname}`;
    } catch {
      return `raw/${url}`;
    }
  }
}

export const rawSkillProvider = new RawSkillProvider();
