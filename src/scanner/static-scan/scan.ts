import { RULES } from './rules.js';
import {
  SKILL_STATIC_SCAN_RULESET_VERSION,
  type SkillStaticDimension,
  type SkillStaticScanFile,
  type SkillStaticScanOptions,
  type SkillStaticScanResult,
  type SkillStaticSignal,
  clamp,
  compatFromLevel,
  extractUrlNearIndex,
  getTrustedInstallerHosts,
  isDocLikePath,
  isIpHost,
  isProbablyTextPath,
  isShellScriptPath,
  isTrustedHost,
  levelFromScore,
  lineFromIndex,
  prevNonWhitespaceChar,
  snippetFromIndex,
  verdictFromLevel,
} from './shared.js';

export function scanSkillStatic(
  files: SkillStaticScanFile[],
  options: SkillStaticScanOptions = {}
): SkillStaticScanResult {
  const maxFiles = options.maxFiles ?? 120;
  const maxTotalBytes = options.maxTotalBytes ?? 1_200_000;
  const maxFileBytes = options.maxFileBytes ?? 160_000;
  const maxSignals = options.maxSignals ?? 25;

  let bytesScanned = 0;
  let filesScanned = 0;
  let filesSkipped = 0;
  let truncated = false;

  const dimensionScores: Record<SkillStaticDimension, number> = {
    remote_exec: 0,
    exfiltration: 0,
    secret_access: 0,
    persistence: 0,
    destructive: 0,
    obfuscation: 0,
  };

  const signals: SkillStaticSignal[] = [];
  const trustedInstallerHosts = getTrustedInstallerHosts();
  const scoreApplied = new Set<string>();

  const candidates = files.slice(0, maxFiles);
  if (files.length > candidates.length) truncated = true;

  for (const file of candidates) {
    if (signals.length >= maxSignals) {
      truncated = true;
      break;
    }

    if (!isProbablyTextPath(file.path)) {
      filesSkipped += 1;
      continue;
    }

    const content = typeof file.content === 'string' ? file.content : '';
    const size = file.size ?? content.length;
    if (size > maxFileBytes) {
      filesSkipped += 1;
      continue;
    }

    if (bytesScanned + size > maxTotalBytes) {
      truncated = true;
      break;
    }

    bytesScanned += size;
    filesScanned += 1;

    for (const rule of RULES) {
      if (signals.length >= maxSignals) {
        truncated = true;
        break;
      }

      rule.regex.lastIndex = 0;
      let match = rule.regex.exec(content);
      while (match) {
        if (
          rule.id === 'eval_exec' &&
          /^exec\s*\(/.test(match[0] ?? '') &&
          prevNonWhitespaceChar(content, (match.index ?? 0) - 1) === '.'
        ) {
          match = rule.regex.global ? rule.regex.exec(content) : null;
          continue;
        }
        break;
      }
      if (!match) continue;

      // Common false positive: loopback URLs (e.g. CDP on 127.0.0.1) should not be treated as suspicious.
      if (rule.id === 'ip_url') {
        const matchedUrl = match[0] ?? '';
        try {
          const parsed = new URL(matchedUrl);
          const host = parsed.hostname.toLowerCase();
          if (host === '0.0.0.0' || host === '127.0.0.1' || host.startsWith('127.')) {
            continue;
          }
        } catch {
          // ignore parse errors; treat as normal match
        }
      }

      const index = match.index ?? 0;
      const line = Number.isFinite(index) ? lineFromIndex(content, index) : null;
      const snippet = snippetFromIndex(content, index);

      let points = rule.points;
      let severity = rule.severity;
      let reason = rule.reason;
      const isDoc = isDocLikePath(file.path);
      const isScript = isShellScriptPath(file.path);
      let scoreKey = `file:${file.path}|rule:${rule.id}`;

      // Prevent score stacking from multiple eval/exec occurrences across different files.
      // We still report all signals, but only score this rule once per scan.
      if (rule.id === 'eval_exec') {
        scoreKey = `rule:${rule.id}|dim:${rule.dimension}`;
      }

      if (rule.type === 'download-and-run') {
        const urlStr = extractUrlNearIndex(content, index);
        let parsedUrl: URL | null = null;
        try {
          if (urlStr) parsedUrl = new URL(urlStr);
        } catch {
          parsedUrl = null;
        }

        if (isDoc && !isScript) {
          points = Math.min(points, 35);
          severity = 'medium';
          reason =
            'Installation command pipes downloaded content into a shell. Common, but risky without verification (checksums/signatures).';
        }

        if (parsedUrl && isTrustedHost(parsedUrl.hostname, trustedInstallerHosts)) {
          points = Math.min(points, 30);
          severity = 'medium';
          reason =
            'Downloads and executes an installer from a well-known domain. Still prefer verification (checksums/signatures) when available.';
        }

        if (parsedUrl && (parsedUrl.protocol !== 'https:' || isIpHost(parsedUrl.hostname))) {
          points = Math.max(points, 70);
          severity = 'high';
          reason =
            'Downloads content and pipes it into a shell from a suspicious URL (non-HTTPS or IP-based host).';
        }

        if (
          isDoc &&
          !isScript &&
          parsedUrl &&
          parsedUrl.protocol === 'https:' &&
          !isIpHost(parsedUrl.hostname) &&
          isTrustedHost(parsedUrl.hostname, trustedInstallerHosts)
        ) {
          const host = parsedUrl?.hostname?.toLowerCase() ?? 'no-host';
          const transport = parsedUrl
            ? parsedUrl.protocol === 'https:'
              ? 'https'
              : 'not-https'
            : 'no-url';
          const hostType = parsedUrl && isIpHost(host) ? 'ip' : 'host';
          const trust =
            parsedUrl && isTrustedHost(host, trustedInstallerHosts) ? 'trusted' : 'untrusted';
          scoreKey = `doc|dim:${rule.dimension}|type:${rule.type}|trust:${trust}|transport:${transport}|hostType:${hostType}|host:${host}`;
        }
      }

      signals.push({
        id: rule.id,
        dimension: rule.dimension,
        type: rule.type,
        severity,
        points,
        file: file.path,
        line: line ?? null,
        snippet,
        reason,
      });

      if (!scoreApplied.has(scoreKey)) {
        scoreApplied.add(scoreKey);
        dimensionScores[rule.dimension] = clamp(dimensionScores[rule.dimension] + points, 0, 100);
      }
    }
  }

  const dimensions = Object.fromEntries(
    (Object.keys(dimensionScores) as SkillStaticDimension[]).map((key) => {
      const score = clamp(dimensionScores[key], 0, 100);
      return [key, { score, level: levelFromScore(score) }];
    })
  ) as SkillStaticScanResult['dimensions'];

  const dimValues = Object.values(dimensionScores).sort((a, b) => b - a);
  const maxDim = dimValues[0] ?? 0;
  const restSum = dimValues.slice(1).reduce((sum, v) => sum + v, 0);
  const overallScore = clamp(Math.round(maxDim + restSum * 0.3), 0, 100);
  const overallLevel = levelFromScore(overallScore);

  return {
    rulesetVersion: SKILL_STATIC_SCAN_RULESET_VERSION,
    overall: {
      score: overallScore,
      level: overallLevel,
      compatRiskLevel: compatFromLevel(overallLevel),
      verdict: verdictFromLevel(overallLevel),
    },
    dimensions,
    signals: signals.slice(0, maxSignals),
    stats: {
      filesProvided: files.length,
      filesScanned,
      filesSkipped,
      bytesScanned,
      truncated,
    },
  };
}
