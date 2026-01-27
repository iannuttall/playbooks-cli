import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';

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

type JsonRecord = Record<string, unknown>;

function toRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
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
    const pathname = url.pathname.replace(/\.git$/i, '').replace(/\/$/, '');
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
      const repo = parts[parts.length - 1];
      if (!repo) return null;
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
    if (!owner || !repo || !ref) return null;
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
): Promise<{ json: unknown; context: MarketplaceContext }> {
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
    if (!owner || !repo) {
      throw new Error('Invalid GitHub shorthand (expected owner/repo)');
    }
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

export function normalizePlugins(json: unknown): MarketplacePlugin[] {
  const root = toRecord(json);
  const plugins = Array.isArray(root?.plugins) ? root?.plugins : [];
  const metadata = toRecord(root?.metadata);
  const pluginRoot = getString(root?.pluginRoot) ?? getString(metadata?.pluginRoot) ?? '';
  return plugins
    .map((plugin) => {
      const record = toRecord(plugin) ?? {};
      return {
        name: getString(record.name) ?? '',
        description: getString(record.description) ?? '',
        source: record.source ?? record.repository ?? record.repo ?? record,
        pluginRoot: getString(record.pluginRoot) ?? pluginRoot,
        overrides: {
          commands: record.commands,
          agents: record.agents,
          skills: record.skills,
          hooks: record.hooks,
          mcpServers: record.mcpServers,
        },
      };
    })
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

  const record = toRecord(src);
  if (record) {
    const type = String(getString(record.source) || getString(record.type) || '').toLowerCase();
    if (type === 'github') {
      const repo = getString(record.repo) || getString(record.repository);
      if (!repo) return { kind: 'unsupported', reason: 'Missing GitHub repo', overrides };
      const [owner, repoName] = repo.split('/');
      if (!owner || !repoName) {
        return { kind: 'unsupported', reason: 'Invalid GitHub repo format', overrides };
      }
      const ref = getString(record.ref) || context.gh?.ref || 'main';
      const basePath = getString(record.path) || '';
      return { kind: 'github', github: { owner, repo: repoName, ref, path: basePath }, overrides };
    }
    if (type === 'gitlab') {
      const repo = getString(record.repo) || getString(record.repository);
      if (!repo) return { kind: 'unsupported', reason: 'Missing GitLab repo', overrides };
      const namespacePath = repo;
      const ref = getString(record.ref) || context.gl?.ref || 'main';
      const basePath = getString(record.path) || '';
      const repoName = repo.split('/').pop();
      if (!repoName) return { kind: 'unsupported', reason: 'Missing GitLab repo', overrides };
      return {
        kind: 'gitlab',
        gitlab: { namespacePath, repo: repoName, ref, path: basePath },
        overrides,
      };
    }
    if (type === 'git' || type === 'url') {
      const url = getString(record.url) || getString(record.href) || '';
      const repoInfo = parseGitRepoUrl(url);
      if (repoInfo?.provider === 'github' && repoInfo.owner) {
        const ref = getString(record.ref) || context.gh?.ref || 'main';
        const basePath = getString(record.path) || '';
        return {
          kind: 'github',
          github: { owner: repoInfo.owner, repo: repoInfo.repo, ref, path: basePath },
          overrides,
        };
      }
      if (repoInfo?.provider === 'gitlab' && repoInfo.namespacePath) {
        const ref = getString(record.ref) || context.gl?.ref || 'main';
        const basePath = getString(record.path) || '';
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
