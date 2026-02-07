import {
  type SkillStaticScanFile,
  type SkillStaticSignal,
  lineFromIndex,
  prevNonWhitespaceChar,
  snippetFromIndex,
} from './static-scan/shared.js';

export type CodeSafetyCandidate = { signal: SkillStaticSignal; scoreKey: string | null };

const isJsTsPath = (path: string) => {
  const lower = path.toLowerCase();
  return (
    lower.endsWith('.js') ||
    lower.endsWith('.ts') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.mts') ||
    lower.endsWith('.cts')
  );
};

const isTestLikePath = (path: string) => {
  const p = path.replace(/\\/g, '/').toLowerCase();
  if (p.includes('/__tests__/')) return true;
  if (p.includes('/tests/')) return true;
  if (p.includes('/test/')) return true;
  if (/\.(test|spec)\.[mc]?[jt]sx?$/.test(p)) return true;
  return false;
};

const NETWORK_RE =
  /\bfetch\s*\(|\baxios\b|\bgot\b|\bnode-fetch\b|\bhttp\.\s*request\b|\bhttps\.\s*request\b|\bXMLHttpRequest\b/i;

const CHILD_PROCESS_RE =
  /\bchild_process\b|from\s+['"]node:child_process['"]|require\s*\(\s*['"]child_process['"]\s*\)/i;

const EXEC_CALL_RE = /\b(exec|spawn|execFile|spawnSync|execSync|execFileSync)\s*\(/g;
const EVAL_RE = /\beval\s*\(/g;
const NEW_FUNCTION_RE = /\bnew\s+Function\s*\(/g;
const PROCESS_ENV_RE = /\bprocess\.env\b/g;
const READFILE_RE = /\breadFileSync\s*\(|\breadFile\s*\(/g;

const BASE64_LITERAL_RE = /['"`]([A-Za-z0-9+/]{200,}={0,2})['"`]/g;

const CRYPTO_MINING_RE = /\b(stratum\+tcp|stratum\+ssl|xmrig|cryptonight|coinhive)\b/i;

const WS_PORT_RE = /new\s+WebSocket\s*\(\s*['"]ws:\/\/[^'"]+:(\d{2,5})[^'"]*['"]\s*\)/i;
const WS_ALLOWED_PORTS = new Set([80, 443, 3000, 8080, 8443]);

const mk = (
  file: string,
  content: string,
  id: string,
  opts: {
    index: number;
    dimension: SkillStaticSignal['dimension'];
    type: SkillStaticSignal['type'];
    severity: SkillStaticSignal['severity'];
    points: number;
    reason: string;
  },
  scoreKey: string
): CodeSafetyCandidate => {
  const line = Number.isFinite(opts.index) ? lineFromIndex(content, opts.index) : null;
  const snippet = snippetFromIndex(content, opts.index);
  return {
    scoreKey,
    signal: {
      id,
      file,
      dimension: opts.dimension,
      type: opts.type,
      severity: opts.severity,
      points: opts.points,
      line: line ?? null,
      snippet,
      reason: opts.reason,
    },
  };
};

/**
 * Context-gated JS/TS-focused code safety scan.
 *
 * Returns a small set of low-noise candidates. Scoring de-dupe is controlled via `scoreKey`.
 */
export function scanCodeSafetyFile(file: SkillStaticScanFile): CodeSafetyCandidate[] {
  if (!isJsTsPath(file.path)) return [];

  const content = typeof file.content === 'string' ? file.content : '';
  if (!content) return [];

  const out: CodeSafetyCandidate[] = [];
  const testLike = isTestLikePath(file.path);

  const urlLiterals = (() => {
    const urls: string[] = [];
    const re = /\b(?:https?:\/\/|wss?:\/\/|ws:\/\/)[^\s'"`)+]+/gi;
    for (let m = re.exec(content); m; m = re.exec(content)) {
      urls.push(m[0] ?? '');
      if (urls.length >= 10) break;
    }
    return urls;
  })();

  const hasRemoteUrlLiteral = (() => {
    for (const raw of urlLiterals) {
      try {
        const parsed = new URL(raw);
        const host = (parsed.hostname || '').toLowerCase();
        if (
          host === 'localhost' ||
          host === '0.0.0.0' ||
          host === '::1' ||
          host === '[::1]' ||
          host === '127.0.0.1' ||
          host.startsWith('127.')
        ) {
          continue;
        }
        return true;
      } catch {
        // ignore parse errors
      }
    }
    return false;
  })();

  const envKeys = (() => {
    const keys = new Set<string>();
    const dotRe = /\bprocess\.env\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
    const bracketRe = /\bprocess\.env\s*\[\s*['"]([^'"]+)['"]\s*\]/g;
    const destructureRe = /\{([^}]+)\}\s*=\s*process\.env\b/g;

    for (let m = dotRe.exec(content); m; m = dotRe.exec(content)) keys.add(m[1] ?? '');
    for (let m = bracketRe.exec(content); m; m = bracketRe.exec(content)) keys.add(m[1] ?? '');

    for (let m = destructureRe.exec(content); m; m = destructureRe.exec(content)) {
      const inner = (m[1] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const part of inner) {
        const k = part.split(':')[0]?.trim() ?? '';
        if (k) keys.add(k);
      }
    }

    return Array.from(keys);
  })();

  const hasAnyEnvAccess = /\bprocess\.env\b/.test(content);
  const hasSensitiveEnvAccess = (() => {
    if (!hasAnyEnvAccess) return false;
    if (envKeys.length === 0) return true;

    const safe = new Set([
      'HOME',
      'USERPROFILE',
      'PATH',
      'PWD',
      'SHELL',
      'TERM',
      'TMPDIR',
      'TEMP',
      'TMP',
      'PORT',
      'HOST',
      'HOSTNAME',
      'NODE_ENV',
      'CI',
      'HEADLESS',
      'DEBUG',
    ]);
    const sensitiveRe =
      /(token|secret|api[_-]?key|password|passwd|auth|session|private|cookie|jwt|bearer|ssh|key)/i;

    for (const raw of envKeys) {
      const k = raw.trim();
      if (!k) continue;
      if (safe.has(k.toUpperCase())) continue;
      if (sensitiveRe.test(k)) return true;
    }
    return false;
  })();

  if (CHILD_PROCESS_RE.test(content)) {
    EXEC_CALL_RE.lastIndex = 0;
    let m = EXEC_CALL_RE.exec(content);
    while (m) {
      const idx = m.index ?? 0;
      const fn = (m[1] ?? '').toLowerCase();
      if (fn === 'exec' && prevNonWhitespaceChar(content, idx - 1) === '.') {
        m = EXEC_CALL_RE.exec(content);
        continue;
      }
      out.push(
        mk(
          file.path,
          content,
          'dangerous_exec_child_process',
          {
            index: idx,
            dimension: 'remote_exec',
            type: 'suspicious',
            severity: 'high',
            points: 55,
            reason:
              'Uses Node child_process execution APIs (exec/spawn), which can run arbitrary commands.',
          },
          'codesafety|dim:remote_exec'
        )
      );
      break;
    }
  }

  EVAL_RE.lastIndex = 0;
  const evalM = EVAL_RE.exec(content);
  if (evalM) {
    out.push(
      mk(
        file.path,
        content,
        'dynamic_code_execution_eval',
        {
          index: evalM.index ?? 0,
          dimension: 'remote_exec',
          type: 'suspicious',
          severity: 'high',
          points: 45,
          reason: 'Uses eval(), which enables dynamic code execution and is high risk in skills.',
        },
        'codesafety|dim:remote_exec'
      )
    );
  }

  NEW_FUNCTION_RE.lastIndex = 0;
  const fnM = NEW_FUNCTION_RE.exec(content);
  if (fnM) {
    out.push(
      mk(
        file.path,
        content,
        'dynamic_code_execution_function',
        {
          index: fnM.index ?? 0,
          dimension: 'remote_exec',
          type: 'suspicious',
          severity: 'high',
          points: 45,
          reason:
            'Uses new Function(), which enables dynamic code execution and is high risk in skills.',
        },
        'codesafety|dim:remote_exec'
      )
    );
  }

  if (NETWORK_RE.test(content) && hasRemoteUrlLiteral && hasSensitiveEnvAccess) {
    PROCESS_ENV_RE.lastIndex = 0;
    const envM = PROCESS_ENV_RE.exec(content);
    if (envM) {
      out.push(
        mk(
          file.path,
          content,
          'env_harvesting_and_network',
          {
            index: envM.index ?? 0,
            dimension: 'secret_access',
            type: 'secret-access',
            severity: 'critical',
            points: 85,
            reason:
              'Reads process.env and also performs network activity, which can indicate token harvesting/exfiltration.',
          },
          'codesafety|dim:secret_access'
        )
      );
    }
  }

  if (NETWORK_RE.test(content) && hasRemoteUrlLiteral) {
    READFILE_RE.lastIndex = 0;
    const rfM = READFILE_RE.exec(content);
    if (rfM) {
      out.push(
        mk(
          file.path,
          content,
          'file_read_and_network',
          {
            index: rfM.index ?? 0,
            dimension: 'exfiltration',
            type: 'exfiltration',
            severity: 'high',
            points: 60,
            reason:
              'Reads local files and also performs network activity, which can indicate data exfiltration.',
          },
          'codesafety|dim:exfiltration'
        )
      );
    }
  }

  // Look for repeated "\\xNN" sequences (typical of obfuscated strings in JS/TS source).
  // This intentionally avoids matching common regex range patterns like "\\x00-\\x1f".
  const hexSeqRe = /(?:\\\\x[0-9a-fA-F]{2}){6,}/g;
  hexSeqRe.lastIndex = 0;
  const hexSeq = hexSeqRe.exec(content);
  if (hexSeq) {
    out.push(
      mk(
        file.path,
        content,
        'obfuscated_hex_escapes',
        {
          index: hexSeq.index ?? 0,
          dimension: 'obfuscation',
          type: 'obfuscation',
          severity: 'medium',
          points: 25,
          reason: 'Contains repeated \\\\xNN escape sequences, which can be used for obfuscation.',
        },
        'codesafety|dim:obfuscation'
      )
    );
  }

  const hasAtob = /\batob\s*\(/.test(content);
  const hasBufferFromBase64 =
    /\bBuffer\s*\.\s*from\s*\(/.test(content) && /['"]base64['"]/.test(content);
  if (hasAtob || hasBufferFromBase64) {
    BASE64_LITERAL_RE.lastIndex = 0;
    const b64m = BASE64_LITERAL_RE.exec(content);
    if (b64m) {
      out.push(
        mk(
          file.path,
          content,
          'obfuscated_large_base64_decode',
          {
            index: b64m.index ?? 0,
            dimension: 'obfuscation',
            type: 'obfuscation',
            severity: 'high',
            points: 60,
            reason: 'Decodes a large base64 payload, which is a common obfuscation technique.',
          },
          'codesafety|dim:obfuscation'
        )
      );
    }
  }

  const cm = CRYPTO_MINING_RE.exec(content);
  if (cm) {
    out.push(
      mk(
        file.path,
        content,
        'crypto_mining_strings',
        {
          index: cm.index ?? 0,
          dimension: 'remote_exec',
          type: 'suspicious',
          severity: 'critical',
          points: 90,
          reason: 'Contains crypto-mining related strings (e.g. stratum/xmrig).',
        },
        'codesafety|dim:remote_exec'
      )
    );
  }

  const ws = WS_PORT_RE.exec(content);
  if (ws) {
    const rawPort = Number(ws[1]);
    if (
      Number.isFinite(rawPort) &&
      rawPort > 0 &&
      rawPort <= 65535 &&
      !WS_ALLOWED_PORTS.has(rawPort)
    ) {
      out.push(
        mk(
          file.path,
          content,
          'suspicious_websocket_port',
          {
            index: ws.index ?? 0,
            dimension: 'exfiltration',
            type: 'suspicious',
            severity: 'medium',
            points: 30,
            reason: `Connects to a WebSocket on uncommon port ${rawPort}, which can indicate covert C2/exfiltration.`,
          },
          'codesafety|dim:exfiltration'
        )
      );
    }
  }

  if (testLike) {
    // Still report findings from tests, but don't let them affect scoring.
    return out.map((c) => ({ ...c, scoreKey: null }));
  }

  return out;
}
