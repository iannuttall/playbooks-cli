import matter from 'gray-matter';
import type { HostProvider, ProviderMatch, RemoteSkill } from './types.js';

export interface WellKnownIndex {
  skills: WellKnownSkillEntry[];
}

export interface WellKnownSkillEntry {
  name: string;
  description: string;
  files: string[];
}

export interface WellKnownSkill extends RemoteSkill {
  files: Map<string, string>;
  indexEntry: WellKnownSkillEntry;
}

export class WellKnownProvider implements HostProvider {
  readonly id = 'well-known';
  readonly displayName = 'Well-Known Skills';

  private readonly WELL_KNOWN_PATH = '.well-known/skills';
  private readonly INDEX_FILE = 'index.json';

  match(url: string): ProviderMatch {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { matches: false };
    }

    if (!url.includes(`/${this.WELL_KNOWN_PATH}/`)) {
      return { matches: false };
    }

    return { matches: true, sourceIdentifier: this.getSourceIdentifier(url) };
  }

  async fetchIndex(
    baseUrl: string
  ): Promise<{ index: WellKnownIndex; resolvedBaseUrl: string } | null> {
    try {
      const parsed = new URL(baseUrl);
      const basePath = parsed.pathname.replace(/\/$/, '');

      const urlsToTry: { indexUrl: string; baseUrl: string }[] = [
        {
          indexUrl: `${parsed.protocol}//${parsed.host}${basePath}/${this.WELL_KNOWN_PATH}/${this.INDEX_FILE}`,
          baseUrl: `${parsed.protocol}//${parsed.host}${basePath}`,
        },
      ];

      if (basePath && basePath !== '') {
        urlsToTry.push({
          indexUrl: `${parsed.protocol}//${parsed.host}/${this.WELL_KNOWN_PATH}/${this.INDEX_FILE}`,
          baseUrl: `${parsed.protocol}//${parsed.host}`,
        });
      }

      for (const { indexUrl, baseUrl: resolvedBase } of urlsToTry) {
        try {
          const response = await fetch(indexUrl);
          if (!response.ok) {
            continue;
          }

          const index = (await response.json()) as WellKnownIndex;
          if (!index.skills || !Array.isArray(index.skills)) {
            continue;
          }

          let allValid = true;
          for (const entry of index.skills) {
            if (!this.isValidSkillEntry(entry)) {
              allValid = false;
              break;
            }
          }

          if (allValid) {
            return { index, resolvedBaseUrl: resolvedBase };
          }
        } catch {
          // Try next URL
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private isValidSkillEntry(entry: unknown): entry is WellKnownSkillEntry {
    if (!entry || typeof entry !== 'object') return false;

    const e = entry as Record<string, unknown>;
    if (typeof e.name !== 'string' || !e.name) return false;
    if (typeof e.description !== 'string' || !e.description) return false;
    if (!Array.isArray(e.files) || e.files.length === 0) return false;

    const nameRegex = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;
    if (!nameRegex.test(e.name) && e.name.length > 1) {
      if (e.name.length === 1 && !/^[a-z0-9]$/.test(e.name)) {
        return false;
      }
    }

    for (const file of e.files) {
      if (typeof file !== 'string') return false;
      if (file.startsWith('/') || file.startsWith('\\') || file.includes('..')) return false;
    }

    const hasSkillMd = e.files.some((f) => typeof f === 'string' && f.toLowerCase() === 'skill.md');
    if (!hasSkillMd) return false;

    return true;
  }

  async fetchSkill(url: string): Promise<RemoteSkill | null> {
    try {
      const parsed = new URL(url);
      const skillMatch = parsed.pathname.match(/^(.*)\/\.well-known\/skills\/([^/]+)\/SKILL\.md$/i);

      if (skillMatch) {
        const baseUrl = `${parsed.protocol}//${parsed.host}${skillMatch[1] || ''}`;
        const skillName = skillMatch[2];
        const result = await this.fetchIndex(baseUrl);
        if (result) {
          const entry = result.index.skills.find((s) => s.name === skillName);
          if (entry) {
            const fetched = await this.fetchSkillByEntry(result.resolvedBaseUrl, entry);
            if (fetched) {
              return fetched;
            }
          }
        }
      }

      const result = await this.fetchIndex(url);
      if (!result) {
        return null;
      }

      const { index, resolvedBaseUrl } = result;
      let skillName: string | null = null;
      const pathMatch = parsed.pathname.match(/\/.well-known\/skills\/([^/]+)\/?$/);
      if (pathMatch?.[1] && pathMatch[1] !== 'index.json') {
        skillName = pathMatch[1];
      } else if (index.skills.length === 1) {
        skillName = index.skills[0]?.name ?? null;
      }

      if (!skillName) {
        return null;
      }

      const skillEntry = index.skills.find((s) => s.name === skillName);
      if (!skillEntry) {
        return null;
      }

      return await this.fetchSkillByEntry(resolvedBaseUrl, skillEntry);
    } catch {
      return null;
    }
  }

  async fetchSkillByEntry(
    baseUrl: string,
    entry: WellKnownSkillEntry
  ): Promise<WellKnownSkill | null> {
    try {
      const skillBaseUrl = `${baseUrl.replace(/\/$/, '')}/${this.WELL_KNOWN_PATH}/${entry.name}`;
      const skillMdUrl = `${skillBaseUrl}/SKILL.md`;
      const response = await fetch(skillMdUrl);
      if (!response.ok) {
        return null;
      }

      const content = await response.text();
      const { data } = matter(content);

      if (!data.name || !data.description) {
        return null;
      }

      const files = new Map<string, string>();
      files.set('SKILL.md', content);

      const otherFiles = entry.files.filter((f) => f.toLowerCase() !== 'skill.md');
      const filePromises = otherFiles.map(async (filePath) => {
        try {
          const fileUrl = `${skillBaseUrl}/${filePath}`;
          const fileResponse = await fetch(fileUrl);
          if (fileResponse.ok) {
            const fileContent = await fileResponse.text();
            return { path: filePath, content: fileContent };
          }
        } catch {
          return null;
        }
        return null;
      });

      const fileResults = await Promise.all(filePromises);
      for (const result of fileResults) {
        if (result) {
          files.set(result.path, result.content);
        }
      }

      return {
        name: data.name,
        description: data.description,
        content,
        installName: entry.name,
        sourceUrl: skillMdUrl,
        metadata: data.metadata,
        files,
        indexEntry: entry,
      };
    } catch {
      return null;
    }
  }

  async fetchAllSkills(url: string): Promise<WellKnownSkill[]> {
    try {
      const result = await this.fetchIndex(url);
      if (!result) {
        return [];
      }

      const { index, resolvedBaseUrl } = result;
      const skillPromises = index.skills.map((entry) =>
        this.fetchSkillByEntry(resolvedBaseUrl, entry)
      );
      const results = await Promise.all(skillPromises);
      return results.filter((skill): skill is WellKnownSkill => Boolean(skill));
    } catch {
      return [];
    }
  }

  toRawUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (url.toLowerCase().endsWith('/skill.md')) {
        return url;
      }

      const pathMatch = parsed.pathname.match(/\/.well-known\/skills\/([^/]+)\/?$/);
      if (pathMatch?.[1]) {
        const basePath = parsed.pathname.replace(/\/.well-known\/skills\/.*$/, '');
        return `${parsed.protocol}//${parsed.host}${basePath}/${this.WELL_KNOWN_PATH}/${pathMatch[1]}/SKILL.md`;
      }

      const basePath = parsed.pathname.replace(/\/$/, '');
      return `${parsed.protocol}//${parsed.host}${basePath}/${this.WELL_KNOWN_PATH}/${this.INDEX_FILE}`;
    } catch {
      return url;
    }
  }

  getSourceIdentifier(url: string): string {
    try {
      const parsed = new URL(url);
      const hostParts = parsed.hostname.split('.');

      if (hostParts.length >= 2) {
        const tld = hostParts[hostParts.length - 1];
        const sld = hostParts[hostParts.length - 2];
        return `${sld}/${tld}`;
      }

      return parsed.hostname.replace('.', '/');
    } catch {
      return 'unknown/unknown';
    }
  }
}

export const wellKnownProvider = new WellKnownProvider();
