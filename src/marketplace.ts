import { readFile } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { dirname, join, posix } from 'path';

export interface MarketplaceContext {
  kind: 'local' | 'github' | 'gitlab' | 'url';
  baseDir?: string;
  baseUrl?: string;
  gh?: { owner: string; repo: string; ref: string; basePath: string };
  gl?: { namespacePath: string; repo: string; ref: string; basePath: string };
}

export interface MarketplacePlugin {
  name: string;
  description: string;
  source?: unknown;
  pluginRoot?: string;
  overrides?: {
    commands?: unknown;
    agents?: unknown;
    skills?: unknown;
    hooks?: unknown;
    mcpServers?: unknown;
  };
}

export interface ResolvedPluginSource {
  kind: 'local' | 'github' | 'gitlab' | 'unsupported';
  localDir?: string;
  github?: { owner: string; repo: string; ref: string; path: string };
  gitlab?: { namespacePath: string; repo: string; ref: string; path: string };
  overrides?: MarketplacePlugin['overrides'];
  reason?: string;
}

function isUrl(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

function isOwnerRepoShorthand(input: string): boolean {
  return /^[^/]+\/[^/]+$/.test(input);
}

function parseGitRepoUrl(
  input: string
): { provider: 'github' | 'gitlab'; owner?: string; repo: string; namespacePath?: string } | null {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    let pathname = url.pathname.replace(/\.git$/i, '').replace(/\/$/, '');
    const parts = pathname.split('/').filter(Boolean);
    if (!parts.length) return null;
    if (host === 'github.com') {
      const owner = parts[0];
      const repo = parts[1];
      if (!owner || !repo) return null;
      return { provider: 'github', owner, repo };
    }
    if (host === 'gitlab.com') {
      if (parts.length < 2) return null;
      const namespacePath = parts.join('/');
      const repo = parts[parts.length - 1]!;
      return { provider: 'gitlab', namespacePath, repo };
    }
    return null;
  } catch {
    return null;
  }
}

