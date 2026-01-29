import type { FindSkillMode, FindSkillResult } from './tui/types.js';

const API_BASE = process.env.PLAYBOOKS_API_URL?.trim() || 'https://playbooks.com/api';
const USER_AGENT = 'playbooks-cli';

type SkillsResponse = {
  success: boolean;
  data?: FindSkillResult[];
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
