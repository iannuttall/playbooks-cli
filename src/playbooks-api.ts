import type { FindSkillMode, FindSkillResult } from './tui/types.js';

const API_BASE = process.env.PLAYBOOKS_API_URL?.trim() || 'https://playbooks.com/api';
const USER_AGENT = 'playbooks-cli';

type SkillsResponse = {
  success: boolean;
  data?: FindSkillResult[];
  error?: string;
};

type UrlMarkdownReport = {
  strategy: string;
  trimmedLength: number;
  isSparse: boolean;
  wasHeadless: boolean;
};

export type UrlMarkdownResult = {
  markdown: string;
  title: string;
  description?: string;
  finalUrl: string;
  report: UrlMarkdownReport;
};

type UrlMarkdownResponse = {
  success: boolean;
  data?: UrlMarkdownResult;
  queued?: boolean;
  pending?: boolean;
  jobId?: string;
  error?: string;
};

export async function searchSkills(
  query: string,
  mode: FindSkillMode,
  limit = 10
): Promise<FindSkillResult[]> {
  const url = new URL(`${API_BASE}/skills`);
  url.searchParams.set('search', query);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('mode', mode);

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });

  let payload: SkillsResponse | null = null;
  try {
    payload = (await response.json()) as SkillsResponse;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    const message = payload?.error || `Search failed (${response.status})`;
    throw new Error(message);
  }

  return Array.isArray(payload.data) ? payload.data : [];
}

async function requestUrlMarkdown(url: string): Promise<UrlMarkdownResponse> {
  const endpoint = new URL(`${API_BASE}/url`);
  const response = await fetch(endpoint.toString(), {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });

  let payload: UrlMarkdownResponse | null = null;
  try {
    payload = (await response.json()) as UrlMarkdownResponse;
  } catch {
    payload = null;
  }

  if (!response.ok && response.status !== 202) {
    const message = payload?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload ?? { success: false, error: `Request failed (${response.status})` };
}

async function pollUrlMarkdown(jobId: string, timeoutMs = 60_000, pollIntervalMs = 1_000) {
  const endpoint = new URL(`${API_BASE}/url`);
  endpoint.searchParams.set('jobId', jobId);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(endpoint.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    let payload: UrlMarkdownResponse | null = null;
    try {
      payload = (await response.json()) as UrlMarkdownResponse;
    } catch {
      payload = null;
    }

    if (payload?.success && payload.data) {
      return payload.data;
    }

    if (payload?.success && payload.pending) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      continue;
    }

    const message = payload?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  throw new Error('Timed out waiting for markdown');
}

export async function fetchUrlMarkdown(url: string): Promise<UrlMarkdownResult> {
  const response = await requestUrlMarkdown(url);

  if (response.success && response.data) {
    return response.data;
  }

  if (response.jobId) {
    return await pollUrlMarkdown(response.jobId);
  }

  const message = response.error || 'Failed to fetch markdown';
  throw new Error(message);
}