function parseGitHubRawMarketplaceUrl(
  input: string
): { owner: string; repo: string; ref: string; filePath: string } | null {
  try {
    const url = new URL(input);
    if (url.hostname !== 'raw.githubusercontent.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 4) return null;
    const [owner, repo, ref, ...pathParts] = parts;
    const filePath = pathParts.join('/');
    if (!filePath.endsWith('marketplace.json')) return null;
    return { owner, repo, ref, filePath };
  } catch {
    return null;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return await response.json();
}

export function isMarketplaceInput(input: string): boolean {
  return input.toLowerCase().endsWith('marketplace.json');
}

export function resolveLocalMarketplacePath(input: string): string | null {
  if (!existsSync(input)) return null;
  const stats = statSync(input);
  if (stats.isFile() && input.toLowerCase().endsWith('marketplace.json')) {
    return input;
  }
  if (stats.isDirectory()) {
    const candidate = join(input, '.claude-plugin', 'marketplace.json');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function isMarketplaceSource(input: string): boolean {
  return Boolean(resolveLocalMarketplacePath(input)) || isMarketplaceInput(input);
}

export async function loadMarketplace(
  input: string,
  ref?: string
): Promise<{ json: any; context: MarketplaceContext }> {
  if (!input) throw new Error('No marketplace input provided');

  // Local file or directory
  if (!isUrl(input) && !isOwnerRepoShorthand(input)) {
    const localPath = resolveLocalMarketplacePath(input);
    if (!localPath) {
      throw new Error('marketplace.json not found at path');
    }
    const content = await readFile(localPath, 'utf-8');
    const json = JSON.parse(content);
    return { json, context: { kind: 'local', baseDir: dirname(localPath) } };
  }

  // GitHub shorthand owner/repo
  if (isOwnerRepoShorthand(input)) {
    const [owner, repo] = input.split('/');
    const refsToTry = [ref, 'main', 'master'].filter(Boolean) as string[];
    let lastErr: unknown;
    for (const r of refsToTry) {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${r}/.claude-plugin/marketplace.json`;
      try {
        const json = await fetchJson(rawUrl);
        return { json, context: { kind: 'github', gh: { owner, repo, ref: r, basePath: '' } } };
      } catch (err) {
        lastErr = err;
      }
    }
    throw (lastErr as Error) || new Error('Failed to load marketplace from GitHub shorthand');
  }

  // URL
  if (isUrl(input)) {
    const parsedRaw = parseGitHubRawMarketplaceUrl(input);
    if (parsedRaw) {
      const json = await fetchJson(input);
      const basePath = parsedRaw.filePath ? posix.dirname(parsedRaw.filePath) : '';
      return {
        json,
        context: {
          kind: 'github',
          gh: { owner: parsedRaw.owner, repo: parsedRaw.repo, ref: parsedRaw.ref, basePath },
        },
      };
    }

    const gitRepo = parseGitRepoUrl(input);
    if (gitRepo && gitRepo.provider === 'github' && gitRepo.owner) {
      const refsToTry = [ref, 'main', 'master'].filter(Boolean) as string[];
      let lastErr: unknown;
      for (const r of refsToTry) {
        const rawUrl = `https://raw.githubusercontent.com/${gitRepo.owner}/${gitRepo.repo}/${r}/.claude-plugin/marketplace.json`;
        try {
          const json = await fetchJson(rawUrl);
          return {
            json,
            context: {
              kind: 'github',
              gh: { owner: gitRepo.owner, repo: gitRepo.repo, ref: r, basePath: '' },
            },
          };
        } catch (err) {
          lastErr = err;
        }
      }
      throw (lastErr as Error) || new Error('Failed to load marketplace from GitHub URL');
    }

    if (gitRepo && gitRepo.provider === 'gitlab' && gitRepo.namespacePath) {
      const refsToTry = [ref, 'main', 'master'].filter(Boolean) as string[];
      let lastErr: unknown;
      for (const r of refsToTry) {
        const rawUrl = `https://gitlab.com/${gitRepo.namespacePath}/-/raw/${encodeURIComponent(r)}/.claude-plugin/marketplace.json`;
        try {
          const json = await fetchJson(rawUrl);
          return {
            json,
            context: {
              kind: 'gitlab',
              gl: {
                namespacePath: gitRepo.namespacePath,
                repo: gitRepo.repo,
                ref: r,
                basePath: '',
              },
            },
          };
        } catch (err) {
          lastErr = err;
        }
      }
      throw (lastErr as Error) || new Error('Failed to load marketplace from GitLab URL');
    }

    // Generic URL to marketplace.json
    const json = await fetchJson(input);
    return { json, context: { kind: 'url', baseUrl: input.replace(/\/marketplace\.json$/i, '') } };
  }

  throw new Error('Unsupported marketplace input');
}

export function normalizePlugins(json: any): MarketplacePlugin[] {
  const plugins = Array.isArray(json?.plugins) ? json.plugins : [];
  const pluginRoot = json?.pluginRoot || json?.metadata?.pluginRoot || '';
  return plugins
    .map((plugin: any) => ({
      name: plugin.name,
      description: plugin.description || '',
      source: plugin.source ?? plugin.repository ?? plugin.repo ?? plugin,
      pluginRoot: plugin.pluginRoot || pluginRoot || '',
      overrides: {
        commands: plugin.commands,
        agents: plugin.agents,
        skills: plugin.skills,
        hooks: plugin.hooks,
        mcpServers: plugin.mcpServers,
      },
    }))
    .filter((plugin: MarketplacePlugin) => !!plugin.name);
}

export function resolvePluginSource(
  plugin: MarketplacePlugin,
  context: MarketplaceContext
): ResolvedPluginSource {
  const overrides = plugin.overrides || {};
  const pluginRoot = plugin.pluginRoot || '';
  const src = plugin.source;

  if (typeof src === 'string') {
    if (context.kind === 'local' && context.baseDir) {
      const base = join(context.baseDir, pluginRoot);
      return { kind: 'local', localDir: join(base, src), overrides };
    }
    if (context.kind === 'github' && context.gh) {
      const basePath = posix.join(context.gh.basePath || '', pluginRoot || '');
      const full = posix.join(basePath, src);
      return { kind: 'github', github: { ...context.gh, path: full }, overrides };
    }
    if (context.kind === 'gitlab' && context.gl) {
      const basePath = posix.join(context.gl.basePath || '', pluginRoot || '');
      const full = posix.join(basePath, src);
      return { kind: 'gitlab', gitlab: { ...context.gl, path: full }, overrides };
    }
    return { kind: 'unsupported', reason: 'Unsupported URL marketplace source', overrides };
  }

  if (src && typeof src === 'object') {
    const type = String((src as any).source || (src as any).type || '').toLowerCase();
    if (type === 'github') {
      const repo = (src as any).repo || (src as any).repository;
      if (!repo) return { kind: 'unsupported', reason: 'Missing GitHub repo', overrides };
      const [owner, repoName] = repo.split('/');
      const ref = (src as any).ref || context.gh?.ref || 'main';
      const basePath = (src as any).path || '';
      return { kind: 'github', github: { owner, repo: repoName, ref, path: basePath }, overrides };
    }
    if (type === 'gitlab') {
      const repo = (src as any).repo || (src as any).repository;
      if (!repo) return { kind: 'unsupported', reason: 'Missing GitLab repo', overrides };
      const namespacePath = repo;
      const ref = (src as any).ref || context.gl?.ref || 'main';
      const basePath = (src as any).path || '';
      return {
        kind: 'gitlab',
        gitlab: { namespacePath, repo: repo.split('/').pop()!, ref, path: basePath },
        overrides,
      };
    }
    if (type === 'git' || type === 'url') {
      const url = (src as any).url || (src as any).href || '';
      const repoInfo = parseGitRepoUrl(url);
      if (repoInfo?.provider === 'github' && repoInfo.owner) {
        const ref = (src as any).ref || context.gh?.ref || 'main';
        const basePath = (src as any).path || '';
        return {
          kind: 'github',
          github: { owner: repoInfo.owner, repo: repoInfo.repo, ref, path: basePath },
          overrides,
        };
      }
      if (repoInfo?.provider === 'gitlab' && repoInfo.namespacePath) {
        const ref = (src as any).ref || context.gl?.ref || 'main';
        const basePath = (src as any).path || '';
        return {
          kind: 'gitlab',
          gitlab: {
            namespacePath: repoInfo.namespacePath,
            repo: repoInfo.repo,
            ref,
            path: basePath,
          },
          overrides,
        };
      }
      return { kind: 'unsupported', reason: 'Unsupported git/url provider', overrides };
    }
  }

  return { kind: 'unsupported', reason: 'Unknown source type', overrides };
}
