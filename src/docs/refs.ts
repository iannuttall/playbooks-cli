import type { DocSource } from './types.js';

export type RefOption = {
  label: string;
  ref: string;
  type: 'branch' | 'tag';
};

export type RepoRefs = {
  defaultBranch: string;
  branches: string[];
  tags: string[];
};

const TAG_LIMIT = 30;
const BRANCH_LIMIT = 30;
const PRERELEASE_MARKERS = ['alpha', 'beta', 'rc', 'nightly', 'canary', 'dev', 'preview'];

function parseGitHubOwnerRepo(source: DocSource): { owner: string; repo: string } | null {
  const urlMatch = source.url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git|\/|$)/i);
  if (urlMatch?.[1] && urlMatch?.[2]) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }
  const nameMatch = source.name.match(/^([^/]+)\/([^/]+)$/);
  if (nameMatch?.[1] && nameMatch?.[2]) {
    return { owner: nameMatch[1], repo: nameMatch[2] };
  }
  return null;
}

function parseSemver(value: string): { major: number; minor: number; patch: number } | null {
  const match = value.match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
  if (!match) return null;
  return {
    major: Number(match[1] ?? 0),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
  };
}

function sortTags(tags: string[]): string[] {
  const unique = Array.from(new Set(tags));
  return unique.sort((a, b) => {
    const semA = parseSemver(a);
    const semB = parseSemver(b);
    if (semA && semB) {
      if (semA.major !== semB.major) return semB.major - semA.major;
      if (semA.minor !== semB.minor) return semB.minor - semA.minor;
      if (semA.patch !== semB.patch) return semB.patch - semA.patch;
      return b.localeCompare(a);
    }
    if (semA) return -1;
    if (semB) return 1;
    return b.localeCompare(a);
  });
}

function isPrerelease(value: string): boolean {
  const lower = value.toLowerCase();
  return PRERELEASE_MARKERS.some((marker) => lower.includes(marker));
}

export async function fetchRepoRefs(source: DocSource): Promise<RepoRefs | null> {
  const parsed = parseGitHubOwnerRepo(source);
  if (!parsed) return null;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'playbooks-cli',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  let defaultBranch = 'main';
  try {
    const repoResponse = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
      { headers }
    );
    if (repoResponse.ok) {
      const data = (await repoResponse.json()) as { default_branch?: string };
      if (data.default_branch) {
        defaultBranch = data.default_branch;
      }
    }
  } catch {
    // fallback to main
  }

  let branches: string[] = [];
  let tags: string[] = [];

  try {
    const [branchesResponse, tagsResponse] = await Promise.all([
      fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/branches?per_page=100`, {
        headers,
      }),
      fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/tags?per_page=100`, {
        headers,
      }),
    ]);

    if (branchesResponse.ok) {
      const data = (await branchesResponse.json()) as Array<{ name?: string }>;
      branches = data.map((item) => item.name).filter((value): value is string => Boolean(value));
    }

    if (tagsResponse.ok) {
      const data = (await tagsResponse.json()) as Array<{ name?: string }>;
      tags = data.map((item) => item.name).filter((value): value is string => Boolean(value));
    }
  } catch {
    // ignore
  }

  return { defaultBranch, branches, tags };
}

export function buildRefOptions(
  refs: RepoRefs,
  includePrerelease: boolean
): { options: RefOption[]; note?: string } {
  const options: RefOption[] = [];
  const branchSet = new Set(refs.branches);
  branchSet.add(refs.defaultBranch);

  const sortedTags = sortTags(refs.tags);
  const stableTags = includePrerelease
    ? sortedTags
    : sortedTags.filter((tag) => !isPrerelease(tag));

  const filteredBranches = includePrerelease
    ? Array.from(branchSet)
    : Array.from(branchSet).filter((branch) => !isPrerelease(branch));

  const limitedTags = stableTags.slice(0, TAG_LIMIT);
  const limitedBranches = filteredBranches
    .filter((branch) => branch !== refs.defaultBranch)
    .sort()
    .slice(0, BRANCH_LIMIT);

  options.push({
    label: `default branch (${refs.defaultBranch})`,
    ref: refs.defaultBranch,
    type: 'branch',
  });

  for (const tag of limitedTags) {
    options.push({ label: `tag: ${tag}`, ref: tag, type: 'tag' });
  }

  for (const branch of limitedBranches) {
    options.push({ label: `branch: ${branch}`, ref: branch, type: 'branch' });
  }

  const extraTags = Math.max(0, stableTags.length - limitedTags.length);
  const extraBranches = Math.max(0, filteredBranches.length - 1 - limitedBranches.length);
  let note = '';
  if (extraTags > 0) {
    note += `Showing ${limitedTags.length} tags (${extraTags} more). `;
  }
  if (extraBranches > 0) {
    note += `Showing ${limitedBranches.length} branches (${extraBranches} more).`;
  }
  return { options, note: note.trim() || undefined };
}
