export type SkillStaticLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type SkillStaticVerdict = 'allow' | 'warn' | 'block';

export type SkillStaticDimension =
  | 'remote_exec'
  | 'exfiltration'
  | 'secret_access'
  | 'persistence'
  | 'destructive'
  | 'obfuscation';

export type SkillStaticScanFile = {
  path: string;
  content: string;
  size?: number | null;
};

export type SkillStaticSignal = {
  id: string;
  dimension: SkillStaticDimension;
  type:
    | 'download-and-run'
    | 'exfiltration'
    | 'secret-access'
    | 'persistence'
    | 'destructive'
    | 'obfuscation'
    | 'suspicious';
  severity: SkillStaticLevel;
  points: number;
  file: string;
  line: number | null;
  snippet: string;
  reason: string;
};

export type SkillStaticScanResult = {
  rulesetVersion: string;
  overall: {
    score: number;
    level: SkillStaticLevel;
    compatRiskLevel: 'low' | 'medium' | 'high';
    verdict: SkillStaticVerdict;
  };
  dimensions: Record<SkillStaticDimension, { score: number; level: SkillStaticLevel }>;
  signals: SkillStaticSignal[];
  stats: {
    filesProvided: number;
    filesScanned: number;
    filesSkipped: number;
    bytesScanned: number;
    truncated: boolean;
  };
};

export type SkillStaticScanOptions = {
  maxFiles?: number;
  maxTotalBytes?: number;
  maxFileBytes?: number;
  maxSignals?: number;
};

export const SKILL_STATIC_SCAN_RULESET_VERSION = 'static-scan@2026-02-07.5';

export const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

export const levelFromScore = (score: number): SkillStaticLevel => {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  if (score >= 10) return 'low';
  return 'none';
};

export const compatFromLevel = (level: SkillStaticLevel): 'low' | 'medium' | 'high' => {
  if (level === 'high' || level === 'critical') return 'high';
  if (level === 'medium') return 'medium';
  return 'low';
};

export const verdictFromLevel = (level: SkillStaticLevel): SkillStaticVerdict => {
  if (level === 'high' || level === 'critical') return 'block';
  if (level === 'medium') return 'warn';
  return 'allow';
};

export const isProbablyTextPath = (path: string) => {
  const lower = path.toLowerCase();
  const base = lower.split('/').pop() ?? lower;

  if (
    base === 'makefile' ||
    base === 'dockerfile' ||
    base === 'license' ||
    base === 'readme' ||
    base === 'readme.md'
  ) {
    return true;
  }

  return (
    lower.endsWith('.md') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.json') ||
    lower.endsWith('.yaml') ||
    lower.endsWith('.yml') ||
    lower.endsWith('.toml') ||
    lower.endsWith('.ini') ||
    lower.endsWith('.env') ||
    lower.endsWith('.sh') ||
    lower.endsWith('.bash') ||
    lower.endsWith('.zsh') ||
    lower.endsWith('.ps1') ||
    lower.endsWith('.py') ||
    lower.endsWith('.rb') ||
    lower.endsWith('.php') ||
    lower.endsWith('.go') ||
    lower.endsWith('.rs') ||
    lower.endsWith('.java') ||
    lower.endsWith('.ts') ||
    lower.endsWith('.mts') ||
    lower.endsWith('.cts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.js') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs')
  );
};

export const snippetFromIndex = (content: string, index: number, maxLen = 180) => {
  const start = Math.max(0, index - 60);
  const end = Math.min(content.length, index + maxLen);
  const raw = content.slice(start, end);
  return raw.replace(/\s+/g, ' ').trim();
};

export const prevNonWhitespaceChar = (content: string, index: number) => {
  for (let i = index; i >= 0; i -= 1) {
    const ch = content[i];
    if (!ch) return null;
    if (!/\s/.test(ch)) return ch;
  }
  return null;
};

export const lineFromIndex = (content: string, index: number) => {
  if (index <= 0) return 1;
  return content.slice(0, index).split('\n').length;
};

export const isDocLikePath = (path: string) => {
  const lower = path.toLowerCase();
  const base = lower.split('/').pop() ?? lower;
  if (lower.endsWith('.md')) return true;
  return (
    base === 'readme' ||
    base === 'license' ||
    base === 'contributing' ||
    base === 'changelog' ||
    base === 'code_of_conduct'
  );
};

export const isShellScriptPath = (path: string) => {
  const lower = path.toLowerCase();
  return (
    lower.endsWith('.sh') ||
    lower.endsWith('.bash') ||
    lower.endsWith('.zsh') ||
    lower.endsWith('.ps1')
  );
};

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
export const isIpHost = (host: string) => IPV4_RE.test(host);

const URL_RE = /\bhttps?:\/\/[^\s)'"`]+/i;
export const extractUrlNearIndex = (content: string, index: number) => {
  const start = Math.max(0, index - 120);
  const end = Math.min(content.length, index + 320);
  const window = content.slice(start, end);
  const m = URL_RE.exec(window);
  return m?.[0] ?? null;
};

export const getTrustedInstallerHosts = () => {
  const base = [
    'cursor.com',
    'astral.sh',
    'anthropic.com',
    'claude.ai',
    'deepmind.google',
    'factory.ai',
    'openai.com',
    'chatgpt.com',
    'mistral.ai',
    'cohere.com',
    'perplexity.ai',
    'meta.ai',
    'ai.meta.com',
    'x.ai',
  ] as const;
  const extra = (process.env.SKILL_SCANNER_TRUSTED_INSTALLER_HOSTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...base, ...extra]));
};

export const isTrustedHost = (hostname: string, trusted: string[]) => {
  const host = hostname.toLowerCase();
  return trusted.some((t) => host === t || host.endsWith(`.${t}`));
};

export type Rule = {
  id: string;
  dimension: SkillStaticDimension;
  type: SkillStaticSignal['type'];
  points: number;
  severity: SkillStaticLevel;
  regex: RegExp;
  reason: string;
};
